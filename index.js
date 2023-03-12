const UWSProxy = require('./src/UWSProxy');

module.exports = {
	UWSProxy,
	createUWSConfig: UWSProxy.createUWSConfig,
	createHTTPConfig: UWSProxy.createHTTPConfig
};