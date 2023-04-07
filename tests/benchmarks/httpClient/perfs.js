const { performance } = require('perf_hooks');

const Client = require('../../../src/http/Client');
const client = new Client();

// Define the number of requests to make
const NUM_REQUESTS = Number.parseInt(process.argv[2]) || 50000;
const START_TIME = performance.now();

let requestsEnded = 0;

for (let i = 0; i < NUM_REQUESTS; i++) {
	client.request({
		path: '/',
		host: '127.0.0.1',
		port: 3000
	}, (err, res) => {
		if(err) console.error(err);

		res.body.on('data', () => undefined);
		res.body.on('end', () => {
			requestsEnded++;

			if(requestsEnded === NUM_REQUESTS){
				console.log(`Total requests: ${NUM_REQUESTS}`);
				console.log(`Total time taken: ${performance.now() - START_TIME}ms`);
				console.log(`Requests per second: ${NUM_REQUESTS / (performance.now() - START_TIME) * 1000}rps`);
				client.close();
			}
		});
	});
}