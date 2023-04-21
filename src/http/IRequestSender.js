/**
 * Send a request on a raw TCP/UDP socket.
 *
 * @interface IRequestSender
 * @extends EventEmitter
 */

/**
 * uWebSockets.js HttpResponse
 * @see [HttpResponse Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpResponse.html)
 * @typedef {import("uWebSockets.js").HttpResponse} UWSResponse
 */

/**
 * @typedef {Object} Request
 * @property {Object} headers
 * @property {string} method
 * @property {string} path
 * @property {string} host
 * @property {number} port
 * @property {UWSResponse} response
 */

/**
 * @typedef {Object} Response
 * @property {string} status
 * @property {string} statusMessage
 * @property {Request} request
 * @property {Object} headers
 * @property {boolean} stale True when the response have been aborted for example. It allows to know
 *  if we still write into the response or just ignore the target server data (or even close the connection).
 * @property {sendCallback} callback The callback that will be called when the
 */

/**
 * @typedef {Function} sendCallback
 * @param {Error} err
 * @param {Response} [response]
 */

/**
 * @function
 * @name IRequestSender#send
 * @param {module:net.Socket} socket
 * @param {Request} request
 * @param {sendCallback} callback
 */

/**
 * @function
 * @name IRequestSender#acceptsMoreRequests
 * @return {boolean}
 */

/**
 * @function
 * @name IRequestSender#close
 * @param {Error} [err]
 */