/**
 * @file Request sender interface.
 */

/**
 * Send a request on a raw TCP/UDP socket.
 *
 * @interface IRequestSender
 * @extends EventEmitter
 */

/**
 * uWebSockets.js HttpResponse
 *
 * @see [HttpResponse Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpResponse.html)
 * @typedef {import("uWebSockets.js").HttpResponse} UWSResponse
 */

/**
 * @typedef {Object} Request
 * @property {Object} headers - Request HTTP headers.
 * @property {string} method - Request HTTP method.
 * @property {string} path - Request path.
 * @property {string} host - Host to reach.
 * @property {number} port - Port to reach on host.
 * @property {UWSResponse} response - The uWebSocket.js response to write in when the request will receive a response.
 */

/**
 * @typedef {Object} Response
 * @property {string} status - The HTTP status code.
 * @property {string} statusMessage - The HTTP status message.
 * @property {Request} request - The request to send.
 * @property {Object} headers - THe headers to send along with the request.
 * @property {boolean} stale True when the response have been aborted for example. It allows to know
 * if we still write into the response or just ignore the target server data (or even close the connection).
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
 * @param {import("net").Socket | import("tls").TLSSocket} socket
 * @param {Request} request
 * @param {sendCallback} callback
 */

/**
 * @function
 * @name IRequestSender#acceptsMoreRequests
 * @returns {boolean} True if the request sender can accept more requests.
 */

/**
 * @function
 * @name IRequestSender#close
 * @param {Error} [err]
 */