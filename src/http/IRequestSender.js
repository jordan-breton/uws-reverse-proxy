/**
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
 * @property {Request} request
 * @property {Object} headers
 * @property {boolean} stale True when the response have been aborted
 * @property {sendCallback} callback
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
 * @name IRequestSender_close
 */