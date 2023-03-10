const http = require("http");

const {
	pipeline
} = require("stream");

const decodeRequest = require("./uWSRequestDecoder");
const writeHeaders = require("./uWSHeadersWriter");
const streamProxyResponseToUWSResponse = require('./streamProxyResponseToUWSResponse');

const RequestProxyStream = require("./RequestProxyStream");

function noop(){}

const UWS_SSL_KEYS = [
	'key_file_name',
	'cert_file_name'
];

/**
 * @param App uWebSocket.js App function
 * @param SSLApp uWebSocket.js SSLApp function
 * @param {module:http.Server} native
 * @param {Object.<string, string>} [uWebsocketConfig]
 * @param [uWebsocketConfig.server]
 * @param {Object} [uWebsocketConfig.config={}]
 * @param {boolean} [uWebsocketConfig.ssl=false]
 * @param {Object} [httpConfig={}]
 * @param {int} [httpConfig.port=35974]
 * @param {Object} [httpConfig.on={}]
 * @param {function} [httpConfig.on.listen=null]
 * @return {{ uWebSocket: Object, http: http.Server }}
 * @see https://unetworking.github.io/uWebSockets.js/generated/interfaces/TemplatedApp.html
 */
module.exports = function(
	App,
	SSLApp,
	native,
	uWebsocketConfig = {},
	httpConfig = {}
) {
	let ssl = (uWebsocketConfig || {}).ssl ?? false;

	const {
		server,
		config : uWSConfig = {},
		port : uWSPort = 443
	} = uWebsocketConfig || {};

	const {
		port = 35974,
		on: {
			listen = null
		} = {}
	} = httpConfig || {};

	if (listen && typeof listen !== 'function') throw new Error(
		'If specified, native.on.listen must be a function !'
	);

	let uWS;

	if(server){
		uWS = server;
	}else{
		ssl = UWS_SSL_KEYS.some(key => key in uWSConfig);
		if (ssl) {
			uWS = App(uWebsocketConfig);
		} else {
			uWS = SSLApp(uWebsocketConfig);
		}
	}

	uWS.any('/*', (res, req) => {
		const decoded = decodeRequest(res, req);

		const values = {
			for: decoded.client.remoteAddress,
			port: uWSPort,
			proto: ssl ? 'https' : 'http'
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

		const abortController = new AbortController();

		// Send the request to the proxied express server
		const proxyRequest = http.request({
			hostname: '127.0.0.1',
			port,
			path: decoded.request.url + '?' + decoded.request.query,
			method: decoded.request.method,
			headers: Object.assign(
				{},
				decoded.request.headers,
				{}
			),
			signal: abortController.signal
		}, response => {
			const headers = Object.assign({}, response.headers);

			// uWebSocket auto-append content-length. If we let the one set up by
			// express, the browser will error with code ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH
			delete headers['content-length'];

			// Writing in ONE IO at once.
			res.cork(() => {
				try{
					// Giving the proxied request's response back to the client
					res.writeStatus(response.statusCode.toString());
					writeHeaders(res, headers);
				}catch(err){
					// request abandoned
				}
			});

			streamProxyResponseToUWSResponse(
				res,
				response
			);
		});

		const requestProxyStream = new RequestProxyStream(res);

		requestProxyStream.addListener('error', (err) => {
			console.log(err);
		})

		// If the client abort the uWebSocket request, we must abort proxy's requests to express too.
		res.onAborted(() => {
			requestProxyStream.destroy(new Error(
				'Request aborted by client.'
			));

			try{
				proxyRequest.destroy();
			}catch(err){}

			abortController.abort();
		});

		// If express request is aborted, we must abort the client request
		abortController.signal.addEventListener('abort', () => {
			try{
				requestProxyStream.destroy(new Error('Request aborted by recipient server'));
			}catch(err){}

			try{
				// Try to close it. Will throw if already aborted, we can ignore it.
				res.close();
			}catch(err){}
		});

		pipeline(requestProxyStream, proxyRequest, () => {
			proxyRequest.end();
		});
	});

	// We only want to listen on localhost, because uWS will proxy its requests
	// in the native http Server
	native.listen(port, '127.0.0.1', listen || noop);

	return {
		uWebSocket: uWS,
		http: native
	};
};