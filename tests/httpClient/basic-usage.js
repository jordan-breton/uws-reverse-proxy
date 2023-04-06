const Client = require('../../src/http/Client');

const client = new Client();
client.request({
	path: '/',
	host: '127.0.0.1',
	port: 3000
}, (err, res) => {
	if(err) console.error(err);

	res.body.on('data', (chunk) => {
		console.log(chunk.toString());

		client.close();
	});
});
