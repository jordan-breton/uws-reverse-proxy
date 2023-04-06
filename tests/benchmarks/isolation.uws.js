const uWebSockets = require('uWebSockets.js');

const app = uWebSockets.App();

app.get('/', res => {
	res.cork(() => {
		res.end('Hello world!');
	});
});

app.listen('127.0.0.1', 3000, listenSocket => {
	if(listenSocket) {
		console.log('Listening to port 3000');
	} else {
		console.log('Failed to listen to port 3000');
	}
});