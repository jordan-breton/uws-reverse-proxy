const TextDecoder  = new (require('util').TextDecoder)();

/**
 * Decoded uWebSockets.js.HttpRequest.
 * @typedef UWSDecodedRequest
 * @property {string} url    Called URL
 * @property {string} method HTTP method (get, post, put, delete, etc.)
 * @property {string} query  Request's query string (part after ?)
 * @property {Object.<string, string|string[]>} headers Requests headers
 */

/**
 * @exports uwsHelpers/UWSDecodedRequest
 */

/**
 * Decode a uWebSockets.js request into a convenient object.
 *
 * @private
 * @param {UWSResponse} uwsResponse For whatever reason, some info can only be found in the response object.
 * @param {UWSRequest} uwsRequest The request object we want to decode
 * @return {UWSDecodedRequest}
 */
function decodeRequest(uwsResponse, uwsRequest){
	// noinspection JSValidateTypes
	/** @type {UWSDecodedRequest} */
	const request = {
		headers : {}
	};

	uwsRequest.forEach((k,v)=>{ request.headers[k] = v; });
	request.url = uwsRequest.getUrl();
	request.method = uwsRequest.getMethod();
	request.query = uwsRequest.getQuery();

	return request;
}

/**
 * Write the given headers to the provided uWebSockets.js response object.
 *
 * @private
 * @param {UWSResponse} uwsResponse
 * @param {Object.<string, string|string[]>} headers
 */
function writeHeaders(uwsResponse, headers){
	uwsResponse.cork(() => {
		if('status' in headers){
			uwsResponse.writeStatus(
				typeof headers['status'] === 'string'
					? headers['status']
					: headers['status'].toString()
			);

			delete headers['status'];
		}

		Object.keys(headers || {}).forEach(header => {
			//if(header === 'content-length') return;

			if(Array.isArray(headers[header])){
				headers[header].forEach(val => uwsResponse.writeHeader(
					header,
					typeof val === 'string' ? val : val.toString()
				));
			} else uwsResponse.writeHeader(
				header,
				typeof headers[header] === 'string'
					? headers[header]
					: headers[header].toString()
			);
		});
	});
}

module.exports = {
	writeHeaders,
	decodeRequest
};