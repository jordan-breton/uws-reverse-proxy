/**
 * @file Sequential request sender strategy implementation.
 */

/**
 * @implements {ISendingStrategy}
 */
class Sequential {

	acceptsMoreRequests() {
		throw new Error('Not implemented');
	}

	scheduleSend(_request, _responseCallback, _callback) {
		throw new Error('Not implemented');
	}

	close() {
		throw new Error('Not implemented');
	}
}

module.exports = Sequential;