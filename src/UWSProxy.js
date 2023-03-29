// region Imports

const http  = require("http");
const https = require("https");

https.globalAgent = new https.Agent({
	keepAlive: true
});

http.globalAgent = new http.Agent({
	keepAlive: true
});

const { isPromise } = require('util').types;

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
 *
 * HTTP configuration options for UWSProxy's constructor.
 * @see {UWSProxy.createHTTPConfig}
 * @typedef UWSProxyHTTPConfigOpts
 * @property {'http'|'https'} [protocol="http"] Default: `'http'` - Server protocol
 * @property {int}            [port=35974] Default: `35974` - Private port the HTTP server must listen to
 * @property {string}         [host="127.0.0.1"] Default: `'127.0.0.1'` - HTTP host. Default is the loop-back address.
 * @property {boolean}        [quiet=false] Default: `false` - Disable configuration warning printing
 */

/**
 * UWSProxy actual configuration for uWebSockets.js
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
 */

/**
 * uWebSockets.js TemplatedApp
 * @øee [TemplatedApp Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/TemplatedApp.html)
 * @typedef {import("uWebSockets.js").TemplatedApp} UWSTemplatedApp
 */

/**
 * uWebSockets.js AppOptions
 * @see [AppOptions Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/AppOptions.html)
 * @typedef {import("uWebSockets.js").AppOptions} UWSAppOptions
 */

/**
 * uWebSockets.js HTTPRequest
 * @see [HttpRequest Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpRequest.html)
 * @typedef {import("uWebSockets.js").HttpRequest} UWSRequest
 */

/**
 * uWebSockets.js Recognized string
 * @see [RecognizedString Documentation](https://unetworking.github.io/uWebSockets.js/generated/types/RecognizedString.html)
 * @typedef {import("uWebSockets.js").RecognizedString} UWSRecognizedString
 */

/**
 * uWebSockets.js HttpResponse
 * @see [HttpResponse Documentation](https://unetworking.github.io/uWebSockets.js/generated/interfaces/HttpResponse.html)
 * @typedef {import("uWebSockets.js").HttpResponse} UWSResponse
 */

/**
 * uWebSockets.js configuration options for UWSProxy's constructor.
 * @see {UWSProxy.createUWSConfig}
 * @typedef UWSProxyUWSConfigOpts
 * @property {boolean|null} [ssl=null]     Default: `null` - If true, inform the Proxy that trafic is encrypted (it
 *                                         matters to set proxy Headers and create (if not provided)
 *                                         an SSLApp instead of an App)
 * @property {int}           [port=443]    Default: `443` - Public port uWebSocket server is listening to
 * @property {boolean}       [quiet=false] Default: `false` - Disable configuration warning printing
 * @property {UWSAppOptions} [config=Object] Default: `{}` - See uWebSockets.js AppOptions
 */

/**
 * UWSProxy actual configuration for uWebSockets.js
 * @typedef UWSProxyUWSConfig
 * @property {boolean}               ssl
 * @property {int}                   port
 * @property {UWSProxyUWSConfigOpts} config
 * @property {UWSTemplatedApp}       server
 */

/**
 * Callbacks dictionary used by UWSProxy for you to hook / change the proxy behavior in some
 * circumstances.
 * @typedef UWSProxyCallbacks
 * @property {UWSProxyErrorHandler|null} [error=null] Default: `null` - Called when a proxy request fails for whatever reason.
 */

/**
 * UWSProxy configuration options.
 * @typedef UWSProxyOpts
 * @property {Object} [backpressure=Object]
 * @property {int}    [backpressure.maxStackedBuffers=4096] Default: `4096` - Once the buffer is filled, the connection
 *                                                          will be aborted
 * @property {Object<string, string|string[]>} [headers=Object] Additional headers always appended to
 *                                                          the proxy request (not on the client's
 *                                                          response)
 * @property {Object<string, string>} [routes] Routes we want the proxy request handlers to listen
 *                                             to
 * @property {int}    [timeout=300000] Default: `300000` - Timeout in MS before an attempt to reach the proxied server
 *                                        will abort.
 * @property {UWSProxyCallbacks} [on=Object] Collection of optional callbacks
 */

/**
 * Used by UWSProxy to send a proper Error response to the client if possible. This object can
 * be returned by a UWSProxyCallbacks.error callback to change the UWSProxy default error response.
 * @see {UWSProxyCallbacks.error}
 * @typedef UWSProxyErrorResponse
 * @property {string} status
 * @property {Object<string,string|string[]>} headers
 * @property {UWSRecognizedString} body
 */

/**
 * @typedef {import('./utils/uwsHelpers').UWSDecodedRequest} UWSDecodedRequest
 */

/**
 * @callback UWSProxyErrorHandler
 * Called on request error. Can be used as a hook to change the Proxy error response if an
 * UWSProxyErrorResponse is returned. **Supports promises**. This **can** return a promise or not.
 *
 * If no (or falsy) result is returned, the Proxy will respond with default error handling. This behavior
 * allows for custom logging or whatever.
 *
 * You may want to take those NodeJS error codes into consideration:
 *
 * - ECONNRESET
 * - ECONNABORT
 * - ECONNREFUSED
 * - ETIMEDOUT
 *
 * Note that you can receive any ReadableStream, WritableStream, IncomingMessage, OutgoingMessage, uWebSocket.js:HttpResponse,
 * uWebSocket.js:HttpRequest error that **may** contain an error code.
 *
 * The proxy may give you two custom codes:
 *
 * - EBODYSTREAM: the request body can't be sent to the server or an error occurred while transferring.
 *                In this scenario, the original error is passed to the Error constructor as cause,
 *                and the original error code (if any) can be found in error.original_error.
 * - ERECIPIENTABORTED: the recipient server received the request but aborted either with partial or no response at all.
 * @param {Error} error
 * @param {UWSDecodedRequest} decodedRequest
 * @return {UWSProxyErrorResponse|void|Promise<UWSProxyErrorResponse|void>}
 */

// endregion

/**
 * A proxy based on uWebSockets.js. Allow for compatibility between uWebSockets.js and any HTTP server.
 *
 * It is useful in restricted server environment like clouds where you can't set up a proxy, or if you
 * don't want to use a proxy and need uWebSockets.js to work on the same port as any other http server
 * you're already using like express, nestjs, fastify, etc.
 *
 * **Example with express:**
 *
 * ```js
 * const http = require('http');
 * const express = require('express');
 * const uWebSockets = require('uWebSockets.js');
 *
 * const {
 * 	UWSProxy,
 * 	createUWSConfig,
 * 	createHTTPConfig
 * } = require('uws-reverse-proxy');
 *
 * const port = process.env.PORT || 80;
 *
 * const proxy = new UWSProxy(
 * 	createUWSConfig(
 * 		uWebSockets,
 * 		{ port }
 * 	)
 * );
 *
 * const expressApp = express();
 * expressApp.listen(
 * 	proxy.http.port,
 * 	proxy.http.host,
 * 	() => console.log(`HTTP Server listening at ${proxy.http.protocol}://${proxy.http.host}:${proxy.http.port}`)
 * );
 *
 * proxy.uws.server.ws({
 * 	upgrade : () => {
 * 		//...
 *     },
 * 	//...
 * });
 *
 * proxy.uws.server.listen('0.0.0.0', port, listening => {
 * 	if(listening){
 * 		console.log(`uWebSockets.js listening on port 0.0.0.0:${port}`);
 * 	}else{
 * 		console.error(`Unable to listen on port 0.0.0.0:${port}!`);
 * 	}
 * });
 * ```
 *
 * @see More examples in the [examples repository](https://github.com/jordan-breton/uws-reverse-proxy-examples)
 *
 */
class UWSProxy {

	// region Static methods

	/**
	 * Create a valid httpConfiguration. The purpose of this method is to emit warnings or throw errors
	 * if the configuration doesn't seem valid.
	 *
	 * It's also meant to be a helper for further updates, where new configuration options will be added.
	 *
	 * using this method to configure UWSProxy is strongly recommended.
	 *
	 * @param {UWSProxyHTTPConfigOpts}   [config=Object]  Configuration object
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
	 * Creates a valid uWebSockets.js configuration. The purpose of this method is to emit warnings
	 * or throw errors if the configuration doesn't seem valid.
	 *
	 * It's also meant to be a helper for further updates, where new configuration options will be added.
	 *
	 * using this method to configure UWSProxy is strongly recommended.
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
	 * @param {UWSProxyUWSConfig}  uwsConfig  uWebSockets.js configuration. You should create it
	 *                                        with UWSProxy.createUWSConfig
	 * @param {UWSProxyHTTPConfig} httpConfig HTTP configuration of the target HTTP server. You should create it
	 *                                        with UWSProxy.createHTTPConfig.
	 * @param {UWSProxyOpts}       opts Proxy configuration options.
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
			timeout = 300000,
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
				maxStackedBuffers: typeof maxStackedBuffers === 'number' ? maxStackedBuffers : 4096
			},
			headers: headers || {},
			routes: routes || {
				any: '/*'
			},
			timeout: typeof timeout === 'number' ? timeout : 300000,
			on: {
				error
			}
		};
	}

	// region Getters

	/**
	 * A shallow copy of the uWebSocket configuration.
	 *
	 * Note that the `config` property is the raw object passed as a parameter to
	 * UWSProxy.createUWSConfig.
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
	 * Note that the `config` property is the raw object passed as a parameter to
	 * UWSProxy.createHTTPConfig.
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
	 * Forward a given request and give back the response
	 * @param {UWSResponse} uwsResponse The response in which we will write the result of our forwarded
	 *                                  request.
	 * @param {UWSDecodedRequest} request The decoded uWebSockets.js request to forward
	 * @param {AbortController} abortController
	 * @return {module:http.ClientRequest}
	 */
	#forwardRequest(
		uwsResponse,
		request,
		abortController
	){
		const {
			host: privateHost,
			port: privatePort,
			protocol: privateProtocol
		} = this.#httpConfig;

		const { headers: optsHeaders } = this.#opts;

		const httpModule = privateProtocol === 'https' ? https : http;
		const forwardedRequest = httpModule.request({
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

			// uWebSocket auto-append content-length. If we let the one set up by the answering
			// server, the browser will error with code ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH
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

			httpResponse.on('error', err => {
				this.#tryToRespondToError(err, uwsResponse, request);
			});

			streamToUWSResponse(uwsResponse, httpResponse);
		});

		forwardedRequest.on('error', err => {
			this.#tryToRespondToError(err, uwsResponse, request);
		});

		forwardedRequest.on('timeout', () => {
			const error = new Error('Forwarded request timeout');
			error.code = 'ETIMEDOUT';

			this.#tryToRespondToError(error, uwsResponse, request);
		});

		return forwardedRequest;
	}

	/**
	 * Handle a request received by uWebSockets.js and forward it to the http server.
	 * @param {UWSResponse} uwsResponse
	 * @param {UWSRequest} uwsRequest
	 */
	#handleRequest(uwsResponse, uwsRequest){
		// region Request forwarding preparation

		const {
			ssl,
			port: publicPort
		} = this.#uwsConfig;

		const {
			backpressure: { maxStackedBuffers }
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

		// endregion

		const forwardedRequest = this.#forwardRequest(
			uwsResponse,
			request,
			abortController
		);

		// region Piping the request body to the forwarded request

		const uwsBodyStream = new UWSBodyStream(uwsResponse, { maxStackedBuffers });
		uwsBodyStream.addListener('error', (err) => {
			const error = new Error(err.message, { cause: err });
			error.original_code = error.code;
			error.code = 'EBODYSTREAM';

			this.#tryToRespondToError(error, uwsResponse, request);
		});

		// If the client abort the uWebSocket request, we must abort proxy's requests to the
		// http server too.
		uwsResponse.onAborted(() => {
			uwsBodyStream.destroy(new Error('UWSProxy: Request aborted by client.'));

			abortController.abort();
		});

		// If http server's request is aborted, we must abort the client request too.
		abortController.signal.addEventListener('abort', () => {
			uwsBodyStream.destroy(new Error('UWSProxy: Request aborted by recipient server.'));

			const error = new Error('Aborted by recipient server.');
			error.code = 'ERECIPIENTABORTED';

			this.#tryToRespondToError(error, uwsResponse, request);
		});

		// All have been set up, let's pipe the body to the http server.
		uwsBodyStream.pipe(forwardedRequest);

		// endregion
	}

	// region Error handling

	/**
	 * Construct a valid error response based on the provided error. The error response
	 * will be sent (if possible) to the client. To change any of the default response,
	 * use a UWSProxyErrorHandler callback
	 * @param {Error} error The error we want to build a response upon
	 * @return {UWSProxyErrorResponse}
	 */
	#buildErrorResponse(error){
		const response = {
			headers: {},
			body: undefined,
			status: undefined
		};

		switch(error.code){
			case 'ECONNRESET':
			case 'ECONNABORTED':
			case 'ECONNREFUSED':
				response.headers.status = "503 Service Unavailable";
				response.body = `Unable to forward the request to the server (${error.code}).`;
				break;

			case 'EBODYSTREAM':
				response.headers.status = "503 Service Unavailable";
				response.body = `Unable to forward your request body to the server (${error.code}: ${error.original_code}).`
				break;

			case 'ETIMEDOUT':
				response.headers.status = "504 Gateway Timeout";
				response.body = `No response received from the server in ${this.#opts.timeout}ms: request aborted (${error.code}).`;
				break;

			case 'ERECIPIENTABORTED':
				response.headers.status = "502 Bad Gateway";
				response.body = `The recipient server aborted the proxy request (${error.code}).`;
				break;

			default:
				// In every other case the response is invalid for a reason or another.
				response.headers['status code'] = "502 Bad Gateway";
				response.body = `The proxy received a malformed or incomplete response from the server,`
					+ ` or encountered a non-handled error (${error.code}).`
		}

		return response;
	}

	/**
	 * Make an attempt to send an UWSProxyErrorResponse to the client. This may produce no result
	 * if the UWSResponse have been aborted/closed already. This method will just fail silently if it
	 * happen.
	 *
	 * @param {UWSResponse} uwsResponse The response we want to write into
	 * @param {UWSProxyErrorResponse} errorResponse The error to send.
	 */
	#tryToSendErrorResponse(uwsResponse, errorResponse){
		const {
			headers,
			body,
			status
		} = errorResponse;

		try{
			writeHeaders(uwsResponse, Object.assign(
				{},
				headers,
				{ status }
			));
		}catch(err){
			// We can ignore it, headers may have been sent already
		}

		try{
			uwsResponse.cork(() => {
				uwsResponse.end(body);
			});
		}catch(err){
			// We can ignore it, the uwsResponse has probably been closed already if we go there.
		}
	}

	/**
	 * Try to use the provided UWSProxyErrorHandler if it was specified in UWSProxyOpts at UWSProxy
	 * creation.
	 * @param {UWSResponse} uwsResponse The response we want to send an error into.
	 * @param {Error} error The raw error that have been detected.
	 * @param {UWSDecodedRequest} request Informations about the current request.
	 * @return {boolean} False if no handler is defined, true otherwise
	 */
	#tryToUseErrorHandlerResponse(uwsResponse, error, request){
		const {
			on: {
				error: errorHandler
			} = {}
		} = this.#opts;

		if(!errorHandler) return false;

		const res = errorHandler(error, request);

		if(isPromise(res)){
			res.then((errorResponse) => {
				this.#tryToSendErrorResponse(
					uwsResponse,
					errorResponse || this.#buildErrorResponse(error)
				);
			}).catch(err => {
				console.error('UWSProxy: error thrown in error handler: ', err);
				this.#tryToSendErrorResponse(uwsResponse, this.#buildErrorResponse(error));
			});
		} else {
			this.#tryToSendErrorResponse(uwsResponse, res || this.#buildErrorResponse(error));
		}

		return true;
	}

	/**
	 * Will try to respond to an error, either by using a UWSProxyErrorHandler (if any) or by sending
	 * a default error response.
	 * @param {Error} error The error that have been detected.
	 * @param {UWSResponse} uwsResponse The response we want to write into.
	 * @param {UWSDecodedRequest} request Informations about the current request.
	 */
	#tryToRespondToError(error, uwsResponse, request){
		if(!this.#tryToUseErrorHandlerResponse(uwsResponse, error, request)){
			this.#tryToSendErrorResponse(uwsResponse, this.#buildErrorResponse(error));
		}
	}

	// endregion
}

module.exports = UWSProxy;