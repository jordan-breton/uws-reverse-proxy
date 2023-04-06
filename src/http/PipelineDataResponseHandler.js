const { EventEmitter } = require('events');

const HEADER_DELIMITER = '\r\n\r\n';
const RESPONSE_TAIL = '\r\n0\r\n\r\n';

/**
 * @implements IDataResponseHandler
 */
class PipelineDataResponseHandler extends EventEmitter{

	// region Private properties

	_headersCompleted;
	_partialHeaders;
	_partialHeadersStr;

	_bodyLength;
	_lastBodyChunk;
	_lastBodyChunkStr;

	// endregion

	constructor() {
		super();

		this._initHeaders();
		this._initBody();
	}

	// region Private methods

	_initHeaders(){
		this._headersCompleted = false;
		this._partialHeaders = [];
		this._partialHeadersStr = '';
	}

	_initBody(){
		this._bodyLength = undefined;
		this._lastBodyChunk = Buffer.alloc(0);
		this._lastBodyChunkStr = '';
	}

	_handleHeadersChunk(data){
		this._partialHeadersStr += data.toString();
		this._partialHeaders.push(data);

		const headersEnd = this._partialHeadersStr.indexOf(HEADER_DELIMITER);
		if(headersEnd < 0){
			// We need more data, headers are not complete
			return;
		}

		// Headers completed
		const buffer = Buffer.concat(this._partialHeaders);
		const headersBuffer = buffer.subarray(0, headersEnd + HEADER_DELIMITER.length);
		this._partialHeadersStr = this._partialHeadersStr.substring(0, headersEnd);

		const parsedHeaders = {};

		const split = this._partialHeadersStr.split('\r\n');
		const [ statusCode, statusMessage ] = split.shift().split(' ').slice(1);

		split.forEach((header) => {
			if(!header.length) return;

			const [key, value] = header.split(': ');
			parsedHeaders[key.toLowerCase()] = value;
		});

		if(parsedHeaders['content-length']){
			this._bodyLength = Number.parseInt(parsedHeaders['content-length']);
		}else if(parsedHeaders['transfer-encoding'] === 'chunked'){
			this._bodyLength = undefined;
		}

		this.emit('headers', {
			statusCode: Number.parseInt(statusCode),
			statusMessage,
			headers: parsedHeaders,
			rawHeaders: this._partialHeadersStr,
			rawHeadersBuffer: headersBuffer
		});

		// Data may be appended to the headers, so we need to parse them.
		const bodyStart = buffer.subarray(headersEnd + HEADER_DELIMITER.length);

		this._initHeaders();
		this._headersCompleted = true;

		if(bodyStart.length > 0){
			process.nextTick(() => {
				this._handleBodyChunk(bodyStart);
			});
		}
	}

	_handleBodyChunk(data){
		if(this._bodyLength !== undefined){
			// We know the response length with content-length, so we check if the next response data is already in
			// the buffer
			if(data.length + this._lastBodyChunk.length >= this._bodyLength){
				// we add the corresponding amount of data to the body
				this.emit('body_chunk', data.subarray(0, this._bodyLength - this._lastBodyChunk.length), true);

				// Response complete.
				this._initBody();
				this._headersCompleted = false;

				// Next response headers may be appended to the body, so we need to parse them
				const nextResponseStart = data.subarray(this._bodyLength - this._lastBodyChunk.length);
				if(nextResponseStart.length > 0){
					process.nextTick(() => {
						this._handleHeadersChunk(nextResponseStart);
					});
				}
			}else{
				// We don't have the whole response yet, we add the data to the body and wait
				// for more
				this.emit('body_chunk', data, false);
			}
		}else{
			// we do not know the response length (transfert-encoding: chunked), so we must search
			// for the end of the response in data
			const currentCompare = this._lastBodyChunkStr + data.toString();
			this._lastBodyChunk = data.subarray(0);
			this._lastBodyChunkStr = this._lastBodyChunk.toString();

			const responseEnd = currentCompare.indexOf(RESPONSE_TAIL);
			if(responseEnd < 0){
				// We need more data, the response is not complete
				this.emit('body_chunk', data, false);
			}else{
				// Response complete
				this.emit('body_chunk', data.subarray(0, responseEnd), true);

				this._initBody();
				this._headersCompleted = false;

				// Next response headers may be appended to the body, so we need to parse them
				const nextResponseStart = data.subarray(responseEnd + RESPONSE_TAIL.length);
				if(nextResponseStart.length > 0){
					process.nextTick(() => {
						this._handleHeadersChunk(nextResponseStart);
					});
				}
			}
		}
	}

	// endregion

	get expectedBodyLength(){
		return this._bodyLength;
	}

	handleSocketDataChunk(data){
		if(this._headersCompleted){
			this._handleBodyChunk(data);
		} else {
			this._handleHeadersChunk(data);
		}
	}
}

module.exports = PipelineDataResponseHandler;