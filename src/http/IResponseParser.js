/**
 * @file ResponseParser interface.
 */

/**
 * Parse an HTTP response.
 *
 * @interface IResponseParser
 * @extends {NodeJS.EventEmitter}
 * @property {int} expectedBodySize - The expected body size of the response.
 */

/**
 * @function
 * @name IResponseParser#feed
 * @param {Buffer} data
 */

/**
 * Force a parser reset. This is useful when a connection is closed while a response
 * is being parsed.
 *
 * @function
 * @name IResponseParser#reset
 */