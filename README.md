# uws-compat-layer

This project is a **easy-to-use 0-dependency** compatibility layer for `uWebSockets.js`. It enables use of `uWebSockets.js` and other `node:http` 
compatible libraries (as [express](https://www.npmjs.com/package/express)) on **the same port**.

Tested with: 

- uWebSockets.js v20.10.0
- NodeJS v18.0.0

## How does it works?

It basically use `uWebSockets.js` as a naive proxy for all non-websocket trafic and forward it to your
`node:http` based module/backend/application.

Then it will send the response back to the client without modification.

## Why? For what use case?

Don't use this package if you don't **really** need it. 

You pretty much always want your NodeJS app available on only one port (**443**) for it to be accessible in restrictive **NATs**,
but you won't necessarily have to use a **restrictive production environment**.

If you have to or if for whatever reason you want `uWebSockets.js` to handle all requests without standing behind a proxy,
then this package is made for you :) 

It's aimed to provide a solution in **restrictive server environments** such
as some cloud platforms like Heroku, where you can't set up a real proxy in front of your NodeJS application. 

If you're not in a similar use case, just set up an **Nginx** or **Apache** proxy that will filter the requests to redirect them on
the good **private** port.

In the case of **express** you _could_ use a package like [http-proxy-middleware](https://www.npmjs.com/package/http-proxy-middleware)
to do the opposite of this package (using `express` as a proxy to forward requests to `uWebSockets.js`), but this doesn't seems to work at the time
I'm writing this, and **it defeats the main advantage of `uWebSockets.js`**: its astonishing performances.

## Important note about SSL

The `http` part of your NodeJS application will be used over `http`, not `https` because `uWebSockets.js` will handle the https part, and since
you're in a scenario where you want both `websockets` server and `http` server in the same app, it would not be very efficient to use SSL to 
secure what only happen locally.

**This package is not aimed to be a generic proxy based on `uWebSockets.js`.**

## Installation

With npm:

```bash
npm install github:jordan-breton/uws-compat-layer#v2.0.0
```

With yarn:

```bash
yarn add github:jordan-breton/uws-compat-layer#v2.0.0
```

## Usages

This section describe some usage scenario.

### Basic

Simplest use-case: 

```js
const http = require('http');
const uWebSocket = require('uWebSockets.js');

const {
	UWSProxy,
    createUWSConfig,
    createHTTPConfig 
} = require('uws-compat-layer');

const httpServer =  http.createServer(/*...*/);

const uwsConfig = createUWSConfig(
	uWebSocket,
	{
		port: 80
    }
);

const httpConfig = createHTTPConfig(
	httpServer,
	{
		port: 35794,
		on: {
			listen: () => console.log('HTTP server listening on private port 127.0.0.1:35794')
        }
    }
);

const proxy = new UWSProxy(
	createUWSConfig(
		uWebSocket,
		{
			port: 80
		}
	)
);
proxy.start();

uwsConfig.server.ws({
	upgrade : () => { /*...*/ },
	/* ... */
});

uwsConfig.server.listen('0.0.0.0', 80, listening => {
	if(listening){
		console.log('uWebSockets.js listening on port 0.0.0.0:80');
    }else{
		console.error('Unable to listen on port 0.0.0.0:80!');
    }
});
```

With HTTP configuration:

```js
const http = require('http');
const uWebSocket = require('uWebSockets.js');

const {
	UWSProxy,
    createUWSConfig,
    createHTTPConfig 
} = require('uws-compat-layer');

const httpServer =  http.createServer(/*...*/);

const uwsConfig = createUWSConfig(
	uWebSocket,
	{
		port: 80
    }
);

const httpConfig = createHTTPConfig(
	httpServer,
	{
		port: 35794,
		on: {
			listen: () => console.log('HTTP server listening on private port 127.0.0.1:35794')
        }
    }
);

const proxy = new UWSProxy(uwsConfig, httpConfig);
proxy.start();

uwsConfig.server.ws({
	upgrade : () => { /*...*/ },
	/* ... */
});

uwsConfig.server.listen('0.0.0.0', 80, listening => {
	if(listening){
		console.log('uWebSockets.js listening on port 0.0.0.0:80');
    }else{
		console.error('Unable to listen on port 0.0.0.0:80!');
    }
});
```

### With express

```js
const http = require('http');
const express = require('express');
const { App, SSLApp } = require('uWebSockets.js');

const { createCompatibleUWSServer } = require('uws-compat-layer')(App, SSLApp);

const app = express();
const httpServer =  http.createServer(app);

const { uWebSocket } = createCompatibleUWSServer(
    httpServer,
	{
        port: 80
    }
);

uWebSocket.ws({
    upgrade : () => { /*...*/ },
    /* ... */
});
```

## TODO

- [x] PoC (> v1.0.0)
- [x] Refactoring + Clean & stable implementation (> v2.0.0)
    - [x] Flexible configuration
    - [x] Config validation
    - [x] Config warnings
    - [x] Configurable backpressure threshold
    - [x] Code comments & JSDOC
- [ ] Documentation
- [ ] Better error management
    - [ ] Allow to answer to errors (like backpressure) with proper HTTP formatted response instead of
      shutting down the connection like a savage.
- [ ] Edge cases handling regarding proxying (HTTP 100 continue, headers cleanup)
- [ ] More flexibility in requests routing through proxy (add more control options, like a pre-handler to allow or not
  forwarding based on custom logic.)
- [ ] A demo repository.
- [ ] Test uWebSockets.js version agnosticity for all uWebSockets.js versions.
    - [ ] Support backward compatibility 
- [ ] Debugging mode with console logging