/**
 * @interface IParser
 * @extends {EventEmitter}
 * @property {int} expectedBodySize
 */

/**
 * @function
 * @name IParser#feed
 * @param {Buffer} data
 */

/**
 * Force a parser reset. This is useful when a connection is closed while a response
 * is being parsed.
 *
 * @function
 * @name IParser#reset
 */