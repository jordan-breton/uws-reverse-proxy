const { Readable } = require('stream');
const { Buffer } = require('buffer');

/**
 * @typedef UWSBodyStreamConfig
 * @property {int} [maxStackedBuffers=4096] Default: `4096` - Basically, a chunk size will be 500ko on average.
 *                                          this limit is huge by default (4096 * 500ko ~= 2Go).
 *                                          The fact is that uWebSockets.js receive faster than http.client
 *                                          can send, and if this number is too low, the request will be aborted
 *                                          to avoid congestions.
 * @private
 */

// TODO: delete createBufferCopy, and use Uint8Array instead of Buffer

/** *
 * Translate a uWebSockets.js body data stream into a Readable stream, taking backpressure
 * into consideration.
 *
 * @private
 */
class UWSBodyStream extends Readable{
	_uwsResponse;
	_sendingQueue = [];
	_lastChunkReceived = false;
	_maxStackedBuffers = 4096;

	/**
	 * @param {UWSResponse} uwsResponse uWebSockets.js Response object. Request body is in there. Pretty counter-intuitive.
	 * @param {ReadableOptions & UWSBodyStreamConfig} config Stream configuration options.
	 * @see https://nodejs.org/api/stream.html_new-streamreadableoptions
	 */
	constructor(uwsResponse, config = {}) {
		super(config);

		// with 512ko/chunk it represents almost 2Go of backpressure allowed by stream
		this._maxStackedBuffers = config.maxStackedBuffers || 4096;
		this._uwsResponse = uwsResponse;

		// Immediately start to read data in res.
		uwsResponse.onData((chunk, isLast) => {
			this._lastChunkReceived = isLast;
			this._trySendChunk(Buffer.from(chunk));

			if(isLast) this._tryEnd();
		});
	}

	/**
	 * Try to send a chunk and buffer it if we encounter backpressure.
	 * @param {Uint8Array} buffer
	 */
	_trySendChunk(buffer){
		if(!this.push(new Uint8Array(buffer))){
			if(this._sendingQueue.length === this._maxStackedBuffers){

				this.destroy(new Error(
					'Max backpressure threshold reached! Connection dropped.'
				));

				try{
					// Will throw if already closed/aborted, we can ignore it.
					this._uwsResponse.close();
				}catch(err){}

				return false;
			} else {
				this._sendingQueue.push(buffer);

				return false;
			}
		}

		return true;
	}

	/**
	 * Try to end the current stream. Will only close if the sending queue is empty.
	 */
	_tryEnd(){
		if(this._sendingQueue.length === 0 && this._lastChunkReceived) this._close();
	}

	/**
	 * End the stream then destroy it.
	 */
	_close(){
		this.push(null);
		this.destroy();
	}

	_read(n){
		// Sending as many data as we can to empty the sendQueue filled by backpressure.
		while (this._sendingQueue.length > 0 && this._trySendChunk(this._sendingQueue[0])){
			this._sendingQueue.shift();
		}

		// Close if no data remains to stream.
		if(this._sendingQueue.length === 0 && this._lastChunkReceived) this._close();
	}

	_destroy(error, callback) {
		this._sendingQueue = [];
		callback(error);
	}
}

module.exports = UWSBodyStream;