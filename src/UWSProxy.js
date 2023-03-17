// region Imports

const http  = require("http");
const https = require("https");

const {
	decodeRequest,
	writeHeaders
} = require('./utils/uwsHelpers');

const streamToUWSResponse = require("./streams/streamToUWSResponse");
const UWSBodyStream = require("./streams/UWSBodyStream");

// endregion

// region Private declarations

/**
 * List of keys in uWebSocket config object that indicates that our server is using SSL encryption.
 * @type {string[]}
 * @private
 */
const UWS_SSL_KEYS = [
	'key_file_name',
	'cert_file_name'
];

// endregion
// region JSDOC typedefs

/**
 * @typedef UWSProxyHTTPConfigOpts
 * @property {'http'|'https'} [protocol='http'] Server protocol
 * @property {int}            [port=35974] Private port the HTTP server must listen to
 * @property {string}         [host="127.0.0.1"] HTTP host. Default is the loop-back address.
 * @property {boolean}        [quiet=false] Disable configuration warning printing
 */

/**
 * @typedef UWSProxyHTTPConfig
 * @property {UWSProxyHTTPConfigOpts} config Raw configuration passed to UWSProxy.createHTTPConfig
 * @property {'http'|'https'} protocol HTTP protocol
 * @property {int}            port     Listening port
 * @property {string}         host     HTTP host
 */

/**
 * uWebSockets.js
 * @see [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js/)
 * @typedef {import("uWebSockets.js")} UWS
 * @private
 */

/**
 * uWebSockets.js TemplatedApp
 * @øee [TemplatedApp Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/TemplatedApp.html)
 * @typedef {import("uWebSockets.js").TemplatedApp} UWSTemplatedApp
 * @private
 */

/**
 * uWebSockets.js AppOptions
 * @see [AppOptions Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/AppOptions.html)
 * @typedef {import("uWebSockets.js").AppOptions} UWSAppOptions
 * @private
 */

/**
 * uWebSockets.js HTTPRequest
 * @see [HttpRequest Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpRequest.html)
 * @typedef {import("uWebSockets.js").HttpRequest} UWSRequest
 * @private
 */

/**
 * uWebSockets.js HttpResponse
 * @see [HttpResponse Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpResponse.html)
 * @typedef {import("uWebSockets.js").HttpResponse} UWSResponse
 * @private
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
 *                                             to
 * @property {Object<string, function>} [on={}] Collection of optional callbacks
 * @property {function|null} [on.error=null] Called when a proxy request fails for whatever reason.
 */

// endregion

/**
 * A proxy that allows uWebSockets.js to be compatible with any http server by proxying http requests
 */
class UWSProxy {

	// region Static methods

	/**
	 * Create a valid httpConfiguration
	 *
	 * @param {UWSProxyHTTPConfigOpts}   [config={}]  Configuration object
	 * @return {UWSProxyHTTPConfig}
	 */
	static createHTTPConfig(config = {}){
		const {
			port = 35974,
			host = '127.0.0.1',
			protocol = 'http',
			quiet = false,
		} = config || {};

		if(
			!quiet
			&& protocol === 'https'
			&& ['localhost', '127.0.0.1'].includes(host.toLowerCase().trim())
		){
			console.warn(
				'[WARN] UWSProxy: you configured the proxy to forward to a local HTTPS server.'
				+ ' You should consider using an HTTP server, as TLS have an impact on performances.'
			);
		}

		return {
			config,
			host,
			port,
			protocol
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

		if(!port || !Number.isInteger(port) || port < 2 || port > 49151){
			throw new Error('opts.ports must be a valid integer and a valid port number!');
		}else if(!opts.port && !quiet && port === 443 && !ssl){
			console.warn(
				"[WARN] UWSProxy: No port was specified in opts."
				+ " Default port used is 443."
			)
		}

		return {
			config,
			server: uwsServer,
			ssl,
			port
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
		if(!uwsConfig) throw new Error('No uWebSockets.js configuration provided!');
		if(!httpConfig) httpConfig = UWSProxy.createHTTPConfig();

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
	 * @return {UWSProxyUWSConfig}
	 */
	get uws(){
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
	 * @return {UWSProxyHTTPConfig}
	 */
	get http(){
		const {
			config,
			host,
			port,
			protocol
		} = this.#httpConfig;

		return {
			config,
			host,
			port,
			protocol
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
			port: privatePort,
			protocol: privateProtocol
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

		// We don't need those header after the proxy, as we only process one
		// request at a time, and we want the proxy to manage the connection itself.
		delete request.headers['keep-alive'];
		delete request.headers['connection'];

		// Forward the request to the http server
		const forwardedRequest = (privateProtocol === 'https' ? https : http).request({
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
			// node:http, the browser will error with code ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH
			delete headers['content-length'];

			// If node:http append something, we must ignore it.
			delete headers['keep-alive'];
			delete headers['connection'];

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
		uwsBodyStream.pipe(forwardedRequest);
	}
}

module.exports = UWSProxy;