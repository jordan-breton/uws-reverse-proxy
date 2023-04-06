/**
 * @implements IDataResponseHandler
 */
class SequentialDataResponseHandler{

	handleSocketDataChunk(data) {
		throw new Error('Not implemented');
	}
}

module.exports = SequentialDataResponseHandler;