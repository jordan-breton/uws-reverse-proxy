/**
 * @interface IDataResponseHandler
 * @extends {EventEmitter}
 */

/**
 * @event IDataResponseHandler_headers
 * @param {Object.<string, string>} parsed The parsed headers
 * @param {string} raw The raw headers string
 * @param {buffer} buffer The header buffer as received by the socket.
 */

/**
 * @event IDataResponseHandler_body_chunk
 * @param {buffer} chunk A body data chunk
 * @param {boolean} isLast `true` if this is the last chunk of the body
 */

/**
 * @function
 * @name IDataResponseHandler_handleSocketDataChunk
 * @param {buffer} data
 */