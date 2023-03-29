# uws-reverse-proxy

This project is an **easy-to-use 0-dependency**\* reverse proxy based on [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js/). It enables use of `uWebSockets.js` and any `http`
server (as [express](https://www.npmjs.com/package/express), [NestJS](https://nestjs.com/), [Fastify](https://www.fastify.io/)) on **the same port**.

Tested with:

- uWebSockets.js v20.10.0
- NodeJS v18.0.0

\* _This package doesn't even depend on `uWebSockets.js` not to force any version usage, see in examples below._
   _That said, keep in mind that only the last version of uWebSockets.js has been tested._

## How does it work?

It basically uses `uWebSockets.js` as a reverse proxy for all non-websocket traffic and forward it to any
`http` server.

Then it will send the response back to the client without modification.

## Why? For what use case?

Don't use this package if you don't **really** need it.

You pretty much always want your NodeJS app available on only one port (**443**) for it to be accessible in restrictive **NATs**.

This project is aimed to provide a solution in **restricted server environments** such
as some cloud platforms like Heroku, where you can't set up a proxy like **Nginx** or **Apache** in front of your NodeJS application,
and where you often have only one public port available.

If you're not in a similar use case, just set up an **Nginx** or **Apache** proxy that will filter the requests to redirect them on
the good **private** port, they will be more efficient and flexible.

Conversely, if your server has to work in **restricted server environment** or if for whatever reason you want `uWebSockets.js` 
to handle all requests without standing behind a proxy, then this package is made for you :)

In the case of **express** you _could_ use a package like [http-proxy-middleware](https://www.npmjs.com/package/http-proxy-middleware)
to do the opposite (using `express` as a reverse proxy to forward requests to `uWebSockets.js`), but this doesn't seem to work at the time
I'm writing this, and **it defeats the main advantage of `uWebSockets.js`**: its astonishing performances.

## Important note about SSL

If `uWebSockets.js` and your `http` servers are on the same machine, you should not create an HTTPS server,
as TLS will add a useless overhead in a scenario like this:

```mermaid
sequenceDiagram
	participant C as Client
	box Public
	participant UWS as uWebSockets.js Reverse Proxy
	end
	box Private
	participant N as Node:http
	end
	C->>UWS: HTTPS request
	activate UWS
	UWS->>N: HTTP request
	activate N
	N->>UWS: HTTP Response
	deactivate N
	UWS->>C: HTTPS Response
	deactivate UWS
```

## Installation

With npm:

```bash
npm install uws-reverse-proxy
```

With yarn:

```bash
yarn add uws-reverse-proxy
```

## Usage

This section describes some usage scenario. You can even see them in action in the 
[examples repository](https://github.com/jordan-breton/uws-reverse-proxy-examples).

To see all available options, check the [code API documentation](https://jordan-breton.github.io/uws-reverse-proxy/).

### Basic

Simplest use-case: let the reverse proxy create everything on its own, configure your servers afterward.

```js
const uWebSockets = require('uWebSockets.js');
const http = require('http');

const {
	UWSProxy,
	createUWSConfig
} = require('uws-reverse-proxy');

const port = process.env.PORT || 80;

const proxy = new UWSProxy(
	createUWSConfig(
		uWebSockets,
		{ port }
	)
);

const httpServer = http.createServer((req, res) => {
	console.log('Incoming request: ', req);

	res.writeHead(200);
	res.end('Hello world :)');
});
httpServer.listen(
	proxy.http.port,
	proxy.http.host,
	() => console.log(`HTTP Server listening at ${proxy.http.protocol}://${proxy.http.host}:${proxy.http.port}`)
);

proxy.start();

// Configuring the uWebSockets.js app created by the proxy

// Setting up websockets
proxy.uws.server.ws({
	upgrade : () => {
		//...
	}
	// ...
});

// Listening
proxy.uws.server.listen('0.0.0.0', port, listening => {
	if(listening){
		console.log(`uWebSockets.js listening on port 0.0.0.0:${port}`);
	}else{
		console.error(`Unable to listen on port 0.0.0.0:${port}!`);
	}
});
```

Second use case: providing already created and listening `uWebSocket.js` server.

```js
const http = require('http');
const { App } = require('uWebSockets.js');

const port = process.env.PORT || 80;
const httpPort = process.env.HTTP_PORT || 35794;
const httpHost = process.env.HTTP_HOST || '127.0.0.1';

// Let's imagine that all the setup happen there, including listening
const httpServer =  http.createServer(/*...*/);
httpServer.listen(httpPort, httpHost, () => console.log(`HTTP server listening at http://${httpHost}:${httpPort}`));

const uwsServer = App();
uwsServer.ws({/* ... */});
uwsServer.listen('0.0.0.0', port, () => { /* ... */ });

const {
	UWSProxy,
	createUWSConfig,
	createHTTPConfig 
} = require('uws-reverse-proxy');

const proxy = new UWSProxy(
	createUWSConfig(
		uwsServer,
		{ port } // Must be specified to avoid a warning
	),
	createHTTPConfig(
		{
			port: httpPort, 
			host: httpHost
		}
	)
);
proxy.start();
```

The warning is there as a reminder especially if you use different ports than the default ones.

If you don't want (or can't) provide the `port`, you can silence the warning using the `quiet` option:

```js
const proxy = new UWSProxy(
	createUWSConfig(
		uwsServer,
		{ quiet: true }
	)
);
proxy.start();
```

### With SSL

Given the above examples, just change the options passed to `createUWSConfig`.

#### Letting the proxy creating the `uWebsockets.js SSLApp`:

```js
const uWebSocket = require('uWebSockets.js');
const { createUWSConfig } = require('uws-reverse-proxy');

createUWSConfig(
	uWebSocket,
	{
		config: {
			key_file_name: 'misc/key.pem',
			cert_file_name: 'misc/cert.pem'
		}
	}
)
```

#### Providing a `uWebsockets.js SSLApp`:

```js
const { SSLApp } = require('uWebSockets.js');
const { createUWSConfig } = require('uws-reverse-proxy');

const uwsServer = SSLApp({
	key_file_name: 'misc/key.pem',
	cert_file_name: 'misc/cert.pem'
});

createUWSConfig(
	uwsServer,
	{ quiet: true }
)
```

### Integration examples with Express, Koa, Fastify, Nestjs, Node:http

Please visit the [examples repository](https://github.com/jordan-breton/uws-reverse-proxy-examples).

It even contains a standalone mode to help you test `uws-reverse-proxy` with your own app without
changing a line of code for most projects.

**Keep in mind that it's... an HTTP reverse proxy. It can forward request to any HTTP server.**

## TODO

- [X] PoC (> v1.0.0)
- [X] Refactoring + Clean & stable implementation (>= v2.0.2)
  - [X] Flexible configuration
  - [X] Config validation
  - [X] Config warnings
  - [X] Configurable backpressure threshold
  - [X] Code comments & JSDOC
- [x] Generic reverse proxy for any HTTP/HTTPS server
- [x] Documentation
  - [x] Code API
  - [x] README
  - [X] A demo repository.
- [x] Publish on NPM 
- [x] Better error management
  - [x] Allow answering stream errors that are happening before the client response is written 
		with proper HTTP formatted response instead of shutting down the connection like a savage.
  - [x] Allow for errors customization 
- [ ] When a content-length header is present in the response, using uWebSockets.js `tryEnd` instead 
	  of `write`to avoid adding `Transfer-Encoding: chunked` to every request.
- [ ] Edge cases handling regarding proxying (HTTP 100 continue, headers cleanup)
- [ ] Testing a `node:http` client to [`undici`](https://github.com/nodejs/undici) client migration to see performances impact.
- [ ] More flexibility in requests routing through proxy (add more control options, like a pre-handler to allow or not
  forwarding based on custom logic.)
- [ ] Test uWebSockets.js version agnosticity for all uWebSockets.js versions.
  - [ ] Support backward compatibility
- [ ] Automated tests included in CI/CD
- [ ] Debugging mode with console logging
