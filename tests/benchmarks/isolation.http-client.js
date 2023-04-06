const http = require('http');
const { performance } = require('perf_hooks');

// The goal is to test in the same condition as autocannon
http.globalAgent = new http.Agent({
	keepAlive: true,
	maxSockets: 10
});

// Define the number of requests to make
const NUM_REQUESTS = Number.parseInt(process.argv[2]) || 50000;
const START_TIME = performance.now();

let requestsEnded = 0;

for (let i = 0; i < NUM_REQUESTS; i++) {
	http.get('http://localhost:3000/', res => {
		res.on('data', () => {});
		res.on('close', () => {
			requestsEnded++;

			if(requestsEnded === NUM_REQUESTS){
				console.log(`Total requests: ${NUM_REQUESTS}`);
				console.log(`Total time taken: ${performance.now() - START_TIME}ms`);
				console.log(`Requests per second: ${NUM_REQUESTS / (performance.now() - START_TIME) * 1000}rps`);
			}
		});
	}).on('error', () => { console.error(); });
}