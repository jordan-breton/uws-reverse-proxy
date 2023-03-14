const { Readable } = require('stream');
const { Buffer } = require('buffer');

/**
 * @typedef UWSBodyStreamConfig
 * @property {int} [maxStackedBuffers=4096] Basically, a chunk size will be 500ko on average.
 *                                          this limit is huge by default (4096 * 500ko ~= 2Go).
 *                                          The fact is that uWebSockets.js receive faster than http.client
 *                                          can send, and if this number is too low, the request will be aborted
 *                                          to avoid congestions.
 * @private
 */

/** *
 * Translate a uWebSockets.js body data stream into a Readable stream, taking backpressure
 * into consideration.
 *
 * @private
 */
class UWSBodyStream extends Readable{
	#uwsResponse;
	#sendingQueue = [];
	#lastChunkReceived = false;
	#maxStackedBuffers = 4096;

	/**
	 * Copy a buffer into another one without consuming the copied buffer.
	 * @param {Buffer} buffer
	 */
	static createBufferCopy(buffer){
		const copy = Buffer.alloc(buffer.byteLength);
		buffer.copy(copy);
		return copy;
	}

	/**
	 * @param {UWSResponse} uwsResponse uWebSockets.js Response object. Request body is in there. Pretty counter-intuitive.
	 * @param {ReadableOptions & UWSBodyStreamConfig} config Stream configuration options.
	 * @see https://nodejs.org/api/stream.html#new-streamreadableoptions
	 */
	constructor(uwsResponse, config = {}) {
		super(config);

		// with 512ko/chunk it represents almost 2Go of backpressure allowed by stream
		this.#maxStackedBuffers = config.maxStackedBuffers || 4096;
		this.#uwsResponse = uwsResponse;

		// Immediately start to read data in res.
		uwsResponse.onData((chunk, isLast) => {
			this.#lastChunkReceived = isLast;
			this.#trySendChunk(Buffer.from(chunk));

			if(isLast) this.#tryEnd();
		});
	}

	/**
	 * Copy a buffer into another one without consuming the copied buffer.
	 * @param {Buffer} buffer
	 */
	#createBufferCopy(buffer){
		return this.constructor.createBufferCopy(buffer);
	}

	/**
	 * Try to send a chunk and buffer it if we encounter backpressure.
	 * @param {Buffer} buffer
	 */
	#trySendChunk(buffer){
		if(!this.push(this.#createBufferCopy(buffer))){
			if(this.#sendingQueue.length === this.#maxStackedBuffers){

				this.destroy(new Error(
					'Max backpressure threshold reached! Connection dropped.'
				));

				try{
					// Will throw if already closed/aborted, we can ignore it.
					this.#uwsResponse.close();
				}catch(err){}

				return false;
			} else {
				this.#sendingQueue.push(buffer);

				return false;
			}
		}

		return true;
	}

	/**
	 * Try to end the current stream. Will only close if the sending queue is empty.
	 */
	#tryEnd(){
		if(this.#sendingQueue.length === 0 && this.#lastChunkReceived) this.#close();
	}

	/**
	 * End the stream then destroy it.
	 */
	#close(){
		this.push(null);
		this.destroy();
	}

	_read(n){
		// Sending as many data as we can to empty the sendQueue filled by backpressure.
		while (this.#sendingQueue.length > 0 && this.#trySendChunk(this.#sendingQueue[0])){
			this.#sendingQueue.shift();
		}

		// Close if no data remains to stream.
		if(this.#sendingQueue.length === 0 && this.#lastChunkReceived) this.#close();
	}

	_destroy(error, callback) {
		this.#sendingQueue = [];
		callback(error);
	}
}

module.exports = UWSBodyStream;