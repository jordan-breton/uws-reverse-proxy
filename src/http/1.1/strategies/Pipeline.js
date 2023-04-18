const {
	writeHeaders
} = require('../../../utils/uwsHelpers');

const { Readable } = require('stream');

/**
 * @implements ISendingStrategy
 */
class Pipeline {

	/**
	 * @type {Response[]} pendingRequests
	 */
	_pendingRequests;
	_maxRequests;
	/**
	 * @type {IResponseParser}
	 */
	_parser;

	/**
	 * @param {IResponseParser} parser
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
		this._dataStream = new Readable({
			objectMode: true,

			read() {}
		});

		parser.on(
			'headers',
			({
				statusCode,
				statusMessage,
				headers
			}) => {
				this.setStatus(statusCode, statusMessage);
				this.setHeaders(headers);

				console.log('headers received, expected body size: ' + parser.expectedBodySize);
				console.log(headers);

				if (parser.expectedBodySize === 0) this.terminateRequest();
			}
		);

		parser.on('body_chunk', (chunk, isLast) => {
			console.log('pushing into stream', isLast);
			this._dataStream.push([ chunk, isLast ]);
		});

		parser.on('error', err => {
			console.log(err);
		})

		this._dataStream.on('data', ([ data, isLast ]) => {
			if(this.peek().stale){
				console.log('stale, ignoring data...');
				// we must ignore the data until the last chunk, then throw the request away
				if(isLast){
					console.log('stale request terminated');
					this.terminateRequest();
				}
			}else{
				console.log('not stale, adding body', isLast);
				this.addBody(data, isLast);
			}
		});

		this._dataStream.on('pause', () => {
			console.log('pause');
		});

		this._dataStream.on('resume', () => {
			console.log('resume');
		});

		this._dataStream.on('error', err => {
			console.log(err);

			this.close();
		});
	}

	acceptsMoreRequests() {
		return this._maxRequests === 0 || this._pendingRequests.length < this._maxRequests;
	}

	scheduleSend(request, responseCallback, callback) {
		if (this._maxRequests > 0 && this._pendingRequests.length >= this._maxRequests) {
			const error = new Error('Too many requests in the pipeline!');
			error.code = 'E_PIPELINE_OVERFLOW';

			throw error;
		}

		const pipelinedRequest = {
			request,
			headers: {},
			stale: false,
			callback: responseCallback
		};

		request.response.onAborted(() => {
			// Mark the request as stale so the data we continue to receive can be ignored
			// until receiving the last chunk.
			pipelinedRequest.stale = true;

			// If it were paused, we must resume it to avoid a deadlock
			this._dataStream.resume();
		});

		this._pendingRequests.push(pipelinedRequest);

		console.log(pipelinedRequest);

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
						if(isLast) this.terminateRequest();

						// Chunk sent, backpressure is gone, we can resume :)
						this._dataStream.resume();
						return true;
					});
				}else if(isLast){
					this.terminateRequest();
				}
			});
		}catch(err){
			// The response have been aborted
		}
	}

	_sendChunk(data, totalSize = 0, resumeIfOK = false) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		const uwsResponse = pipelinedRequest.request.response;

		try{
			/* Store where we are, globally, in our response */
			let lastOffset = uwsResponse.getWriteOffset();

			uwsResponse.cork(() => {
				/* Streaming a chunk returns whether that chunk was sent, and if that chunk was last */
				let [ok, done] = uwsResponse.tryEnd(data, totalSize);

				/* Did we successfully send last chunk? */
				if (done) {
					this.terminateRequest();
				} else if (!ok) {
					this._dataStream.pause();

					/* Register async handlers for drainage */
					uwsResponse.onWritable((offset) => {
						this._sendChunk(data.subarray(offset - lastOffset), totalSize, true);


						/* We always have to return true/false in onWritable.
						 * If you did not send anything, return true for success. */
						return ok;
					});
				}

				if(ok && resumeIfOK) this._dataStream.resume();
			});
		}catch(err){
			console.log(err);
			// Nothing more to do, the response have been aborted.
			// We still have to consume data from the parser. In pipelines, we
			// can't close connection without aborting all pending requests
		}
	}

	/**
	 * Adds the given data to the first-in request body
	 * @param {Buffer} data
	 * @param {boolean} isLast If true, the request will be terminated
	 */
	addBody(data, isLast = false) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest || !pipelinedRequest.request.response){
			if(isLast) this.terminateRequest();
			return;
		}

		const headers = pipelinedRequest.headers;

		if(!('content-length' in headers)){
			this._sendStreamChunk(data, isLast);
		} else {
			this._sendChunk(data, headers['content-length']);
		}
}

	setStatus(statusCode, statusMessage) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		const uwsResponse = pipelinedRequest.request.response;

		try{
			uwsResponse.cork(() => {
				uwsResponse.writeStatus(`${statusCode} ${statusMessage}`);
			});
		}catch(err){
			console.log(err);
			// Nothing more to do, the response have been aborted.
		}
	}

	setHeaders(headers) {
		const pipelinedRequest = this.peek();

		if(!pipelinedRequest) return;

		pipelinedRequest.headers = headers;

		try{
			writeHeaders(pipelinedRequest.request.response, headers);
		}catch (err){
			console.log(err);
			// Nothing more to do, the response have been aborted.
		}
	}

	size() {
		return this._pendingRequests.length;
	}

	/** Terminates the first-in request
	 * Remove the request from the queue and return its data
	 * @return {Response}
	 **/
	terminateRequest() {
		if (this._pendingRequests.length > 0) {
			console.log('terminating request');
			const pipelinedRequest = this._pendingRequests.shift();

			this._dataStream.resume();

			return pipelinedRequest;
		}
	}

	close() {
		// Nothing to do. We don't want to close responses here, since they may have received
		// data that can still be sent back to the client
	}
}

module.exports = Pipeline;