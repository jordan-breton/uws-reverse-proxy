/**
 * Write the readStream into the uWebSocket.js response object, taking backpressure into consideration.
 * @param res
 * @param {module:http.IncomingMessage} readStream
 */
module.exports = function(
	res,
	readStream
){
	// We do not know the length beforehand, so we must use a flag to end the response when the
	// read stream is closed.
	let shouldEnd = false;

	// Keep a count of read/write to be able to know when to close, when shouldEnd is true,
	// because of backpressure, you could have shouldEnd to true because the readStream have been consumed,
	// but bytesRead > bytesWritten
	// We don't want to randomly truncate our results :)
	let bytesRead = 0;
	let bytesWritten = 0;

	const destroyStream = (err) =>{
		return !readStream.destroyed && readStream.destroy(err);
	}

	res.onAborted(() => destroyStream(new Error('Aborted')));

	const onError = err => {
		destroyStream(err);
	}

	/**
	 * Received chunk of data
	 * @param {Buffer} chunk
	 */
	const onDataChunk = async chunk => {
		const currentChunkLength = chunk.byteLength;
		bytesRead += currentChunkLength;

		try{
			const arrayBufferChunk = chunk.buffer.slice(
				chunk.byteOffset,
				chunk.byteOffset + chunk.byteLength
			);

			const lastOffset = res.getWriteOffset();
			const ok = res.write(arrayBufferChunk);

			if(!ok){
				// We have backpressure
				readStream.pause();

				// We listen for backpressure drain
				res.onWritable( offset => {
					const bufferChunkLength = arrayBufferChunk.byteLength;
					const ok = res.write(arrayBufferChunk.slice(offset - lastOffset));

					// Backpressure released
					if(ok){
						// Data have been written, we must add the written bytes length to the write counter.
						bytesWritten += bufferChunkLength - (offset - lastOffset);
						readStream.resume();

						// Close if no data remains to read.
						if(shouldEnd && bytesWritten === bytesRead){
							res.end();
						}
					}

					return ok;
				});
			}else{
				//It has been successfully written, we can count it.
				bytesWritten += lastOffset + currentChunkLength;
			}

			// Close if no data remains to read.
			if(shouldEnd && bytesWritten === bytesRead){
				res.end();
			}
		}catch(err){
			//certainly aborted
			destroyStream(err);
		}
	};

	readStream.on('data', onDataChunk)
		.on('error', onError)
		.on('close', () => {
			// There was no backpressure, data has been sent, so we can end now.
			if(bytesWritten === bytesRead) res.end();
			else shouldEnd = true;
		})
		.on('end', () => {
			destroyStream();
		});

	readStream.resume();
}