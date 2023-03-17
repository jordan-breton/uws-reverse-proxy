/** *
 * Write the readStream into the uWebSockets.js response object, taking backpressure into consideration.
 * @param {UWSResponse} uwsResponse
 * @param {ReadStream} readStream
 * @private
 */
function streamToUWSResponse(
	uwsResponse,
	readStream
){
	const destroyStream = (err) => {
		return !readStream.destroyed && readStream.destroy(err);
	}

	uwsResponse.onAborted(() => destroyStream(new Error('Response aborted')));

	readStream.on('close', () => {
		try{
			// No matter what happen, once the ReadStream have been closed, we must end the response.
			uwsResponse.end();
		}catch(err){}
	});
	readStream.on('data', chunk => {
		try{
			const ok = uwsResponse.write(chunk);
			if(!ok){
				// We have backpressure, we pause until uWebSockets.js tell us that the response
				// is writable.
				readStream.pause();

				uwsResponse.onWritable(() => {
					// Chunk sent, backpressure is gone, we can resume :)
					readStream.resume();
					return true;
				});
			}
		}catch(err){
			//certainly aborted
			destroyStream(err);
		}
	});
}

module.exports = streamToUWSResponse;