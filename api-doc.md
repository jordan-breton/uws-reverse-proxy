## Classes

<a href="#UWSProxy">UWSProxy</a>

<p>A proxy allowing uWebSockets.js to be compatible with any http server by proxying http requests</p>

<a name="UWSProxy"></a>

## UWSProxy

<p>A proxy allowing uWebSockets.js to be compatible with any http server by proxying http requests</p>

**Kind**: global class

* [UWSProxy](#UWSProxy)
    * [new UWSProxy(uwsConfig, httpConfig, opts)](#new_UWSProxy_new)
    * _static_
        * [.createHTTPConfig([config])](#UWSProxy.createHTTPConfig) ⇒ [`UWSProxyHTTPConfig`](#UWSProxyHTTPConfig)
        * [.createUWSConfig(uWebSocket, opts)](#UWSProxy.createUWSConfig) ⇒ [`UWSProxyUWSConfig`](#UWSProxyUWSConfig)
    * _instance_
        * [.http](#UWSProxy+http) ⇒ [`UWSProxyHTTPConfig`](#UWSProxyHTTPConfig)
        * [.start()](#UWSProxy+start)
        * [.uws](#UWSProxy+uws) ⇒ [`UWSProxyUWSConfig`](#UWSProxyUWSConfig)

<a name="new_UWSProxy_new"></a>

### new UWSProxy(uwsConfig, httpConfig, opts)

| Param      | Type                                        |
|------------|---------------------------------------------|
| uwsConfig  | [`UWSProxyUWSConfig`](#UWSProxyUWSConfig)   | 
| httpConfig | [`UWSProxyHTTPConfig`](#UWSProxyHTTPConfig) | 
| opts       | [`UWSProxyOpts`](#UWSProxyOpts)             | 

<a name="UWSProxy.createHTTPConfig"></a>

### UWSProxy.createHTTPConfig([config]) ⇒ [`UWSProxyHTTPConfig`](#UWSProxyHTTPConfig)

<p>Create a valid httpConfiguration</p>

**Kind**: static method of [`UWSProxy`](#UWSProxy)

**Summary**: <p>Create a valid httpConfiguration.</p>

| Param     | Type                                                  | Default          | Description                  |
|-----------|-------------------------------------------------------|------------------|------------------------------|
| [config]  | [`UWSProxyHTTPConfigOpts`](#UWSProxyHTTPConfigOpts)   | <code>{}</code>  | <p>Configuration object</p>  |

<a name="UWSProxy.createUWSConfig"></a>

### UWSProxy.createUWSConfig(uWebSocket, opts) ⇒ [`UWSProxyUWSConfig`](#UWSProxyUWSConfig)

<p>Creates a valid uwsConfiguration</p>

**Kind**: static method of [`UWSProxy`](#UWSProxy)

**Summary**: <p>Creates a valid uwsConfiguration.</p> 

| Param       | Type                                                       |
|-------------|------------------------------------------------------------|
| uWebSocket  | [`UWS`](#UWS) &#124; [`UWSTemplatedApp`](#UWSTemplatedApp) | 
| opts        | [`UWSProxyUWSConfigOpts`](#UWSProxyUWSConfigOpts)          | 

<a name="UWSProxy+http"></a>

### uwsProxy.http ⇒ [`UWSProxyHTTPConfig`](#UWSProxyHTTPConfig)

<p>A shallow copy of the http configuration</p>
<p>Note that the <code>config</code> object is the raw object passed as a parameter.</p>

**Kind**: instance property of [`UWSProxy`](#UWSProxy)

**Summary**: <p>A shallow copy of the http configuration</p>

<p>Note that the <code>config</code> object is the raw object passed as a parameter.</p>  

<a name="UWSProxy+start"></a>

### uwsProxy.start()

<p>Attach routes listeners to uWebSocket to start proxying.</p>

**Kind**: instance method of [`UWSProxy`](#UWSProxy)

**Summary**: Attach routes listeners to uWebSocket to start proxying.  

**Important**: This action can't be undone. uWebSockets.js do not allow listeners removal.

<a name="UWSProxy+uws"></a>

### uwsProxy.uws ⇒ [`UWSProxyUWSConfig`](#UWSProxyUWSConfig)

<p>A shallow copy of the uWebSocket configuration.</p>
<p>Note that the <code>config</code> object is the raw object passed as a parameter.</p>

**Kind**: instance property of [`UWSProxy`](#UWSProxy)

**Summary**: A shallow copy of the uWebSocket configuration. 

<a name="UWSProxyHTTPConfig"></a>

## UWSProxyHTTPConfig

**Kind**: global typedef

**Properties**

| Name     | Type                                                 | Description                                                  |
|----------|------------------------------------------------------|--------------------------------------------------------------|
| config   | [`UWSProxyHTTPConfigOpts`](#UWSProxyHTTPConfigOpts)  | <p>Raw configuration passed to UWSProxy.createHTTPConfig</p> |
| protocol | `http` &#124; `https`                                | <p>HTTP protocol</p>                                         |
| port     | int                                                  | <p>Listening port</p>                                        |
| host     | string                                               | <p>HTTP host</p>                                             |

<a name="UWSProxyHTTPConfigOpts"></a>

## UWSProxyHTTPConfigOpts

**Kind**: global typedef

**Properties**

| Name      | Type                  | Default                              | Description                                          |
|-----------|-----------------------|--------------------------------------|------------------------------------------------------|
| protocol  | 'http' &#124; 'https' | <code>&#x27;http&#x27;</code>        | <p>Server protocol</p>                               |
| port      | int                   | <code>35974</code>                   | <p>Private port the HTTP server must listen to</p>   |
| host      | string                | <code>&quot;127.0.0.1&quot;</code>   | <p>HTTP host. Default is the loop-back address.</p>  |
| quiet     | boolean               | <code>false</code>                   | <p>Disable configuration warning printing</p>        |

<a name="UWSProxyOpts"></a>

## UWSProxyOpts

**Kind**: global typedef

**Properties**

| Name                            | Type                                                 | Default           | Description                                                                                   |
|---------------------------------|------------------------------------------------------|-------------------|-----------------------------------------------------------------------------------------------|
| backpressure                    | Object                                               | <code>{}</code>   |                                                                                               |
| backpressure.maxStackedBuffers  | int                                                  | <code>4096</code> |                                                                                               |
| headers                         | Object.&lt;string, (stringArray.&lt;string&gt;)&gt;  | <code>{}</code>   | <p>Additional headers always appended to the proxy request (not on the client's response)</p> |
| routes                          | Object.&lt;string, string&gt;                        |                   | <p>Routes we want the proxy request handlers to listen to</p>                                 |
| on                              | Object.&lt;string, function()&gt;                    | <code>{}</code>   | <p>Collection of optional callbacks</p>                                                       |
| on.error                        | function &#124; null                                 | <code>''</code>   | <p>Called when a proxy request fails for whatever reason.</p>                                 |

<a name="UWSProxyUWSConfig"></a>

## UWSProxyUWSConfig

**Kind**: global typedef

**Properties**

| Name   | Type                                              |
|--------|---------------------------------------------------|
| ssl    | boolean                                           | 
| port   | int                                               | 
| config | [`UWSProxyUWSConfigOpts`](#UWSProxyUWSConfigOpts) | 
| server | [`UWSTemplatedApp`](#UWSTemplatedApp)             | 

<a name="UWSProxyUWSConfigOpts"></a>

## UWSProxyUWSConfigOpts

**Kind**: global typedef

**Properties**

| Name   | Type                                                                                                 | Default            | Description                                                                                                                                          |
|--------|------------------------------------------------------------------------------------------------------|--------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| ssl    | boolean &#124; null                                                                                  | <code></code>      | <p>If true, inform the Proxy that trafic is encrypted (it matters to set proxy Headers and create (if not provided) an SSLApp instead of an App)</p> |
| port   | int                                                                                                  | <code>443</code>   | <p>Public port uWebSocket server is listening to</p>                                                                                                 |
| quiet  | boolean                                                                                              | <code>false</code> | <p>Disable configuration warning printing</p>                                                                                                        |
| config | [`UWSAppOptions`](https://unetworking.github.io/uWebSockets.js/generated/interfaces/AppOptions.html) | <code>{}</code>    | <p>See uWebSockets.js AppOptions</p>                                                                                                                 |

## Typedefs

<a href="#UWSProxyHTTPConfig">UWSProxyHTTPConfig</a>

<a href="#UWSProxyHTTPConfigOpts">UWSProxyHTTPConfigOpts</a>

<a href="#UWSProxyOpts">UWSProxyOpts</a>

<a href="#UWSProxyUWSConfig">UWSProxyUWSConfig</a>

<a href="#UWSProxyUWSConfigOpts">UWSProxyUWSConfigOpts</a>




