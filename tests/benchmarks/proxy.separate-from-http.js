const host = '127.0.0.1';
const port = 3005;
const httpPort = 3000;
const httpHost = '127.0.0.1';

const uWebSockets = require('uWebSockets.js');

// region Proxy server

const { UWSProxy, createUWSConfig, createHTTPConfig } = require('../../index');

const proxy = new UWSProxy(
	createUWSConfig(uWebSockets, { port }),
	createHTTPConfig({ protocol: 'http', host: httpHost, port: httpPort })
);
proxy.start();
proxy.uws.server.listen(host, port, listening => {
	if(listening){
		console.log(`uWebSockets.js listening on port ${host}:${port}`);
	}else{
		console.error(`Unable to listen on port ${host}:${port}!`);
	}
});

// endregion