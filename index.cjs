const UWSProxy = require('./src/UWSProxy.cjs');

module.exports = {
	UWSProxy,
	createUWSConfig: UWSProxy.createUWSConfig,
	createHTTPConfig: UWSProxy.createHTTPConfig
};