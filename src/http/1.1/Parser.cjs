/**
 * @file HTTP 1.1 parser class.
 */

const { EventEmitter } = require('events');

// region Private constants

const CHAR_COLON = 0x3a;
const CHAR_SPACE = 0x20;
const CHAR_NEW_LINE = 0x0a;
const CHAR_SEMICOLON = 0x3b;
const CHAR_CARRIAGE_RETURN = 0x0d;

const EMPTY_BUFFER = Buffer.alloc(0);

const HEADER_CONTENT_LENGTH = 'content-length';
const HEADER_TRANSFER_ENCODING = 'transfer-encoding';

const EVT_HEADERS = 'headers';
const EVT_BODY_CHUNK = 'body_chunk';
const EVT_ERROR = 'error';
const EVT_BODY_READ_MODE = 'body_read_mode';
const EVT_RESET = 'reset';

const BODY_READ_MODE = {
	UNTIL_CLOSE: 'UNTIL_CLOSE',
	FIXED: 'FIXED',
	CHUNKED: 'CHUNKED',
};

// endregion

/**
 * Parse HTTP 1.1 stream. It extracts and parse Headers into an object, parse the status and the statusMessage too,
 * then parse tho body.
 *
 * It emits the following events:
 * - headers: when the headers are parsed
 * - body_chunk: when a body chunk have been parsed
 * - error: when an error occurs.
 *
 * Error codes:
 *
 * - **E_INVALID_CONTENT_LENGTH**: when the content-length header is evaluated to NaN by Number
 * - **E_INVALID_CHUNK_SIZE**: when the chunk size is missing or is evaluated to NaN by Number.parseInt(,16).
 *
 * Among the above errors, the parser CAN'T RECOVER from E_INVALID_CONTENT_LENGTH and E_INVALID_CHUNK_SIZE.
 * THose errors are fatal and must lead to a connection close and a parser reset.
 *
 * @warning This parser do not fully implements the HTTP 1.1 specification. It's a very basic implementation.
 * 			Especially when it comes to security. In our case, the response source can be trusted, since this
 * 		    parser is used to parse the response of a well-known server. It's also why we use Number() and Number.parseInt()
 * 		    despite the fact they are unsafe because too lax.
 *
 * 		    Never use this parser to query unknown/untrusted servers.
 *
 * @implements {IResponseParser}
 */
class Parser extends EventEmitter {
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
			body: false,
		},
	};
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
	 * Number of bytes read from the current body chunk.
	 *
	 * @type {number}
	 * @private
	 */
	_bodyChunkRead = 0;

	/**
	 * Total size of the current body chunk.
	 *
	 * @type {number}
	 * @private
	 */
	_bodyChunkSize = undefined;

	constructor() {
		super();
	}

	get expectedBodySize() {
		return this._bodyLength;
	}

	feed(data) {
		if (data.length === 0) {
			return;
		}

		// One pass, no recursion
		// It's a long one, but it's the most efficient way to do it
		// on a continuous stream I could come up with
		for (let i = 0; i < data.length; i++) {
			const byte = data[i];
			const prevByte = this._prevByte;
			this._prevByte = byte;

			if (!this._completed.headers) {
				if (!this._completed.version) {
					if (byte === CHAR_SPACE) {
						this._version = this._currentSymbol;
						this._completed.version = true;
						this._currentSymbol = '';
					} else {
						this._currentSymbol += String.fromCharCode(byte);
					}

					continue;
				} else if (!this._completed.statusCode) {
					if (byte === CHAR_SPACE) {
						this._statusCode = Number(this._currentSymbol);
						this._completed.statusCode = true;
						this._currentSymbol = '';

						if (
							this._statusCode < 200
							|| this._statusCode === 204 // The spec says that 204 MUST NOT have a body because it's a response to a HEAD request
							|| this._statusCode === 304 // The spec says that 304 MUST NOT have a body
							|| this._statusCode === 302 && this.expectedBodySize === undefined
							|| this._statusCode === 307 && this.expectedBodySize === undefined
						) {
							this._bodyLength = 0;
							this._completed.body = true;
						}
					} else {
						this._currentSymbol += String.fromCharCode(byte);
					}

					continue;
				} else if (!this._completed.statusMessage) {
					if (byte === CHAR_NEW_LINE && prevByte === CHAR_CARRIAGE_RETURN) {
						this._statusMessage = this._currentSymbol;
						this._completed.statusMessage = true;
						this._currentSymbol = '';
					} else if (byte !== CHAR_CARRIAGE_RETURN) {
						this._currentSymbol += String.fromCharCode(byte);
					}

					continue;
				}

				// If we are here, it means that we are parsing the headers
				switch (byte) {
					case CHAR_COLON:
						this._encounteredEndOfLine = 0;

						if (this._currentHeaderName) {
							this._currentSymbol += ':'; // We add the colon back to the symbol
							continue;
						}

						this._currentHeaderName = this._currentSymbol.toLowerCase();
						this._currentSymbol = '';

						this._headers[this._currentHeaderName] = '';
						break;
					case CHAR_CARRIAGE_RETURN:
						break;
					case CHAR_NEW_LINE:
						this._encounteredEndOfLine++;

						if (this._encounteredEndOfLine === 1) {
							this._headers[this._currentHeaderName] = this._currentSymbol;
							this._currentHeaderName = '';
							this._currentSymbol = '';
						} else if (this._encounteredEndOfLine === 2) {
							this._encounteredEndOfLine = 0;
							this._completed.headers = true;

							if (HEADER_TRANSFER_ENCODING in this._headers) {
								this._headers[HEADER_TRANSFER_ENCODING] = this._headers[HEADER_TRANSFER_ENCODING].toLowerCase();
								this._bodyLength = undefined;
								this._bodyChunked = this._headers[HEADER_TRANSFER_ENCODING].indexOf('chunked') !== -1;

								// As per RFC 7230, section 3.3.3, we should ignore the content-length header if the
								// transfer-encoding header is present
								delete this._headers[HEADER_CONTENT_LENGTH];
							}

							if (!this._bodyChunked && HEADER_CONTENT_LENGTH in this._headers) {
								this._headers[HEADER_CONTENT_LENGTH] = Number.parseInt(this._headers[HEADER_CONTENT_LENGTH]);

								// As per RFC 7230, section 3.3.2, we should close the connection if the content-length
								// header is not a valid number
								if (Number.isNaN(this._headers[HEADER_CONTENT_LENGTH])) {
									const error = new Error(
										'FATAL HTTP response error: invalid content-length.'
										+ 'The connection MUST be closed.',
									);
									error.code = 'E_INVALID_CONTENT_LENGTH';

									this.emit(EVT_ERROR, error);

									// We stop the parser and ask for a reset until all other async
									// operations are finished
									this.reset();
								}

								this._bodyLength = this._headers[HEADER_CONTENT_LENGTH];
							}

							// We notify listeners in which mode we will read the body
							// it's important in pipelined connections, because if we're in UNTIL_CLOSE
							// mode and are using pipelining, it's up to the listener to reset the parser
							// when the connection is closed to terminate the request
							if (!this._bodyChunked && this._bodyLength === undefined) {
								this.emit(EVT_BODY_READ_MODE, BODY_READ_MODE.UNTIL_CLOSE);
							} else if (this._bodyChunked) {
								this.emit(EVT_BODY_READ_MODE, BODY_READ_MODE.CHUNKED);
							} else if (this._bodyLength !== undefined) {
								this.emit(EVT_BODY_READ_MODE, BODY_READ_MODE.FIXED, this._bodyLength);
							}

							this._currentHeaderName = '';

							this.emit(
								EVT_HEADERS,
								{
									headers: this._headers,
									statusCode: this._statusCode,
									statusMessage: this._statusMessage,
									version: this._version,
								},
							);
						}
						break;
					default:
						this._encounteredEndOfLine = 0;

						// We don't need the first space into the header value
						if (!this._currentSymbol && byte === CHAR_SPACE && prevByte === CHAR_COLON) {
							continue;
						}

						this._currentSymbol += String.fromCharCode(byte);
						break;
				}
			} else if (this._bodyLength === 0) {
				/**
				 * No body, we're done.
				 */

				this.emit(EVT_BODY_CHUNK, EMPTY_BUFFER, true);
				this._reset();
			} else if (this._bodyChunked) {
				/**
				 * BODY_READ_MODE.CHUNKED
				 * ----------------------
				 * In this mode, we must read the chunk size, then read the chunk data, then read the
				 * chunk terminator (CRLF), then read the next chunk size, and so on.
				 */

				if (this._completed.chunk.body) {
					switch (byte) {
						case CHAR_CARRIAGE_RETURN:
							continue;
						case CHAR_NEW_LINE:
							this._resetChunk();
					}
				} else if (!this._completed.chunk.header) {
					switch (byte) {

						// We ignore carriage return characters
						case CHAR_CARRIAGE_RETURN:
							continue;

						case CHAR_SEMICOLON:
							this._completed.chunk.extension = true;
							continue;

						// We have a newline character, it means that we have the chunk size
						case CHAR_NEW_LINE:
							this._encounteredEndOfLine++;

							this._completed.chunk.header = true;

							if (this._currentSymbol.length === 0) {
								const error = new Error(
									'FATAL HTTP response error: chunk size not specified.',
								);
								error.code = 'E_INVALID_CHUNK_SIZE';

								this.emit(EVT_ERROR, error);
								this.reset();

								return;
							}

							this._bodyChunkSize = Number.parseInt(this._currentSymbol, 16);

							if (Number.isNaN(this._bodyChunkSize)) {
								const error = new Error(
									'FATAL HTTP response error: invalid chunk size.',
								);
								error.code = 'E_INVALID_CHUNK_SIZE';

								this.emit(EVT_ERROR, error);
								this.reset();

								return;
							}

							this._currentSymbol = '';

							if (this._bodyChunkSize === 0) {
								this._completed.body = true;
								this._completed.chunk.body = true;

								// We inform the listeners that the body is complete
								this.emit(EVT_BODY_CHUNK, EMPTY_BUFFER, true);

								this._reset();
							}

							continue;

						// We're still parsing the chunk header
						default:
							if (!this._completed.chunk.extension) {
								this._currentSymbol += String.fromCharCode(byte);
							}
					}
				} else if (!this._completed.chunk.body) {
					this._encounteredEndOfLine = 0;

					const remainsToRead = this._bodyChunkSize - this._bodyChunkRead;
					const dataToRead = Math.min(data.length, i + remainsToRead) - i;

					if (dataToRead === 0) {
						return false;
					}

					this._bodyRead += dataToRead;
					this._bodyChunkRead += dataToRead;

					this.emit(EVT_BODY_CHUNK, data.subarray(i, i + dataToRead), false);

					if (this._bodyChunkRead === this._bodyChunkSize) {
						this._completed.chunk.body = true;
					}

					// We jump to the next chunk
					i+= dataToRead;
				} else {
					switch (byte) {
						case CHAR_CARRIAGE_RETURN:
							continue;
						case CHAR_NEW_LINE:
							this._encounteredEndOfLine++;
					}
				}
			} else if (this._bodyLength !== undefined) {
				/**
				 * BODY_READ_MODE.FIXED
				 * --------------------
				 * In this mode, we must read the body until we reach the content-length.
				 */

				const remainsToRead = this._bodyLength - this._bodyRead;
				const dataToRead = Math.min(data.length, i + remainsToRead) - i;

				this._bodyRead += dataToRead;

				const isLast = this._bodyRead === this._bodyLength;
				if (dataToRead > 0) {
					this.emit(EVT_BODY_CHUNK, data.subarray(i, i + dataToRead), isLast);

					i+= dataToRead;

					if (isLast) {
						this._reset();
					}
				}
			} else {
				/**
				 * BODY_READ_MODE.UNTIL_CLOSE
				 * --------------------------
				 * In this mode, isLast will always be false, because we don't know when the body will end.
				 * The listener must determine response end by listening to the connection close event and manually
				 * call the reset method.
				 */
				this.emit(EVT_BODY_CHUNK, data, false);
			}
		}
	}

	/**
	 * Resets synchronously the parser to its initial state.
	 *
	 * @private
	 */
	_reset() {
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
				body: false,
				extension: false,
			},
		};
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
	}

	/**
	 * Resets the chunk parser to its initial state.
	 *
	 * @private
	 */
	_resetChunk() {
		this._completed.chunk.header = false;
		this._completed.chunk.body = false;
		this._completed.chunk.extension = false;

		this._bodyChunkRead = 0;
		this._bodyChunkSize = undefined;
		this._currentSymbol = '';
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
	 */
	reset() {
		this._reset();
		this.emit(EVT_RESET);
	}
}

module.exports = Parser;