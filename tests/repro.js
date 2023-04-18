const Parser = require("../src/http/1.1/Parser");
const assert = require("assert");
parser = new Parser();

const RESPONSES = {
	// simple response with chunked encoding and 2 chunks
	SIMPLE_CHUNKED_2: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Transfer-Encoding: chunked\r\n'
		+ '\r\n'
		+ '6\r\n'
		+ 'Hello \r\n'
		+ '6\r\n'
		+ 'World!\r\n'
		+ '0\r\n'
		+ '\r\n'
}

const NB_CHUNKS = 50;
const NB_RESPONSES = 1;

const fullResponse = Buffer.from(RESPONSES.SIMPLE_CHUNKED_2.repeat(NB_RESPONSES));
const chunkSize = Math.ceil(fullResponse.length / NB_CHUNKS);

let rebuiltResponse = '';
for(let i = 0; i < NB_CHUNKS; i++){
	if(NB_CHUNKS - 1 === i){
		parser.feed(fullResponse.subarray(i * chunkSize));
		rebuiltResponse += fullResponse.subarray(i * chunkSize).toString();
	}else{
		parser.feed(fullResponse.subarray(i * chunkSize, (i + 1) * chunkSize));
		rebuiltResponse += fullResponse.subarray(i * chunkSize, (i + 1) * chunkSize).toString();
	}
}

console.log({rebuiltResponse});

let nb = 0,
	body = '',
	aggregatedBodies = '';

parser.on('error', (err) => {
	console.log(err);
});
parser.on('body_chunk', (data, isLast) => {
	body += data.toString();

	console.log({ data: data.toString(), isLast })

	try{
		if(isLast){
			nb++;
			assert.strictEqual(body, 'Hello World!');
			aggregatedBodies += body;
			body = '';

			console.log(nb);

			if(nb === NB_RESPONSES){
				assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES));
				console.log('ok');
				process.exit();
			}
		}
	}catch(err){
		console.log(err);
	}
});

setTimeout(() => { console.log('timeout') }, 2000)
