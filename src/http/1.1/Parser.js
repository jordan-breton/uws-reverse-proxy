const { EventEmitter } = require('events');

const CHAR_COLON = 0x3a;
const CHAR_SPACE = 0x20;
const CHAR_NEW_LINE = 0x0a;
const CHAR_SEMICOLON = 0x3b;
const CHAR_CARRIAGE_RETURN = 0x0d;

// TODO: reject any CONNECT request

/**
 * Parse HTTP 1.1 stream. It extracts and parse Headers into an object, parse the status and the statusMessage too,
 * then parse tho body.
 *
 * It emits the following events:
 * - headers: when the headers are parsed
 * - body_chunk: when a body chunk have been parsed
 * @extends {IParser}
 */
class Parser extends EventEmitter{
	_headers = {};
	_headersRead = 0;
	_completed = {
		version: false,
		statusCode: false,
		statusMessage: false,
		headers: false,
		body: false,
		chunk: {
			header: false,
			body: false
		}
	}
	_statusCode = 0;
	_statusMessage = '';
	_version = '';
	_currentSymbol = '';
	_currentHeaderName = '';
	_encounteredEndOfLine = 0;

	_prevByte;

	_bodyChunked = false;
	_bodyLength;
	_bodyRead = 0;

	/**
	 * Number of bytes read from the current body chunk
	 * @type {number}
	 * @private
	 */
	_bodyChunkRead = 0;

	/**
	 * Total size of the current body chunk. We're waiting a chunk of that size.
	 * @type {number}
	 * @private
	 */
	_bodyChunkSize = undefined;

	_maxHeadersSize;

	constructor(
		{
			maxHeadersSize = 1024 * 8
		} = {}
	){
		super();

		this._maxHeadersSize = maxHeadersSize;
	}

	get expectedBodySize(){
		return this._bodyLength;
	}

	_completeVersion(byte){
		if(byte === CHAR_SPACE){
			this._version = this._currentSymbol;
			this._completed.version = true;
			this._currentSymbol = '';
		}else{
			this._currentSymbol += String.fromCharCode(byte);
		}
	}

	_completeStatusCode(byte){
		if(byte === CHAR_SPACE){
			this._statusCode = Number.parseInt(this._currentSymbol);
			this._completed.statusCode = true;
			this._currentSymbol = '';
		}else{
			this._currentSymbol += String.fromCharCode(byte);
		}
	}

	_completeStatusMessage(byte, prevByte){
		if(byte === CHAR_NEW_LINE && prevByte === CHAR_CARRIAGE_RETURN){
			this._statusMessage = this._currentSymbol;
			this._completed.statusMessage = true;
			this._currentSymbol = '';
		}else if(byte !== CHAR_CARRIAGE_RETURN){
			this._currentSymbol += String.fromCharCode(byte);
		}
	}

	_parseHeaders(data){
		for(let i = 0; i < data.length; i++){
			this._headersRead++;

			if(this._headersRead > this._maxHeadersSize){
				const error = new Error('Max headers size exceeded');
				error.code = 'E_HEADERS_TOO_BIG';

				this.emit('error', error);
			}

			if(this._completed.headers){
				this._parseBody(data.subarray(i, data.length));
				break;
			}

			const byte = data[i];
			const prevByte = this._prevByte;
			this._prevByte = byte;

			if(!this._completed.version){
				this._completeVersion(byte);
				continue;
			}else if(!this._completed.statusCode){
				this._completeStatusCode(byte);
				continue;
			}else if(!this._completed.statusMessage){
				this._completeStatusMessage(byte, prevByte);
				continue;
			}

			// If we are here, it means that we are parsing the headers
			switch(byte){
				case CHAR_COLON:
					this._encounteredEndOfLine = 0;

					this._currentHeaderName = this._currentSymbol.toLowerCase();
					this._currentSymbol = '';

					this._headers[this._currentHeaderName] = '';
					break;
				case CHAR_CARRIAGE_RETURN:
					break;
				case CHAR_NEW_LINE:
					if(prevByte !== CHAR_CARRIAGE_RETURN){
						const error = new Error(
							`Invalid HTTP response: expected carriage return before new`
							+ ` line after header ${this._currentHeaderName}`
						);

						error.code = 'E_INVALID_HEADER'

						this.emit('error', error);
					}

					this._encounteredEndOfLine++;

					if(this._encounteredEndOfLine === 1){
						this._headers[this._currentHeaderName] = this._currentSymbol;
						this._currentSymbol = '';
					} else if(this._encounteredEndOfLine === 2){
						this._encounteredEndOfLine = 0;
						this._completed.headers = true;

						if('transfer-encoding' in this._headers){
							this._headers['transfer-encoding'] = this._headers['transfer-encoding'].toLowerCase();
							this._bodyLength = undefined;
							this._bodyChunked = this._headers['transfer-encoding'].indexOf('chunked') !== -1;

							// As per RFC 7230, section 3.3.3, we should ignore the content-length header if the
							// transfer-encoding header is present
							delete this._headers['content-length'];
						}

						if(!this._bodyChunked && 'content-length' in this._headers){
							this._headers['content-length'] = Number.parseInt(this._headers['content-length']);

							// As per RFC 7230, section 3.3.2, we should close the connection if the content-length
							// header is not a valid number
							if(Number.isNaN(this._headers['content-length'])){
								const error = new Error('FATAL HTTP response error: invalid content-length. The connection MUST be closed.');
								error.code = 'E_INVALID_CONTENT_LENGTH';

								this.emit('error', error);
							}

							this._bodyLength = this._headers['content-length'];
						}

						// We notify listeners in which mode we will read the body
						// it's important in pipelined connections, because if we're in UNTIL_CLOSE
						// mode, the pipeline will be broken. Therefor, it must be immediately closed.
						if(!this._bodyChunked && this._bodyLength === undefined){
							this.emit('body_read_mode', 'UNTIL_CLOSE');
						}else if(this._bodyChunked){
							this.emit('body_read_mode', 'CHUNKED');
						}else if(this._bodyLength !== undefined){
							this.emit('body_read_mode', 'FIXED', this._bodyLength);
						}

						this.emit(
							'headers',
							{
								headers: this._headers,
								statusCode: this._statusCode,
								statusMessage: this._statusMessage,
								version: this._version
							}
						);
					}
					break;
				default:
					this._encounteredEndOfLine = 0;

					// We don't need the first space into the header value
					if(!this._currentSymbol && byte === CHAR_SPACE && prevByte === CHAR_COLON){
						continue;
					}

					this._currentSymbol += String.fromCharCode(byte);
					break;
			}
		}
	}

	_parseBody(data){
		/**
		 * Per RFC 7230, section 3.3.3, a message body must not be included in:
		 * - 1xx (Informational) response
		 * - 204 (No Content) response
		 * - 304 (Not Modified) response.
		 * @see https://greenbytes.de/tech/webdav/rfc7230.html#message.body.length
		 */
		if(
			this._statusCode < 200
			|| this._statusCode === 204
			|| this._statusCode === 304
			|| this._bodyLength === 0
		){
			this.emit('body_chunk', Buffer.alloc(0), true);

			// If we have data, we still must parse it. In our case, the response is complete.
			if(data.length > 0) process.nextTick(() => {
				this.feed(data);
			});

			return true;
		}

		if(this._bodyChunked){
			return this._parseChunkedBody(data);
		}else if(this._bodyLength !== undefined){
			return this._parseFixedBody(data);
		}else{
			return this._parseBodyUntilClose(data);
		}
	}

	_parseFixedBody(data){
		this._bodyRead += data.length;

		const isLast = this._bodyRead === this._bodyLength;
		this.emit('body_chunk', data, isLast);

		return isLast;
	}

	_resetChunk(){
		this._completed.chunk.header = false;
		this._completed.chunk.body = false;

		this._bodyChunkRead = 0;
		this._bodyChunkSize = undefined;
		this._currentSymbol = '';
		this._prevByte = undefined;
	}

	_handleChunkedBodyEnd(){
		if(this._currentSymbol.length === 0){
			const error = new Error('FATAL HTTP response error: chunk size not specified.');
			error.code = 'E_INVALID_CHUNK_SIZE';

			this.emit('error', error);
		}

		this._bodyChunkSize = parseInt(this._currentSymbol, 16);
		this._currentSymbol = '';
	}

	_parseChunkedBody(data){
		if(!this._completed.chunk.header){
			let i = 0;

			// Parsing the chunk header
			do{
				const byte = data[i];
				const prevByte = this._prevByte;
				this._prevByte = byte;

				i++;

				switch(byte){
					case CHAR_NEW_LINE:
						this._encounteredEndOfLine++;

						if(prevByte !== CHAR_CARRIAGE_RETURN){
							const error = new Error(
								'Invalid HTTP response: expected carriage return before'
								+ ' new line in chunk header'
							);

							error.code = 'E_INVALID_CHUNK_HEADER';

							this.emit('error', error);
						}

						if(this._currentSymbol.length !== 0){
							this._handleChunkedBodyEnd();
						}

						this._completed.chunk.header = true;

						// If the chunk size is 0, we're (almost) done
						if(this._bodyChunkSize === 0){
							this._completed.body = true;

							// We inform the listeners that the body is complete
							this.emit('body_chunk', Buffer.alloc(0), true);

							// We finally encountered the last end of line
							// the response body is complete
							if(this._encounteredEndOfLine === 2){
								// We still have data that belongs to the next response
								if(i < data.length - 1){
									this.reset();

									process.nextTick(() => {
										this.feed(data.subarray(i, data.length));
									});
								}

								// We're done
								return true;
							}
						}

						continue;
					case CHAR_SEMICOLON:

						// We reach a semicolon. For the first one, what follows is the chunk extension, which we don't
						// support. All subsequent semicolons separate other extensions. We just ignore all of them.
						if(this._bodyChunkSize !== undefined){
							this._handleChunkedBodyEnd();
						}
						continue;
					default:
						// We don't have the body chunk size yet, so we're still waiting for the
						// full length as a hex string
						if(this._bodyChunkSize === undefined){
							this._currentSymbol += String.fromCharCode(byte);
						}
				}
			}while(i < data.length && !this._completed.chunk.header);

			if(i === data.length){
				return false;
			}else{
				data = data.subarray(i, data.length);
			}
		}

		if(this._completed.chunk.header && !this._completed.chunk.body){
			this._bodyRead += data.length;
			this._bodyChunkRead += data.length;

			if(this._bodyChunkRead === this._bodyChunkSize){
				this._completed.chunk.body = true;
				this._resetChunk();
			}

			this.emit('body_chunk', data, false);

			return false;
		}
	}

	_parseBodyUntilClose(data){
		/**
		 * In this mode, isLast will always be false, because we don't know when the body will end.
		 * The listener must determine response end by listening to the connection close event.
		 */
		this.emit('body_chunk', data, false);

		return false;
	}

	feed(data){
		if(this._completed.headers){
			if(this._parseBody(data)){
				this.reset();
			}
		} else {
			this._parseHeaders(data);
		}
	}

	/**
	 * Force a parser reset. This is useful when a connection is closed while a response
	 * is being parsed. It will prevent the parser to stay in an inconsistent state.
	 *
	 * When responses are being piped, the parser will reset itself between each
	 * response, unless the parser emitted a body_read_mode event with 'UNTIL_CLOSE' value.
	 *
	 * If it happens to a connection used for pipelining, YOU MUST IMMEDIATELY CLOSE THE SAID
	 * CONNECTION. Otherwise, the parser will consider every following responses to belong to the same
	 * body.
	 *
	 * @warning Calling this method is dangerous and should be avoided if the connection
	 * is kept open. It should only be used when the connection is closed.
	 * @return {Parser}
	 */
	reset(){
		this._headers = {};
		this._headersRead = 0;

		this._completed = {
			version: false,
			statusCode: false,
			statusMessage: false,
			headers: false,
			body: false,
			chunk: {
				header: false,
				body: false
			}
		}
		this._statusCode = 0;
		this._statusMessage = '';
		this._version = '';

		this._currentSymbol = '';
		this._currentHeaderName = '';

		this._encounteredEndOfLine = 0;

		this._bodyLength = undefined;
		this._bodyChunked = false;
		this._bodyRead = 0;

		this._bodyChunkRead = 0;
		this._bodyChunkSize = undefined;

		this._prevByte = undefined;

		return this;
	}
}

module.exports = Parser;