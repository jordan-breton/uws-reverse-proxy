const net = require('net');
const tls = require('tls');

const { EventEmitter } = require('events');

let i = 0;

/**
 * Open a raw socket connection to a server. Can be either with the net or tls module
 */
class Connection extends EventEmitter{

	static STATES = {
		CONNECTING: 'connecting',
		CONNECTED: 'connected',
		CLOSED: 'closed'
	}

	_isSecure;
	_socket;
	_config;
	_maxReopenAttempts;
	_reopenAttempts;
	_reopenDelay;
	_properlyClosed;
	_keepAlive;
	_lastActivity;
	_requestSender;

	_state;

	_responseParser;

	/**
	 * @param {Object} connectionConfig
	 * @param {string} connectionConfig.host
	 * @param {number} connectionConfig.port
	 * @param {string} [connectionConfig.servername]
	 * @param {boolean} [connectionConfig.isSecure]
	 * @param {boolean} [connectionConfig.rejectUnauthorized]
	 * @param {number} [connectionConfig.highWaterMark]
	 * @param {string} [connectionConfig.key]
	 * @param {string} [connectionConfig.cert]
	 * @param {string} [connectionConfig.ca]
	 * @param {IResponseParser} responseParser
	 * @param {IRequestSender} requestSender
	 */
	constructor(connectionConfig, responseParser, requestSender){
		super();

		this._id = i++;

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
			key,
			cert,
			ca
		} = connectionConfig;

		this._config = {
			host,
			port,
			servername,
			rejectUnauthorized,
			highWaterMark,
			key,
			cert,
			ca
		};

		this._isSecure = isSecure;
		this._keepAlive = keepAlive;
		this._requestSender = requestSender;
		this._responseParser = responseParser;
		this._maxReopenAttempts = maxReopenAttempts;
		this._reopenDelay = reopenDelay;

		this._openConnection();
	}

	get lastActivity(){
		return this._lastActivity;
	}

	get state(){
		return this._state;
	}

	/**
	 * Should be called when the connection sends or receives data.
	 */
	_activity(){
		this._lastActivity = Date.now();
	}

	_changeState(state){
		this._state = state;
		this.emit(state);
	}

	_openConnection(){
		if(this._socket){
			this._socket.end();
		}

		this._changeState(Connection.STATES.CONNECTING);

		this._socket = (this._isSecure ? tls : net).connect(this._config, () => {
			this._reopenAttempts = 0;
			this._activity();
			this._changeState(Connection.STATES.CONNECTED);
		});

		let received = 0;

		this._socket.on('data', data => {
			this._activity();
			received += data.length;

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
			}

			this.emit('error', err);
		});

		this._socket.on('close', () => {
			this._socket = null;
			this._changeState(Connection.STATES.CLOSED);

			this._requestSender.close();
		});
	}

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

	close(){
		this._properlyClosed = true;
		this._socket.end();
	}
}

module.exports = Connection;