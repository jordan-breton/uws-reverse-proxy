/**
 * @file SendingStrategy interface.
 */

/**
 * Allow to prepare a request to be sent and allow the consumer to know if the request can be sent.
 *
 * @interface ISendingStrategy
 */

/**
 * @type {import('../../IRequestSender').Request} Request
 */

/**
 * Schedule a request to be sent. When the request can be sent, the callback will be called.
 *
 * @function
 * @name ISendingStrategy#scheduleSend
 * @param {Request} request - The request to send.
 * @param {sendCallback} responseCallback - The callback to call when the response headers have been received.
 * @param {function} callback - The callback to call when the request CAN be sent.
 */

/**
 * @function
 * @name ISendingStrategy#acceptsMoreRequests
 * @returns {boolean} True if the strategy can accept more requests, false otherwise.
 */

/**
 * Close the strategy and the underlying requests, if any.
 *
 * @function
 * @name ISendingStrategy#close
 */