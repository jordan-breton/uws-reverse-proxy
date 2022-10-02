const http = require('http');

const decodeRequest = require('./lib/uWSRequestDecoder');

const RequestProxyStream = require('./lib/RequestProxyStream');
const { pipeline } = require('stream');

const uwsSSLKeys = [
	'key_file_name',
	'cert_file_name'
];

function noop(){}

function writeHeaders(res, headers){
	Object.keys(headers || {}).some(header => {
		if(['status', 'status code'].includes(header.toLowerCase())){
			res.writeStatus(
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
			headers[header].forEach(val => res.writeHeader(
				header,
				typeof val === 'string' ? val : val.toString()
			));
		} else res.writeHeader(
			header,
			typeof headers[header] === 'string'
				? headers[header]
				: headers[header].toString()
		);
	});
}

// We do not want to ship a specific version of uWebSocket.js
// TODO : handle version potential incompatibilities
module.exports = function(uWebSocketDep){
	const {
		App : uWebSocketServer,
		SSLApp : uWebSocketSSLServer
	} = uWebSocketDep;

	return {
		/**
		 * @param {module:http.Server} native
		 * @param {Object} [config]
		 * @see https://unetworking.github.io/uWebSockets.js/generated/interfaces/TemplatedApp.html
		 *
		 */
		createCompatibleUWSServer(native, config) {
			const {
				uWebSocket = {},
				native: {
					port = 35974,
					on: {
						listen = null
					} = {}
				} = {}
			} = config;

			if (listen && typeof listen !== 'function') throw new Error(
				'If specified, native.on.listen must be a function !'
			);

			let uWS, isSSL = false;

			if(uWebSocket instanceof uWebSocketServer || uWebSocket instanceof uWebSocketSSLServer){
				isSSL = uWebSocket instanceof uWebSocketSSLServer;
				uWS = uWebSocket;
			}else{
				isSSL = uwsSSLKeys.some(key => key in uWebSocket);
				if (isSSL) {
					uWS = new uWebSocketSSLServer(uWebSocket);
				} else {
					uWS = new uWebSocketServer(uWebSocket);
				}
			}

			uWS.any('/*', (res, req) => {
				const decoded = decodeRequest(res, req);

				const values = {
					for: decoded.client.remoteAddress,
					port: 443,
					proto: isSSL ? 'https' : 'http'
				};

				['for', 'port', 'proto'].forEach(function (header) {
					decoded.request.headers['x-forwarded-' + header] =
						(decoded.request.headers['x-forwarded-' + header] || '') +
						(decoded.request.headers['x-forwarded-' + header] ? ',' : '') +
						values[header];
				});

				decoded.request.headers['x-forwarded-host'] = decoded.request.headers['x-forwarded-host']
					|| decoded.request.headers['host']
					|| '';

				console.log(decoded.request.url, decoded.request.query);

				const proxyRequest = http.request({
					hostname: '127.0.0.1',
					port,
					path: decoded.request.url + '?' + decoded.request.query,
					method: decoded.request.method,
					headers: Object.assign(
						{},
						decoded.request.headers,
						{}
					)
				}, response => {
					const headers = Object.assign({}, response.headers);

					// Writing in ONE IO at once.
					res.cork(() => {
						// Giving the proxied request's response back to the client
						res.writeStatus(response.statusCode.toString());
						writeHeaders(res, headers);
					});

					// Dealing with request body stream
					response.on('data', chunk => {
						res.write(chunk);
					});

					response.on('close', () => {

						// TODO : empty the buffer in a cork.
						res.end();
					});
				});

				const requestProxyStream = new RequestProxyStream(res);

				res.onAborted(() => {
					requestProxyStream.destroy(new Error(
						'Request aborted by client.'
					));
				});

				pipeline(requestProxyStream, proxyRequest, () => {
					proxyRequest.end();
				});
			});

			// We only want to listen on localhost, because uWS will proxy its requests
			// in the native http Server
			native.listen(port, '127.0.0.1', listen || noop);

			return uWS;
		}
	}
}