const createCompatibleWSServer = require('./lib/uWSCompatibleServerCreator');

// We do not want to ship a specific version of uWebSocket.js
// TODO : handle version potential incompatibilities
module.exports = function(uWebSocketDep){
	const {
		App,
		SSLApp
	} = uWebSocketDep;

	return {
		createCompatibleUWSServer : createCompatibleWSServer.bind({}, App, SSLApp)
	}
}