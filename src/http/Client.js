// region Imports

const Parser = require("./1.1/Parser");
const Pipeline = require("./1.1/strategies/Pipeline");
const Sequential = require("./1.1/strategies/Sequential");
const Connection = require('./Connection');
const RequestSender = require("./1.1/Sender");

// endregion

// region Private functions

/**
 * @type {import('../../IRequestSender').Request} Request
 */


function selectConnectionIn(array){
	return array[Math.floor(Math.random() * array.length)];
}

// endregion

/**
 * HTTP client API. It acts as a Connection pool and randomly distribute the load between connections.
 *
 * It uses pipelining by default for HTTP/1.1.
 *
 * Sequential mode is not supported yet.
 */
class Client{

	// region Private properties

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

	/**
	 * @type {int} Max number of connections by host.
	 * @private
	 */
	_maxConnectionsByHost;

	/**
	 * @type {int} Max number of pipelined requests by connection.
	 * @private
	 */
	_maxPipelinedRequestsByConnection;

	/**
	 * @type {int} Timeout in ms for a connection to be considered as dead.
	 * @private
	 */
	_connectionTimeout;

	/**
	 * @type {int} Interval in ms to check for dead connections.
	 * @private
	 */
	_connectionWatcherInterval;

	/**
	 * @type {NodeJS.Timer} Interval handle for the connection watcher, allowing to call clearInterval
	 * @private
	 */
	_connectionWatcherHandle;

	/**
	 * @type {boolean} True if the client is closed.
	 * @private
	 */
	_closed;

	/**
	 * @type {boolean} True if pipelining is enabled.
	 * @private
	 */
	_pipelining;

	/**
	 * @type {int} Max number of stacked buffers under backpressure when sending request body
	 * to the target server.
	 * @private
	 */
	_maxStackedBuffers;

	// endregion

	/**
	 * @param {Object} [options]
	 * @param {boolean} [options.pipelining=true] Enable pipelining. False is not supported yet.
	 * @param {number} [options.connectionTimeout=5000] Timeout in ms for a connection to be considered as dead.
	 * @param {number} [options.maxConnectionsByHost=10] Max number of connections by host.
	 * @param {number} [options.connectionWatcherInterval=1000] Interval in ms to check for dead connections.
	 * @param {number} [options.maxPipelinedRequestsByConnection=100000] Max number of pipelined requests by connection.
	 * @param {number} [options.maxStackedBuffers=4096] Max number of stacked buffers under backpressure when sending
	 *                                                  request body to the target server. If this number is reached,
	 *                                                  the request is aborted.
	 */
	constructor(
		{
			pipelining = true,
			connectionTimeout = 5000,
			maxConnectionsByHost = 10,
			connectionWatcherInterval = 1000,
			maxPipelinedRequestsByConnection = 100000,
			maxStackedBuffers = 4096
		} = {}
	){
		this._pipelining = pipelining;
		this._connections = new Map();
		this._pendingConnections = new Map();
		this._connectionTimeout = connectionTimeout;
		this._maxStackedBuffers = maxStackedBuffers;
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

	// region Private methods

	/**
	 * Create a new connection. If the max number of connections by host is reached, it will select
	 * a random connection to return.
	 * @param {Request} request
	 * @return {Promise<Connection>}
	 * @private
	 */
	_createConnection(request){
		const key = `${request.host}:${request.port}`;

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
			request,
			responseParser,
			new RequestSender(
				sendingStrategy,
				{
					maxStackedBuffers: this._maxStackedBuffers
				}
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
	 * Returns a connection for the given host and port. It creates new connection for each host/port
	 * pair until the max number of connections is reached. Then it returns the first available connection
	 * for subsequent requests.
	 * @param {Request} request
	 * @return {Promise<Connection>}
	 */
	async _getConnection(request){
		const host = request.host || 'localhost';
		const port = request.port || 80;

		const key = `${host}:${port}`;
		const connections = this._connections.get(key) || /** @type {Connection} */[];

		// Overtime we create as many connections as allowed.
		// pipelining is great but suffers from head-of-line blocking.
		// We want to avoid it as much as possible, or at least to mitigate it.
		let connection = await this._createConnection(request);
		if(connection) return connection;

		// We may have a most efficient options here, but this array should not be large
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

	// endregion
	// region Public methods

	/**
	 * Makes an HTTP request and calls the callback when the response is received or
	 * an error occurs.
	 *
	 * Note: you can't get the response body. You'll only get the request, the response headers, status and status text
	 * and/or the error if any. The response is streamed directly to the Request.response object for performance reasons.
	 * @param {Request} request
	 * @param {sendCallback} callback
	 */
	request(request, callback){
		if(this._closed){
			throw new Error('Client is closed. Create a new one to make more requests.');
		}

		this._getConnection(request).then(connection => {
			connection.send(request, callback);
		}).catch(err => {
			callback(err);
		});
	}

	/**
	 * Close the client and all its pending connections. Force all pending requests to abort.
	 *
	 * If host and port are provided, only the connections to the given host and port will be closed.
	 * @param {string|null} [host]
	 * @param {number|string|null} port
	 */
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

	// endregion
}

module.exports = Client;

