/**
 * @implements {ISendingStrategy}
 */
class Sequential{

	acceptsMoreRequests() {
		throw new Error('Not implemented');
	}

	scheduleSend(request, responseCallback, callback) {
		throw new Error('Not implemented');
	}
}

module.exports = Sequential;