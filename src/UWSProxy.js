const http         = require("http");
const https        = require("https");
const { pipeline } = require("stream");

const {
	decodeRequest,
	writeHeaders
} = require('./utils/uwsHelpers');

const streamToUWSResponse = require("./streams/streamToUWSResponse");
const UWSBodyStream = require("./streams/UWSBodyStream");

/**
 * @private
 * Used as node:http.Server listen callback if no one is provided.
 */
function noop(){}

/**
 * @private
 * List of keys in uWebSocket config object that indicates that our server is using SSL encryption.
 * @type {string[]}
 */
const UWS_SSL_KEYS = [
	'key_file_name',
	'cert_file_name'
];

const uwsConfigSymbol = Symbol('uwsConfig'),
	  httpConfigSymbol = Symbol('httpConfig');

class UWSProxy {
	static createHTTPConfig(httpServer, config = {}){
		const {
			port = 35974,
			host = '127.0.0.1',
			quiet = false,
			on: {
				listen = noop
			} = {}
		} = config || {};

		if(httpServer instanceof https.Server){
			throw new Error('node:https.Server not supported. Please provide a node:http.Server');
		}

		if(!(httpServer instanceof http.Server)){
			throw new Error('First argument must be an instance of node:http.Server');
		}

		if (config.on.listen && typeof listen !== 'function') throw new Error(
			'If specified, on.listen must be a function !'
		);

		if(!httpServer.listening){
			httpServer.listen(port, host, listen);
		}else if(!config.port && !quiet){
			console.warn(
				'[WARN] UWebSocketProxy: you provided a listening node:http.Server.'
				+ 'No port was provided through the configuration object. The guessed port is the'
				+ ' default one (35974).'
				+ 'Make sure this port is the listening port of the node:http.Server instance you'
				+ ' provided. (to suppress this warning, specify "config.port" or set'
				+ ' "config.quiet" to "true")'
			);
		}

		return {
			config,
			host,
			port,
			server: httpServer,

			// We want to be able to check if configuration has been constructed through this
			// function in the constructor. It enforces valid configuration and avoid us to have
			// to validate it.
			[httpConfigSymbol]: true
		};
	}

	static createUWSConfig(uWebSocket, opts = {}){
		if(!uWebSocket){
			throw new Error(
				"First argument required! Must be either the uWebSocket.js package itself"
				+ " (require('uWebSocket.js')) or an instance of"
				+ " uWebSocket.js:App / uWebSocket.js:SSLApp"
			);
		}

		const {
			App,
			SSLApp
		} = uWebSocket;

		let {
			ssl = null,
			port = 443,
			quiet = false,
			config = {}
		} = opts || {};

		if(!port){
			throw new Error('opts.ports must be specified!');
		}else if(!opts.port && !quiet){
			console.warn(
				"[WARN] UWebSocketProxy: No port was specified in opts."
				+ " Default port used is 443."
			)
		}

		let uwsServer;

		if(!App && !SSLApp){
			// If App and SSLApp ar undefined, we try to determine if the first argument is a
			// constructed App or SSLApp itself. Since the uWebSocket.js package do not expose those
			// classes, we have to guess using a hacky way? It's not reliable because it may be
			// changed by the maintainer later, but it's all we have.
			if(!uWebSocket.constructor?.name?.startsWith('uWS.')){
				throw new Error(
					"The first argument doesn't seems to be a uWebSocket.js app"
					+ " nor the uWebSocket.js package itself."
				);
			}else{
				if(ssl === null){
					ssl = uWebSocket.constructor.name === 'uWS.SSLApp';
				}

				uwsServer = uWebSocket;
			}
		}else{
			if(ssl === null){
				ssl = UWS_SSL_KEYS.some(key => key in config);
			}

			if(ssl) uwsServer = SSLApp(config);
			else uwsServer = App(config);
		}

		return {
			config,
			server: uwsServer,
			ssl,
			port,

			// We want to be able to check if configuration has been constructed through this
			// function in the constructor. It enforces valid configuration and avoid us to have
			// to validate it.
			[uwsConfigSymbol]: true
		}
	}

	#uwsConfig;
	#httpConfig;
	#opts;

	constructor(uwsConfig, httpConfig, opts = {}) {
		if(!uwsConfig[uwsConfigSymbol]){
			throw new Error(
				'Untrusted uWebSocket configuration. Please provide a trusted config with'
				+ ' UWebSocketProxy.createUWSConfig()'
			);
		}

		if(!httpConfig[httpConfigSymbol]){
			throw new Error(
				'Untrusted http configuration. Please provide a trusted config with'
				+ ' UWebSocketProxy.createHTTPConfig()'
			);
		}

		const {
			routes = null,
			headers = {},
			on = {},
			backpressure: {
				maxStackedBuffers = 4096
			} = {}
		} = opts || {};

		this.#uwsConfig = uwsConfig;
		this.#httpConfig = httpConfig;
		this.#opts = {
			backpressure: {
				maxStackedBuffers
			},
			headers: headers || {},
			routes: routes || {
				any: '/*'
			},
			on
		};
	}

	start(){
		const { routes } = this.#opts;
		const { server: uwsServer } = this.#uwsConfig;

		Object.keys(routes).forEach(method => {
			uwsServer[method](routes[method], this.#handleRequest.bind(this));
		});
	}

	#handleRequest(uwsResponse, uwsRequest){
		const {
			ssl,
			port: publicPort
		} = this.#uwsConfig;

		const {
			host: privateHost,
			port: privatePort
		} = this.#httpConfig;

		const {
			backpressure: { maxStackedBuffers },
			headers: optsHeaders,
			on: {
				error: errorHandler = null
			} = {}
		} = this.#opts;

		const decoded = decodeRequest(uwsResponse, uwsRequest);

		const proxyHeaders = {
			for: decoded.client.remoteAddress,
			port: publicPort,
			proto: ssl ? 'https' : 'http'
		};

		['for', 'port', 'proto'].forEach(function (header) {
			decoded.request.headers['x-forwarded-' + header] =
				(decoded.request.headers['x-forwarded-' + header] || '') +
				(decoded.request.headers['x-forwarded-' + header] ? ',' : '') +
				proxyHeaders[header];
		});

		decoded.request.headers['x-forwarded-host'] = decoded.request.headers['x-forwarded-host']
			|| decoded.request.headers['host']
			|| '';

		const abortController = new AbortController();

		// Forward the request to the http server
		const forwardedRequest = http.request({
			hostname: privateHost,
			port: privatePort,
			path: decoded.request.url + '?' + decoded.request.query,
			method: decoded.request.method,
			headers: Object.assign(
				{},
				decoded.request.headers,
				optsHeaders
			),
			signal: abortController.signal
		}, httpResponse => {
			const headers = Object.assign({}, httpResponse.headers);

			// uWebSocket auto-append content-length. If we let the one set up by
			// express, the browser will error with code ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH
			delete headers['content-length'];

			uwsResponse.cork(() => {
				try{
					// Giving the proxied request's response back to the client
					uwsResponse.writeStatus(httpResponse.statusCode.toString());
					writeHeaders(uwsResponse, headers);
				}catch(err){
					// request probably aborted, we can ignore it
				}
			});

			streamToUWSResponse(uwsResponse, httpResponse);
		});

		const uwsBodyStream = new UWSBodyStream(uwsResponse, { maxStackedBuffers });
		uwsBodyStream.addListener('error', errorHandler || function (err){
			console.error(err);
		});

		// If the client abort the uWebSocket request, we must abort proxy's requests to the
		// http server too.
		uwsResponse.onAborted(() => {
			uwsBodyStream.destroy(new Error('Request aborted by client.'));

			forwardedRequest.destroy();
			abortController.abort();
		});

		// If http server's request is aborted, we must abort the client request, and maybe the
		// WebSocket response too.
		abortController.signal.addEventListener('abort', () => {
			uwsBodyStream.destroy(new Error('Request aborted by recipient server.'));

			try{
				// Try to close it. Will throw if already aborted, we can ignore it.
				uwsResponse.close();
			}catch(err){}
		});

		// All have been set up, let's pipe the body to the http server.
		pipeline(uwsBodyStream, forwardedRequest, () => {
			forwardedRequest.end();
		});
	}
}

module.exports = UWSProxy;