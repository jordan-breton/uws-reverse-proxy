const Parser = require('../../src/http/1.1/Parser');

const NB_ITERATIONS_BY_RUN = 1000000;
let parsed = 0;

const toParse = 'HTTP/1.1 200 OK\r\n'
	+ 'Content-Type: text/plain\r\n'
	+ 'Content-Length: 12\r\n'
	+ '\r\n'
	+ 'Hello World!';

const buffer = Buffer.from(toParse);

const parser = new Parser();

parser.on('body_chunk', (_, isLast) => {
	if(isLast) {
		parsed++;

		if(parsed === NB_ITERATIONS_BY_RUN) {
			const end = process.hrtime(start);

			console.log('done');
			console.log('Parsing by seconds: ', NB_ITERATIONS_BY_RUN / (end[0] + end[1] / 1e9));
		}
	}
});

const start = process.hrtime();
for(let i = 0; i < NB_ITERATIONS_BY_RUN; i++){
	parser.feed(buffer);
}