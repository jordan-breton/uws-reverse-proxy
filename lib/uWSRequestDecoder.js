//region Imports...

const TextDecoder  = new (require('util').TextDecoder)();

//endregion

/**
 * @warning Work with uWebSocket.js webservers (http and websockets).
 */
class RequestDecoder{
	createContext(req,res){
		const context = {
			request : { headers : {}, cookies : {}, query : {} },
			client : { remoteAddress : '0.0.0.0', proxiedRemoteAddress : null}
		};

		req.forEach((k,v)=>{ context.request.headers[k] = v; });
		context.request.url = req.getUrl();
		context.request.method = req.getMethod();
		context.request.query = {};
		decodeURIComponent(req.getQuery()).split('&').forEach(arg => {
			const split = arg.split('=');

			if(split.length === 0) return;

			let currentObj = context.request.query;
			let lastKey = split[0];

			if(split[0].match(/\[/)){
				//we have an array or a multi-dimensional array
				split[0].split('[').forEach( (k,i,arr) => {
					const cleanKey = lastKey = k.replace(/]$/,'');
					if(i !== arr.length - 1){
						if(!(cleanKey in currentObj)) currentObj = currentObj[cleanKey] = {};
						else currentObj = currentObj[cleanKey];
					}
				});
			}

			currentObj[lastKey] = split.length > 1 ? split[1] : null;
		});

		context.request.cookies = (context.request.headers.cookie || '').split(';').map(s=>{
			const res = s.split('=');
			res[0] = res[0].trim();
			return res;
		}).reduce((prev,current)=>{
			prev[current[0]] = current[1];
			return prev;
		},{});

		context.client.remoteAddress = context.request.headers['x-forwarded-for'] ||
			TextDecoder.decode(res.getRemoteAddressAsText());

		context.client.proxiedRemoteAddress = TextDecoder.decode(res.getProxiedRemoteAddressAsText());

		if(context.client.proxiedRemoteAddress.length === 0)
			context.client.proxiedRemoteAddress = null;

		return context;
	}
}

module.exports = RequestDecoder;