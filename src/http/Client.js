const Connection = require('./Connection');
const RequestSender = require("./1.1/Sender");
const Pipeline = require("./1.1/strategies/Pipeline");
const Sequential = require("./1.1/strategies/Sequential");
const Parser = require("./1.1/Parser");

function selectConnectionIn(array){
	return array[Math.floor(Math.random() * array.length)];
}

class Client{

	/**
	 * @type {Map<string, Connection[]>}
	 */
	_connections;
	/**
	 * When creating a new connection, it is added to this map.
	 * Once the connection is ready, it is moved to the _connections map.
	 * @type {Map<string, Promise<Connection>[]>}
	 */
	_pendingConnections = new Map();

	_maxConnectionsByHost;
	_maxPipelinedRequestsByConnection;
	_connectionTimeout;
	_connectionWatcherInterval;
	_connectionWatcherHandle;
	_closed;
	_pipelining;

	constructor(
		{
			pipelining = true,
			connectionTimeout = 5000,
			maxConnectionsByHost = 10,
			connectionWatcherInterval = 1000,
			maxPipelinedRequestsByConnection = 100000,
		} = {}
	){
		this._pipelining = pipelining;
		this._connections = new Map();
		this._pendingConnections = new Map();
		this._connectionTimeout = connectionTimeout;
		this._maxConnectionsByHost = maxConnectionsByHost;
		this._connectionWatcherInterval = connectionWatcherInterval;
		this._maxPipelinedRequestsByConnection = maxPipelinedRequestsByConnection;

		this._connectionWatcherHandle = setInterval(() => {
			this._connections.forEach(connections => {
				connections.forEach(connection => {
					if(connection.isAvailable() && Date.now() - connection.lastActivity > this._connectionTimeout){
						connection.close();
					}
				});
			});
		}, this._connectionWatcherInterval);
	}

	_createConnection(options){
		const key = `${options.host}:${options.port}`;

		const nbConnections = this._connections.has(key) ? this._connections.get(key).length : 0;
		const nbPendingConnections = this._pendingConnections.has(key) ? this._pendingConnections.get(key).length : 0;

		if(nbPendingConnections + nbConnections >= this._maxConnectionsByHost){
			return selectConnectionIn([
				...this._pendingConnections.get(key),
				...this._connections.get(key)
			]);
		}

		if(!this._connections.has(key)){
			this._connections.set(key, []);
		}

		if(!this._pendingConnections.has(key)){
			this._pendingConnections.set(key, []);
		}

		let resolve, reject;
		const promise = new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		});

		const pendingConnections = this._pendingConnections.get(key);
		pendingConnections.push(promise);

		const responseParser = new Parser();

		responseParser.on('error', error => {
			if([ 'E_INVALID_CONTENT_LENGTH', 'E_INVALID_CHUNK_SIZE' ].includes(error.code)){
				connection.emit('error', error);
				connection.close();
			}
		});

		const sendingStrategy = this._pipelining
			? new Pipeline(
				responseParser,
				{
					maxRequests: this._maxPipelinedRequestsByConnection
				}
			)
			: new Sequential();

		const connection = new Connection(
			options,
			responseParser,
			new RequestSender(
				sendingStrategy
			)
		);

		const connections = this._connections.get(key);

		connection.on('closed', () => {
			connections.splice(connections.indexOf(connection), 1);
		});

		connection.on('error', error => {
			reject(error);
		});

		connection.on('connected', () => {
			pendingConnections.splice(pendingConnections.indexOf(promise), 1);
			connections.push(connection);
			resolve(connection);
		});

		return promise;
	}

	/**
	 * Returns a connection for the given host and port.
	 * @param options
	 * @return {Promise<Connection>}
	 */
	async _getConnection(options){
		const host = options.host || 'localhost';
		const port = options.port || 80;

		const key = `${host}:${port}`;
		const connections = this._connections.get(key) || /** @type {Connection} */[];

		// Overtime we create as many connections as allowed.
		// pipelining is great but suffers from head-of-line blocking.
		// We want to avoid it as much as possible.
		let connection = await this._createConnection(options);
		if(connection) return connection;

		// TODO: store connection promises somewhere to mage subsequent call to getConnection
		// wait on the same connections without having to attach listeners.

		// We may have a most efficient option here, but this array should not be alrge
		// enough to be a bottleneck.
		/** @type {Connection[]} */
		const availableConnections = connections.filter(c => c.isAvailable());

		if(availableConnections.length === 0 && connections.length >= this._maxConnectionsByHost){
			throw new Error(
				`Max connections reached for host ${key}.`
				+ ` It seems like every connection is busy. Please increase maxConnectionsByHost`
				+ ` and/or maxRequestsByConnection.`);
		}

		// We select a random index between 0 and the array length to distribute the load
		// as much as possible.
		return selectConnectionIn(availableConnections);
	}

	/**
	 * Makes an HTTP request
	 * @param options
	 * @param {sendCallback} callback
	 */
	request(options, callback){
		if(this._closed){
			throw new Error('Client is closed. Create a new one to make more requests.');
		}

		this._getConnection(options).then(connection => {
			connection.send(options, callback);
		});
	}

	close(host = null, port = null){
		this._closed = true;

		if(host && port){
			const key = `${host}:${port}`;
			const connections = this._connections.get(key);
			if(!connections){
				return;
			}
			for(const connection of connections){
				connection.close();
			}
			this._connections.delete(key);
			return;
		}

		this._connections.forEach((connections, key) => {
			for(const connection of connections){
				connection.close();

				this._connections.delete(key);
			}
		});

		clearInterval(this._connectionWatcherHandle);
	}
}

module.exports = Client;

