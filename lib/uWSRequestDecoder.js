const TextDecoder  = new (require('util').TextDecoder)();

module.exports = function(res, req){
	const context = {
		request : { headers : {}, cookies : {}, query : {} },
		client : { remoteAddress : '0.0.0.0', proxiedRemoteAddress : null}
	};

	req.forEach((k,v)=>{ context.request.headers[k] = v; });
	context.request.url = req.getUrl();
	context.request.method = req.getMethod();
	context.request.query = req.getQuery();

	context.client.remoteAddress = context.request.headers['x-forwarded-for'] ||
		TextDecoder.decode(res.getRemoteAddressAsText());

	context.client.proxiedRemoteAddress = TextDecoder.decode(res.getProxiedRemoteAddressAsText());

	if(context.client.proxiedRemoteAddress.length === 0)
		context.client.proxiedRemoteAddress = null;

	return context;
};