# uws-compat-layer

This project is a **easy-to-use 0-dependency** compatibility layer for `uWebSocket.js`. It enables use of `uWebSocket.js` and other `node:http` 
compatible libraries (as [express](https://www.npmjs.com/package/express)) on **the same port**.

## How does it works?

It basically use `uWebSocket.js` as a naive proxy for all non-websocket trafic and forward it to your
`node:http` based module/backend/application.

Then it will forward the response back to the client without modification.

## Why? For what use case?

Don't use this package if you don't **really** need it. 

You pretty much always want your NodeJS app available on only one port (**443**) for it to be accessible in restrictive **NATs**,
but you won't necessarily have to use a **restrictive production environment**.

If you have to or if for whatever reason you want `uWebSocket.js` to handle all requests without standing behind a proxy,
then this package is made for you :) 

It's aimed to provide a solution in **restrictive server environments** such
as some cloud platforms like Heroku, where you can't set up a real proxy in front of your NodeJS application. 

If you're not in a similar use case, just set up an **Nginx** or **Apache** proxy that will filter the requests to redirect them on
the good **private** port.

In the case of **express** you _could_ use a package like [http-proxy-middleware](https://www.npmjs.com/package/http-proxy-middleware)
to do the opposite of this package (using `express` as a proxy to forward requests to `uWebSocket.js`), but this doesn't seems to work at the time
I'm writing this, and **it defeats the main advantage of `uWebSocket.js`**: its astonishing performances.

## Important note about SSL

The `http` part of your NodeJS application will be used over `http`, not `https` because `uWebSocket.js` will handle the https part, and since
you're in a scenario where you want both `websockets` server and `http` server in the same app, it would not be very efficient to use SSL to 
secure what only happen locally.

**This package is not aimed to be a generic proxy based on `uWebSocket.js`.**

## Installation

With npm:

```bash
npm install github:jordan-breton/uws-compat-layer#v1.0.2
```

With yarn:

```bash
yarn add github:jordan-breton/uws-compat-layer#v1.0.2
```

## Usages

### Basic

```js
const http = require('http');
const { App, SSLApp } = require('uWebSockets.js');

const { createCompatibleUWSServer } = require('uws-compat-layer')(App, SSLApp);

const httpServer =  http.createServer(/*...*/);

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

### Advanced

