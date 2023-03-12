/**
 * @private
 *
 * Write the readStream into the uWebSockets.js response object, taking backpressure into consideration.
 * @param {UWSResponse} uwsResponse
 * @param {Readable} readStream
 */
function streamToUWSResponse(
	uwsResponse,
	readStream
){
	// We do not know the length beforehand, so we must use a flag to end the response when the
	// read stream is closed.
	let shouldEnd = false;

	// Keep a count of read/write to be able to know when to close, when shouldEnd is true.
	// Because of backpressure, we could have shouldEnd to true because the readStream have been consumed,
	// but bytesRead > bytesWritten
	//
	// We don't want to randomly truncate our responses :)
	let bytesRead = 0;
	let bytesWritten = 0;

	// Will call response.end() if the readStream is closed AND all read bytes have been written.
	const end = () => {
		if(shouldEnd && bytesWritten === bytesRead){
			try{
				uwsResponse.end();
			}catch(err){
				// Nothing to do, we just ignore it. We want it closed anyway.
			}
		}
	}

	const destroyStream = (err) => {
		return !readStream.destroyed && readStream.destroy(err);
	}

	uwsResponse.onAborted(() => destroyStream(new Error('Aborted')));

	readStream.on('data', async chunk => {
		bytesRead += chunk.byteLength;

		try{
			const arrayBufferChunk = chunk.buffer.slice(
				chunk.byteOffset,
				chunk.byteOffset + chunk.byteLength
			);

			uwsResponse.cork(() => {
				const ok = uwsResponse.write(arrayBufferChunk);
				if(!ok){
					// We have backpressure
					readStream.pause();

					// We listen for backpressure drain
					uwsResponse.onWritable(function (){
						// Bytes have been written by uWebSockets, we can resume
						bytesWritten += chunk.byteLength;
						readStream.resume();

						// Close if no data remains to read
						end();

						// According to uWebSockets.js doc, writing nothing is still a success.
						return true;
					});
				}else{
					// It has been successfully written, we can count it.
					bytesWritten += chunk.byteLength;
				}
			})

			// Close if no data remains to read.
			end();
		}catch(err){
			//certainly aborted
			destroyStream(err);
		}
	});

	readStream.on('error', err => destroyStream(err));
	readStream.on('close', () => {
		shouldEnd = true;
		end();
	});
	readStream.on('end', destroyStream);

	readStream.resume();
}

module.exports = streamToUWSResponse;