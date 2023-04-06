/**
 * @interface IRequestSender
 * @extends EventEmitter
 */

/**
 * @typedef {Object} Request
 * @property {Object} headers
 * @property {string} method
 * @property {string} path
 * @property {string} host
 * @property {number} port
 * @property {null|string|Buffer} [body=null]
 * @property {Object} [metadata={}]
 */

/**
 * @typedef {Object} Response
 * @property {Request} request
 * @property {Object} headers
 * @property {Readable} body
 * @property {number} statusCode
 * @property {string} statusMessage
 * @property {Object} metadata
 */

/**
 * @typedef {Function} sendCallback
 * @param {Error} err
 * @param {Response} [response]
 */

/**
 * @function
 * @name IRequestSender_send
 * @param {module:net.Socket} socket
 * @param {Request} request
 * @param {sendCallback} callback
 */

/**
 * @function
 * @name IRequestSender_acceptsMoreRequests
 * @return {boolean}
 */

/**
 * @function
 * @name IRequestSender_close
 */