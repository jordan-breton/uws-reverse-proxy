const TextDecoder  = new (require('util').TextDecoder)();

/**
 * @private
 * @typedef UWSDecodedRequest
 * @property {Object} request
 * @property {string} request.url
 * @property {string} request.method
 * @property {string} request.query
 * @property {Object.<string, string|string[]>} request.headers
 * @property {Object} client
 * @property {string} client.remoteAddress
 * @property {string|null} client.proxiedRemoteAddress
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
	const context = {
		request : { headers : {} },
		client : { remoteAddress : '0.0.0.0', proxiedRemoteAddress : null}
	};

	uwsRequest.forEach((k,v)=>{ context.request.headers[k] = v; });
	context.request.url = uwsRequest.getUrl();
	context.request.method = uwsRequest.getMethod();
	context.request.query = uwsRequest.getQuery();

	context.client.remoteAddress = context.request.headers['x-forwarded-for'] ||
		TextDecoder.decode(uwsResponse.getRemoteAddressAsText());

	context.client.proxiedRemoteAddress = TextDecoder.decode(uwsResponse.getProxiedRemoteAddressAsText());

	if(context.client.proxiedRemoteAddress.length === 0)
		context.client.proxiedRemoteAddress = null;

	return context;
}

/**
 * Write the given headers to the provided uWebSockets.js response object.
 *
 * @private
 * @param {UWSResponse} uwsResponse
 * @param {Object.<string, string|string[]>} headers
 */
function writeHeaders(uwsResponse, headers){
	Object.keys(headers || {}).some(header => {
		if(['status', 'status code'].includes(header.toLowerCase())){
			uwsResponse.writeStatus(
				typeof headers[header] === 'string'
					? headers[header]
					: headers[header].toString()
			);

			delete headers[header];
			return true;
		}
	});

	Object.keys(headers || {}).forEach(header => {
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
}

module.exports = {
	writeHeaders,
	decodeRequest
};