// region Imports

const http         = require("http");
const https        = require("https");
const { pipeline } = require("stream");

const {
	decodeRequest,
	writeHeaders
} = require('./utils/uwsHelpers');

const streamToUWSResponse = require("./streams/streamToUWSResponse");
const UWSBodyStream = require("./streams/UWSBodyStream");

// endregion

// region Private declarations
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

/**
 * @private
 * Both symbols are used to ensure a configuration object have been created by the right
 * generator/config checker.
 *
 * This ensures the configuration is right and avoid us the hassle to check the configuration format
 * twice.
 */
const uwsConfigSymbol = Symbol('uwsConfig'),
	  httpConfigSymbol = Symbol('httpConfig');

// endregion
// region JSDOC typedefs

/**
 * @typedef UWSProxyHTTPConfigOpts
 * @property {int}      [port=35974]  Private port the HTTP server must listen to
 * @property {string}   [host="127.0.0.1"] HTTP host listening. Default is the loop-back address.
 * @property {boolean}  [quiet=false] Disable configuration warning printing
 * @property {Object}   [on={}]       Event listeners
 * @property {function} [on.listen]   Called when node:http.Server will start listening for incoming
 *                                    connections.
 */

/**
 * @typedef UWSProxyHTTPConfig
 * @property {UWSProxyHTTPConfigOpts} config Raw configuration passed to UWSProxy.createHTTPConfig
 * @property {int}         port              Listening port
 * @property {string}      host              Listening host
 * @property {module:http.Server} server     HTTP server used as proxy target
 */

/**
 * @private
 * @typedef {typeof import("uWebSockets.js")} UWS
 */

/**
 * @private
 * @typedef {typeof import("uWebSockets.js").TemplatedApp} UWSTemplatedApp
 */

/**
 * @private
 * @typedef {typeof import("uWebSockets.js").AppOptions} UWSAppOptions
 */

/**
 * @private
 * @typedef {typeof import("uWebSockets.js").HttpRequest} UWSRequest
 */

/**
 * @private
 * @typedef {typeof import("uWebSockets.js").HttpResponse} UWSResponse
 */

/**
 * @typedef UWSProxyUWSConfigOpts
 * @property {boolean|null} [ssl=null]     If true, inform the Proxy that trafic is encrypted (it
 *                                         matters to set proxy Headers and create (if not provided)
 *                                         an SSLApp instead of an App)
 * @property {int}           [port=443]    Public port uWebSocket server is listening to
 * @property {boolean}       [quiet=false] Disable configuration warning printing
 * @property {UWSAppOptions} [config={}]   See uWebSockets.js AppOptions
 */

/**
 * @typedef UWSProxyUWSConfig
 * @property {boolean}               ssl
 * @property {int}                   port
 * @property {UWSProxyUWSConfigOpts} config
 * @property {UWSTemplatedApp}       server
 */

/**
 * @typedef UWSProxyOpts
 * @property {Object} [backpressure={}]
 * @property {int}    [backpressure.maxStackedBuffers=4096]
 * @property {Object<string, string|string[]>} [headers={}] Additional headers always appended to
 *                                                          the proxy request (not on the client's
 *                                                          response)
 * @property {Object<string, string>} [routes] Routes we want the proxy request handlers to listen
 *                                             on
 * @property {Object<string, function>} [on={}] Collection of optional callbacks
 * @property {function|null} [on.error=null] Called when a proxy request fails for whatever reason.
 */

// endregion

/**
 * A proxy that allows uWebSockets.js to be compatible with any node:http based server by proxying requests
 */
class UWSProxy {

	// region Static methods

	/**
	 * Create a valid httpConfiguration
	 * @important It immediately spawns an HTTP server if no one was provided, and immediately
	 *            call node:http.Server.listen if the http.Server.listening is false.
	 * @param {module:http.Server}       [httpServer] Will be created if not provided.
	 * @param {UWSProxyHTTPConfigOpts}   [config={}]  Configuration object
	 * @return {UWSProxyHTTPConfig}
	 */
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

		if(!httpServer){
			httpServer = http.createServer();
		}else if(!(httpServer instanceof http.Server)){
			throw new Error('First argument must be an instance of node:http.Server');
		}

		if (config.on.listen && typeof listen !== 'function') throw new Error(
			'If specified, on.listen must be a function !'
		);

		if(!httpServer.listening){
			httpServer.listen(port, host, listen);
		}else if(!config.port && !quiet){
			console.warn(
				'[WARN] UWSProxy: you provided a listening node:http.Server.'
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

	/**
	 * Creates a valid uwsConfiguration
	 *
	 * @param {UWS|UWSTemplatedApp} uWebSocket
	 * @param {UWSProxyUWSConfigOpts} opts
	 * @return {UWSProxyUWSConfig}
	 */
	static createUWSConfig(uWebSocket, opts = {}){
		if(!uWebSocket){
			throw new Error(
				"First argument required! Must be either the uWebSockets.js package itself"
				+ " (require('uWebSockets.js')) or an instance of"
				+ " uWebSockets.js:App / uWebSockets.js:SSLApp"
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
				"[WARN] UWSProxy: No port was specified in opts."
				+ " Default port used is 443."
			)
		}

		let uwsServer;

		if(!App && !SSLApp){
			// If App and SSLApp ar undefined, we try to determine if the first argument is a
			// constructed App or SSLApp itself. Since the uWebSockets.js package do not expose those
			// classes, we have to guess using a hacky way? It's not reliable because it may be
			// changed by the maintainer later, but it's all we have.
			if(!uWebSocket.constructor?.name?.startsWith('uWS.')){
				throw new Error(
					"The first argument doesn't seems to be a uWebSockets.js app"
					+ " nor the uWebSockets.js package itself."
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

	// endregion
	// region Instance properties

	/**
	 * @type {UWSProxyUWSConfig}
	 */
	#uwsConfig;

	/**
	 * @type {UWSProxyHTTPConfig}
	 */
	#httpConfig;

	/**
	 * @type {UWSProxyOpts}
	 */
	#opts;

	// endregion

	/**
	 * @param {UWSProxyUWSConfig}  uwsConfig
	 * @param {UWSProxyHTTPConfig} httpConfig
	 * @param {UWSProxyOpts}       opts
	 */
	constructor(
		uwsConfig,
		httpConfig,
		opts = {}
	) {
		if(!uwsConfig[uwsConfigSymbol]){
			throw new Error(
				'Untrusted uWebSocket configuration. Please provide a trusted config with'
				+ ' UWSProxy.createUWSConfig()'
			);
		}

		if(!httpConfig){
			httpConfig = UWSProxy.createHTTPConfig();
		}else if(!httpConfig[httpConfigSymbol]){
			throw new Error(
				'Untrusted http configuration. Please provide a trusted config with'
				+ ' UWSProxy.createHTTPConfig()'
			);
		}

		const {
			routes = null,
			headers = {},
			on : {
				error = null
			} = {},
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
			on: {
				error
			}
		};
	}

	// region Getters

	/**
	 * A shallow copy of the uWebSocket configuration.
	 *
	 * Note that the `config` object is the raw object passed as a parameter.
	 * @return {{
	 *      server,
	 *      port: int,
	 *      config: Object,
	 *      ssl: boolean
	 * }}
	 */
	get uwsConfig(){
		const {
			config,
			server,
			ssl,
			port,
		} = this.#uwsConfig;

		return {
			config,
			server,
			ssl,
			port
		};
	}

	/**
	 * A shallow copy of the http configuration
	 *
	 * Note that the `config` object is the raw object passed as a parameter.
	 * @return {{
	 *     config: Object,
	 *     host: string,
	 *     port: int,
	 *     server: http.Server
	 * }}
	 */
	get httpConfig(){
		const {
			config,
			host,
			port,
			server
		} = this.#httpConfig;

		return {
			config,
			host,
			port,
			server
		};
	}

	// endregion

	/**
	 * Attach routes listeners to uWebSocket to start proxying.
	 *
	 * @important This action can't be undone. uWebSockets.js do not allow listeners removal.
	 */
	start(){
		const { routes } = this.#opts;
		const { server: uwsServer } = this.#uwsConfig;

		Object.keys(routes).forEach(method => {
			uwsServer[method](routes[method], this.#handleRequest.bind(this));
		});
	}

	/**
	 * Handle a request received by uWebSockets.js and forward it to the http server.
	 * @param {UWSResponse} uwsResponse
	 * @param {UWSRequest} uwsRequest
	 */
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

		const {
			client,
			request
		} = decodeRequest(uwsResponse, uwsRequest);

		const proxyHeaders = {
			for: client.remoteAddress,
			port: publicPort,
			proto: ssl ? 'https' : 'http'
		};

		['for', 'port', 'proto'].forEach(function (header) {
			request.headers['x-forwarded-' + header] =
				(request.headers['x-forwarded-' + header] || '') +
				(request.headers['x-forwarded-' + header] ? ',' : '') +
				proxyHeaders[header];
		});

		request.headers['x-forwarded-host'] = request.headers['x-forwarded-host']
			|| request.headers['host']
			|| '';

		const abortController = new AbortController();

		// Forward the request to the http server
		const forwardedRequest = http.request({
			hostname: privateHost,
			port: privatePort,
			path: request.url + '?' + request.query,
			method: request.method,
			headers: Object.assign(
				{},
				request.headers,
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
			uwsBodyStream.destroy(new Error('UWSProxy: Request aborted by client.'));

			forwardedRequest.destroy();
			abortController.abort();
		});

		// If http server's request is aborted, we must abort the client request, and maybe the
		// WebSocket response too.
		abortController.signal.addEventListener('abort', () => {
			uwsBodyStream.destroy(new Error('UWSProxy: Request aborted by recipient server.'));

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