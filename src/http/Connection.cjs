// region Imports

const net = require('net');
const tls = require('tls');

const { EventEmitter } = require('events');

// endregion

/**
 * @typedef {Object} UWSConnectionOpts
 * @property {string} host The target server host
 * @property {number} port The target server port
 * @property {string} [servername] The servername used for SNI
 * @property {boolean} [isSecure] True if the connection should be secure
 * @property {boolean} [rejectUnauthorized] True if the connection should reject unauthorized certificates
 * @property {number} [highWaterMark=16384] The highWaterMark used for the socket
 * @property {string} [key] The key used for the TLS connection
 * @property {string} [cert] The certificate used for the TLS connection
 * @property {string} [ca] The certificate authority used for the TLS connection
 * @property {number} [keepAlive=5000] The keep-alive interval in ms
 * @property {number} [keepAliveInitialDelay=1000] The keep-alive initial delay in ms
 * @property {number} [maxReopenAttempts=3] Max number of attempts to reopen a connection
 * @property {number} [reopenDelay=1000] Delay in ms between each attempt to reopen a connection
 *
 */

/**
 * Open and manage a raw socket connection to a server. Work either with the net or tls module depending
 * on the configuration
 *
 * Supports keep-alive and reconnection. If the connection can't be established, it will try to
 * reconnect maxReopenAttempts times with a delay of reopenDelay ms between each attempt.
 */
class Connection extends EventEmitter{

	/**
	 * The connection states
	 * @type {{
	 *      CLOSED: string,
	 *      CONNECTING: string,
	 *      CONNECTED: string
	 * }}
	 */
	static STATES = {
		CONNECTING: 'connecting',
		CONNECTED: 'connected',
		CLOSED: 'closed'
	}

	// region Private properties

	/**
	 * @type {boolean} True if TLS is enabled.
	 * @private
	 */
	_isSecure;

	/**
	 * @type {net.Socket|tls.TLSSocket} The raw TCP socket.
	 * @private
	 */
	_socket;

	/**
	 * @type {import("net")} The connection configuration passed to the constructor.
	 * @private
	 */
	_config;

	/**
	 * @type {int} Max number of reconnection attempts.
	 * @private
	 */
	_maxReopenAttempts;

	/**
	 * @type {int} Current number of reconnection attempts.
	 * @private
	 */
	_reopenAttempts;

	/**
	 * @type {int} Delay in ms between each reconnection attempt.
	 * @private
	 */
	_reopenDelay;

	/**
	 * @type {boolean} True if the connection is properly closed.
	 * @private
	 */
	_properlyClosed;

	/**
	 * @type {int} The keep-alive interval in ms.
	 * @private
	 */
	_keepAlive;

	/**
	 * @type {int} Refreshed every time data is sent/received on the socket.
	 * @private
	 */
	_lastActivity;

	/**
	 * @type {IRequestSender} The sender used to send requests to the target server through the socket.
	 * @private
	 */
	_requestSender;

	/**
	 * @type {string} The current connection state.
	 * @see Connection.STATES
	 * @private
	 */
	_state;

	/**
	 * @type {IResponseParser} The parser used to decode the target server responses.
	 * @private
	 */
	_responseParser;

	// endregion

	/**
	 * @param {UWSConnectionOpts} opts
	 * @param {IResponseParser} responseParser The parser used to decode the target server responses
	 * @param {IRequestSender} requestSender The sender used to send requests to the target server
	 */
	constructor(
		opts,
		responseParser,
		requestSender
	){
		super();

		const {
			host,
			port,
			servername,
			isSecure = false,
			rejectUnauthorized = true,
			highWaterMark = 16 * 1024,
			maxReopenAttempts = 3,
			reopenDelay = 1000,
			keepAlive = 5000,
			keepAliveInitialDelay = 1000,
			key,
			cert,
			ca
		} = opts;

		this._config = {
			host,
			port,
			servername,
			rejectUnauthorized,
			highWaterMark,
			key,
			cert,
			ca,
			keepAliveInitialDelay
		};

		this._isSecure = isSecure;
		this._keepAlive = keepAlive;
		this._requestSender = requestSender;
		this._responseParser = responseParser;
		this._maxReopenAttempts = maxReopenAttempts;
		this._reopenDelay = reopenDelay;
		this._reopenAttempts = 0;

		this._openConnection();
	}

	// region Getters

	/**
	 * Return the last activity timestamp.
	 * @return {Number}
	 */
	get lastActivity(){
		return this._lastActivity;
	}

	/**
	 * Return the current connection state.
	 * @return {string}
	 */
	get state(){
		return this._state;
	}

	// endregion

	// region Private methods

	/**
	 * Should be called when the connection sends or receives data.
	 * @private
	 */
	_activity(){
		this._lastActivity = Date.now();
	}

	/**
	 * Change the connection state and emit an event.
	 * @param {'closed'|'connected'|'connecting'} state
	 * @private
	 */
	_changeState(state){
		this._state = state;
		this.emit(state);
	}

	/**
	 * Open the connection. If the connection is already open, it will be closed first.
	 * @private
	 */
	_openConnection(){
		if(this._socket){
			this._socket.end();
		}

		this._changeState(Connection.STATES.CONNECTING);

		this._socket = new (this._isSecure ? tls : net).Socket();

		this._socket.on('data', data => {
			this._activity();

			this._responseParser.feed(data);
		});

		this._socket.on('error', (err) => {
			// If the connection is refused, we try to reopen it a few times before abandoning
			if(err.code === 'ECONNREFUSED'){
				if(this._reopenAttempts >= this._maxReopenAttempts){
					this.emit('error', err);
					return;
				}

				this._changeState(Connection.STATES.CLOSED);

				this._reopenAttempts++;
				setTimeout(() => {
					this._openConnection();
				}, this._reopenDelay);
				return;
			}else if(err.code === 'ECONNABORTED'){
				const newErr = new Error(
					'Connection aborted by the target server',
					{
						cause: err
					}
				);
				newErr.code = 'E_RECIPIENT_ABORTED';
				newErr.originalError = err;

				err = newErr;
			}

			this.emit('error', err);

			this._requestSender.close(err);
		});

		this._socket.on('close', () => {
			this._socket = null;
			this._changeState(Connection.STATES.CLOSED);

			this._requestSender.close();
		});

		this._socket.on('connect', () => {
			this._reopenAttempts = 0;
			this._activity();
			this._changeState(Connection.STATES.CONNECTED);
		});

		this._socket.connect(this._config);
	}

	// endregion

	/**
	 * Return true if the connection is available to send requests (i.e. it is connected and the
	 * request sender can still accept more requests).
	 * @return {boolean}
	 */
	isAvailable(){
		return this._state === Connection.STATES.CONNECTED
			&& this._requestSender.acceptsMoreRequests();
	}

	/**
	 * Send a request to the server
	 * @param {Request} request
	 * @param {sendCallback} callback
	 */
	send(request, callback){
		if(this._state !== Connection.STATES.CONNECTED){
			callback(new Error(`Can't send any request: connection is in ${this._state} state.`));
			return;
		}

		if(!('headers' in request)){
			request.headers = {};
		}

		if(!('host' in request.headers)){
			request.headers.host = this._config.host;
		}

		if(!('port' in request.headers)){
			request.headers.port = this._config.port;
		}

		this._requestSender.send(
			this._socket,
			request,
			callback
		);
	}

	/**
	 * Close the connection by ending the socket.
	 * Fails silently if the connection is already closed.
	 */
	close(){
		if(!this._socket) return;
		if(this._state !== Connection.STATES.CONNECTED) return;

		this._properlyClosed = true;
		this._socket.end();
	}
}

module.exports = Connection;