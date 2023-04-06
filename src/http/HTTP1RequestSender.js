/**
 * @implements {IRequestSender}
 */
class HTTP1RequestSender {
	_requestBuffer;
	_sendingStrategy;

	constructor(sendingStrategy){
		this._requestBuffer = new Map();
		this._sendingStrategy = sendingStrategy;
	}

	acceptsMoreRequests(){
		return this._sendingStrategy.acceptsMoreRequests();
	}

	close(){
		this._sendingStrategy.close();
	}

	_send(socket, request) {
		const rawHeaders = `${request.method.toUpperCase()} ${request.path} HTTP/1.1\r\n`
			+ `host: ${request.host}:${request.port}\r\n`
			+ `connection: keep-alive\r\n`
			+ Object.keys(request.headers).map(key => `${key}: ${request.headers[key]}`).join('\r\n')
			+ '\r\n\r\n';

		let sent = socket.write(rawHeaders, 'utf8');
		if(!sent){
			// we have backpressure
			this._requestBuffer.set(request, true);
			socket.once('drain', () => {
				this._requestBuffer.delete(request);
				this._stream(socket, request);
			});
		} else {
			// we can start to send the body
			this._stream(socket, request);
		}
	}

	send(socket, request, callback) {
		if(!request.path) request.path = '/';
		if(!request.method) request.method = 'GET';
		if(!request.headers) request.headers = {};
		if(!request.metadata) request.metadata = {};

		this._sendingStrategy.scheduleSend(
			request,
			callback,
			() => this._send(socket, request)
		);
	}

	_stream(socket, request){
		const { headers, body } = request;

		// The body is empty. Nothing more to send.
		if(!body) return;

		if('content-length' in headers ){
			if (headers['content-length'] === 0){
				body.destroy();
				return;
			}
		}

		body.on('data', (chunk) => {
			let sent = socket.write(chunk);
			if(!sent){
				// we have backpressure
				this._requestBuffer.set(request, true);

				body.pause();

				socket.once('drain', () => {
					this._requestBuffer.delete(request);
					body.resume();
				});
			}
		});

		// The body stream encounter an error. We need to abort the request.
		body.on('error', (err) => {
			const { headers } = request;

			if('content-length' in headers){
				/**
				 * @see https://www.ietf.org/rfc/rfc2616.txt
				 * 8.2.2 Monitoring Connections for Error Status Messages
				 *
				 * If the body was preceded by a Content-Length header, the client MUST
				 * close the connection.
				 */
				socket.destroy(err);
			}else if(headers['content-encoding'] === 'chunked'){
				/**
				 * @see https://www.ietf.org/rfc/rfc2616.txt
				 * 8.2.2 Monitoring Connections for Error Status Messages
				 *
				 * If the body is being set using a "chunked" encoding (section 3.6), a zero length
				 *  chunk and empty trailer MAY be used to prematurely mark the end of the message.
				 */
				socket.write('0\r\n\r\n', 'utf8');
			}
		});
	}
}

module.exports = HTTP1RequestSender;