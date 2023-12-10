const {
	writeHeaders
} = require('../../../utils/uwsHelpers');

const { Readable } = require('stream');

/**
 * @typedef {import('stream').Readable} Readable
 */


/**
 * Manage HTTP request pipeline. It eases the process of queueing requests to send responses back.
 *
 * @implements ISendingStrategy
 */
class Pipeline {

	// region Private properties

	/**
	 * @type {Response[]} pendingRequests
	 */
	_pendingRequests;

	/**
	 * @type {int} maxRequests that can be queued in the pipeline
	 * @private
	 */
	_maxRequests;

	/**
	 * @type {IResponseParser}
	 */
	_parser;

	/**
	 * Data stream fed by the parser, it allows us to manage backpressure and ease the pause/resume
	 * process to be sure to send data in the right order.
	 * @type {Readable}
	 * @private
	 */
	_dataStream;

	/**
	 * If true, the pipeline is locked and no request can be sent to the target server.
	 * It indicates that the server responded with no content-length header nor transfer-encoding: chunked.
	 * In that case, the spec indicates that the client should close the connection to end the response.
	 * @see https://greenbytes.de/tech/webdav/rfc7230.html#message.body.length point 7)
	 * @type {boolean} _lock
	 * @private
	 */
	_lock;

	// region Backpressure management

	/**
	 * The following properties are used to manage backpressure ONLY when we send a chunked
	 * response body to the client with a known size, because in this specific case, uWebSockets.js
	 * do not buffer the data for us.
	 *
	 * For transfer-encoding: chunked, uWebSockets.js will buffer the data for us, so we don't need
	 * to manage backpressure this way, pausing/resuming the stream is enough
	 */

	/**
	 * A buffer containing data under backpressure. As long as it have not been sent, no more data
	 * will be sent to the client.
	 * @type {Buffer} _pendingBuffer
	 * @private
	 */
	_pendingBuffer = undefined;

	/**
	 * Offset of the pending buffer. This is used to know where to start reading data from the buffer.
	 * @type {number}
	 * @private
	 */
	_pendingBufferOffset = 0;

	/**
	 * Total size of the pending response. It is used to compute the buffer offset from which we need
	 * to resume reading data.
	 * @type {number}
	 * @private
	 */
	_pendingRequestTotalSize = 0;

	// endregion

	// endregion

	/**
	 * @param {IResponseParser} parser Parser used to parse the response from the target server.
	 *                                 We will listen to its events to forward the data to the client.
	 * @param {Object} [options]
	 * @param {int} [options.maxRequests=1000] Default: `1000`. Maximum number of requests in the pipeline.
	 *                                         If the queue is full, the next request will be rejected.
	 *                                         Set to `0` to disable the limit.
	 */
	constructor(
		parser,
		{
			maxRequests = 1000
		} = {}
	) {
		this._parser = parser;
		this._pendingRequests = [];
		this._maxRequests = maxRequests;

		parser.on(
			'headers',
			({
				statusCode,
				statusMessage,
				headers
			}) => {
				this.setStatus(statusCode, statusMessage);
				this.setHeaders(headers);

				if ( parser.expectedBodySize === 0 ){
					const pipelinedRequest = this.peek();

					if ( !pipelinedRequest ) return;

					try{
						pipelinedRequest.request.response.end();
					}catch (err){

					}
					this.terminateRequest();
				}
			}
		);

		parser.on('body_chunk', (chunk, isLast) => {

			// Already ended the response in headers handler above.
			if(parser.expectedBodySize === 0) return;

			this._dataStream.push([ chunk, isLast ]);
		});

		parser.on('error', err => {

			// with a parsing error, things gone very bad. We have no choice but to
			// throw the whole pipeline away, otherwise all subsequent requests may be corrupted.

			this.close(err);
		})

		parser.on('body_read_mode', mode => {

			if(mode === 'UNTIL_CLOSE'){
				const pipelinedRequest = this.peek();

				if(!pipelinedRequest) return;

				// The pipeline is locked, it won't accept more request until this one is terminated.
				// Not that it will only be terminated when the client close the connection.
				this._lock = true;
			}
		});

		this._initDataStream();
	}

	/**
	 * Initialize a new dataStream that will receive data from the parser.
	 * @private
	 */
	_initDataStream(){
		this._dataStream = new Readable({
			objectMode: true,
			highWaterMark: 4096,

			read() {}
		});

		this._dataStream.on('data', ([ data, isLast ]) => {

			const pipelinedRequest = this.peek();

			if(!pipelinedRequest) return;

			if(pipelinedRequest.stale){

				// we must ignore the data until the last chunk, then throw the request away
				if(isLast){
					this.terminateRequest();
				}
			}else{
				this.addBody(data, isLast);
			}
		});

		this._dataStream.on('error', err => {

			// It should never happen. This stream is safely managed by this class, and only receives
			// data from the parser. If an error occurs, another part of the code is messing
			// with this private state.

			this.close(err);
		});
	}

	acceptsMoreRequests() {
		return !this._lock && (
			this._maxRequests === 0
			|| this._pendingRequests.length < this._maxRequests
		);
	}

	scheduleSend(request, responseCallback, callback) {
		if (this._maxRequests > 0 && this._pendingRequests.length >= this._maxRequests) {
			const error = new Error('Too many requests in the pipeline!');
			error.code = 'E_PIPELINE_OVERFLOW';

			throw error;
		}

		const pipelinedRequest = {
			request,
			status: undefined,
			statusMessage: undefined,
			headers: {},
			stale: false,
			callback: responseCallback
		};

		const uwsResponse = request.response;

		try{
			uwsResponse.onAborted(() => {

				// Mark the request as stale so the data we continue to receive can be ignored
				// until receiving the last chunk.
				pipelinedRequest.stale = true;

				// If it were paused, we must resume it to avoid a deadlock
				this._dataStream.resume();
			});

			uwsResponse.onWritable((offset) => {
				try{
					let [ ok ] = uwsResponse.tryEnd(
						this._pendingBuffer.subarray(offset - this._pendingBufferOffset),
						this._pendingRequestTotalSize
					);

					if(ok){
						this._dataStream.resume();
						this._pendingBuffer = undefined;
						this._pendingBufferOffset = 0;
						this._pendingRequestTotalSize = 0;
					}
				}catch(err){

					// nothing to do here, the response have been aborted, and the abort handler
					// takes care of the rest.
				}

				// We always have to return true/false in onWritable.
				// If you did not send anything, return true for success.
				return true;
			})
		}catch(err){
			if(uwsResponse.aborted){

				// Mark the request as stale so the data we continue to receive can be ignored
				// until receiving the last chunk, it allows us to not throw the entire pipeline for
				// an aborted request.
				pipelinedRequest.stale = true;
			}
		}

		this._pendingRequests.push(pipelinedRequest);

		setImmediate(() => {
			callback();
		});
	}

	/**
	 * Returns the first-in request
	 * @return {Response}
	 */
	peek() {
		if (this._pendingRequests.length > 0) {
			return this._pendingRequests[0];
		}
	}

	/**
	 * Send a chunk of data to the client through the uwsResponse in case of unknown body size.
	 * @param {Buffer} data    Chunk of data to send.
	 * @param {boolean} isLast If true, terminate the first-in request.
	 * @private
	 */
	_sendStreamChunk(data, isLast = false){
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		const uwsResponse = pipelinedRequest.request.response;

		// We're streaming
		try{
			uwsResponse.cork(() => {
				const ok = uwsResponse.write(data);
				if(!ok){

					// We have backpressure, we pause until uWebSockets.js tell us that the response
					// is writable.
					this._dataStream.pause();

					uwsResponse.onWritable(() => {
						if(isLast){
							uwsResponse.end();
							this.terminateRequest();
						}

						// Chunk sent, backpressure is gone, we can resume :)
						this._dataStream.resume();
						return true;
					});
				}else if(isLast){
					this.terminateRequest();
					uwsResponse.end();
				}
			});
		}catch(err){
			// The response have been aborted
		}
	}

	/**
	 * Sends a chunk of data to the client through the uwsResponse in case of fixed length response
	 * (with Content-Length header).
	 * @param {Buffer} data      Chunk of data to send
	 * @param {number} totalSize Content-Length header value
	 * @private
	 */
	_sendChunk(data, totalSize) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		const uwsResponse = pipelinedRequest.request.response;

		try{

			// Store where we are, globally, in our response
			let lastOffset = uwsResponse.getWriteOffset();

			uwsResponse.cork(() => {

				// Streaming a chunk returns whether that chunk was sent, and if that chunk was last
				let [ok, done] = uwsResponse.tryEnd(data, totalSize);

				// Did we successfully send last chunk?
				if (done) {
					this.terminateRequest();
				} else if (!ok) {
					this._dataStream.pause();

					// We set up the backpressure handling, see onWritable in scheduleSend
					this._pendingBuffer = data;
					this._pendingBufferOffset = lastOffset;
					this._pendingRequestTotalSize = totalSize;
				}
			});
		}catch(err){
			// Nothing more to do, the response have been aborted.
		}
	}

	/**
	 * Adds the given data to the first-in request body
	 * @param {Buffer} data
	 * @param {boolean} isLast If true, the request will be terminated
	 */
	addBody(data, isLast = false) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return

		if(pipelinedRequest.request.response.aborted){
			this.terminateRequest();
			return;
		}

		const headers = pipelinedRequest.headers;

		if(!('content-length' in headers)){
			this._sendStreamChunk(data, isLast);
		} else {
			this._sendChunk(data, headers['content-length']);
		}
	}

	/**
	 * Set the status code and message for the first-in request
	 * @param {int|string} statusCode
	 * @param {string} statusMessage
	 */
	setStatus(statusCode, statusMessage) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		pipelinedRequest.status = statusCode;
		pipelinedRequest.statusMessage = statusMessage;

		const uwsResponse = pipelinedRequest.request.response;

		try{
			uwsResponse.cork(() => {
				uwsResponse.writeStatus(`${statusCode} ${statusMessage}`);
			});
		}catch(err){
			// Nothing more to do, the response have been aborted.
		}
	}

	/**
	 * Set the headers for the first-in request
	 * @param {Object<string,string>} headers
	 */
	setHeaders(headers) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		pipelinedRequest.headers = headers;

		try{
			writeHeaders(pipelinedRequest.request.response, headers);
		}catch (err){
			// Nothing more to do, the response have been aborted.
		}
	}

	/**
	 * Returns the number of pending requests
	 * @return {number}
	 */
	size() {
		return this._pendingRequests.length;
	}

	/**
	 * Terminates the first-in request
	 * Remove the request from the queue and return its data
	 * @return {Response}
	 **/
	terminateRequest() {
		if (this._pendingRequests.length > 0) {
			const pipelinedRequest = this._pendingRequests.shift();

			this._lock = false;
			this._dataStream.resume();

			return pipelinedRequest;
		}
	}

	/**
	 * Terminates all pending requests
	 * @param {Error|null} [err=null] The error that caused a forced pipeline close.
	 */
	close(err = null) {
		let pipelinedRequest;

		if(!err){
			err = new Error('Request aborted');
			err.code = 'E_PIPELINE_ABORTED';
		}

		while(pipelinedRequest = this.terminateRequest()){
			if(pipelinedRequest.stale) continue;

			pipelinedRequest.callback(err, pipelinedRequest);

			const { body, response } = pipelinedRequest.request;

			if (response) {
				try{
					response.end();
				}catch(err){
					// Nothing more to do, the response have been aborted.
				}
			}

			// If any, We destroy the request body stream to ensure it is closed.
			// We don't need it anymore.
			if(body){
				body.destroy(err);
			}
		}

		this._initDataStream();
	}
}

module.exports = Pipeline;