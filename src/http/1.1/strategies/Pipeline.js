const {Readable} = require("stream");

/**
 * @private
 * @typedef {Object} PipelinedRequest
 * @property {Response} response
 * @property {sendCallback} callback
 */

/**
 * @implements ISendingStrategy
 */
class Pipeline {

	/**
	 * @type {PipelinedRequest[]} pendingRequests
	 */
	_pendingRequests = [];
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

		parser.on(
			'headers',
			({
				statusCode,
				statusMessage,
				headers
			}) => {
				this.setStatus(statusCode, statusMessage);
				this.setHeaders(headers);

				if (parser.expectedBodySize === 0) this.terminateRequest();
			}
		);

		parser.on('body_chunk', (chunk, isLast) => {
			this.addBody(chunk);

			if (isLast) this.terminateRequest();
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
			response: /** @type Response */ {
				request,
				body: new Readable({
					read() {}
				}),
				headers: {},
				statusCode: null,
				statusMessage: '',
				metadata: {
					startTime: process.hrtime(),
					bytes: 0
				}
			},
			callback: responseCallback
		};

		this._pendingRequests.push(pipelinedRequest);

		callback();
	}

	handleSocketDataChunk(chunk) {
		this._parser.feed(chunk);
	}

	/**
	 * Returns the first-in request
	 * @return {PipelinedRequest}
	 */
	peek() {
		if (this._pendingRequests.length > 0) {
			return this._pendingRequests[0];
		}
	}

	/**
	 * Adds the given number of bytes to the first-in request
	 * @param {int} count
	 */
	addByteCount(count) {
		const pipelinedRequest = this.peek().response.metadata;
		if (pipelinedRequest) {
			pipelinedRequest.bytes += count;
		}
	}

	/**
	 * Adds the given data to the first-in request body
	 * @param {Buffer} data
	 */
	addBody(data) {
		const pipelinedRequest = this.peek().response;
		if (pipelinedRequest) {
			pipelinedRequest.body.push(data);
			this.addByteCount(data.length);
		}
	}

	setStatus(statusCode, statusMessage) {
		const pipelinedRequest = this.peek();
		if (pipelinedRequest) {
			pipelinedRequest.response.statusCode = statusCode;
			pipelinedRequest.response.statusMessage = statusMessage;
		}
	}

	setHeaders(headers) {
		const pipelinedRequest = this.peek();
		if (pipelinedRequest) {
			pipelinedRequest.response.headers = headers;
			pipelinedRequest.response.metadata.headersTime = process.hrtime();

			process.nextTick(() => {
				pipelinedRequest.callback(null, pipelinedRequest.response);
			});
		}
	}

	size() {
		return this._pendingRequests.length;
	}

	/** Terminates the first-in request
	 * This will calculate the request duration, remove it from the queue and return its data
	 * @return {PipelinedRequest}
	 **/
	terminateRequest() {
		if (this._pendingRequests.length > 0) {
			const data = this._pendingRequests.shift();
			const hrduration = process.hrtime(data.response.metadata.startTime);
			data.response.metadata.duration = hrduration[0] * 1e3 + hrduration[1] / 1e6;

			data.response.body.push(null);

			return data;
		}
	}

	close() {
		this._pendingRequests.forEach(pipelinedRequest => {
			const err = new Error('Request aborted');
			err.code = 'E_PIPELINE_ABORTED';

			pipelinedRequest.callback(err, pipelinedRequest.response)

			// We destroy the response stream with error.
			pipelinedRequest.response.body.destroy(err);

			if (pipelinedRequest.response.request.body) {
				// If any, We destroy the request body stream to ensure it is closed.
				// We don't need it anymore.
				pipelinedRequest.response.request.body.destroy();
			}
		});

		this._pendingRequests = [];
	}

	/**
	 * Returns a copy of the queue
	 * @return {PipelinedRequest[]}
	 */
	toArray() {
		return this._pendingRequests.slice();
	}
}

module.exports = Pipeline;