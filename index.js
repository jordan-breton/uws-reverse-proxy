const http = require('http');

const {
	App : uWebSocketServer,
	SSLApp : uWebSocketSSLServer
} = require('uWebSockets.js');

const RequestDecoder = require('./lib/uWSRequestDecoder');
const requestDecoder = new RequestDecoder();

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

module.exports = {

	/**
	 * @param {module:http.Server} native
	 * @param {Object} [config]
	 * @see https://unetworking.github.io/uWebSockets.js/generated/interfaces/TemplatedApp.html
	 *
	 */
	createCompatibleUWSServer(native, config){
		const {
			uWebSocket = {},
			native : {
				port = 35974,
				on : {
					listen  = null
				} = {}
			} = {}
		} = config;

		if(listen && typeof listen !== 'function')throw new Error(
			'If specified, native.on.listen must be a function !'
		);

		let uWS;

		const isSSL = uwsSSLKeys.some(key => key in uWebSocket);
		if(isSSL){
			uWS = new uWebSocketSSLServer(uWebSocket);
		}else {
			uWS = new uWebSocketServer(uWebSocket);
		}

		uWS.any('/*', (res, req) => {
			const decoded = requestDecoder.createContext(req, res);

			const values = {
				for  : decoded.client.remoteAddress,
				port : 443,
				proto: isSSL ? 'https' : 'http'
			};

			['for', 'port', 'proto'].forEach(function(header) {
				decoded.request.headers['x-forwarded-' + header] =
					(decoded.request.headers['x-forwarded-' + header] || '') +
					(decoded.request.headers['x-forwarded-' + header] ? ',' : '') +
					values[header];
			});

			decoded.request.headers['x-forwarded-host'] = decoded.request.headers['x-forwarded-host']
													   || decoded.request.headers['host']
													   || '';

			const proxyRequest = http.request({
				hostname : '127.0.0.1',
				port,
				path : decoded.request.url,
				method : decoded.request.method,
				headers : Object.assign(
					{},
					decoded.request.headers,
					{

					}
				)
			}, response => {
				res.writeStatus(response.statusCode.toString());

				const headers = Object.assign({}, response.headers);

				writeHeaders(res, headers);

				response.on('data', chunk => {
					res.write(chunk);
				});

				response.on('close', () => {
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

		// We only want to listen on localhost, because uWS will proxy its request
		// in the native http Server
		native.listen(port, '127.0.0.1', listen || noop);

		return uWS;
	}
}