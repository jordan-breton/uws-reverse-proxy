# uws-compat-layer

This project is a **easy-to-use 0-dependency** compatibility layer for `uWebSocket.js`. It enables use of `uWebSocket.js` and other `node:http` 
compatible libraries (as [express](https://www.npmjs.com/package/express)) on **the same port**.


## How does it works?

It basically use `uWebSocket.js` as a dumb proxy for all non-websocket trafic and forward it to your 
`node:http` based application.

Then it will forward the response back to the client without modification.

## Why?

With some cloud providers, you only get one open port and can't open a second one.

In restrictive NAT, you even get only the **443** port to work with.

In the case of **express** you _could_ use a package like [http-proxy-middleware](https://www.npmjs.com/package/http-proxy-middleware)
to do the opposite of this package (using express as a proxy to forward requests to `uWebSocket.js`), but this doesn't works at any times
and **it defeat the main advantage of `uWebSocket.js`**: its astonishing performances.

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

