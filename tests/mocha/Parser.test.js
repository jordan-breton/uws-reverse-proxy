const Parser = require('../../src/http/1.1/Parser');
const { TextDecoder } = require('util');

const textDecoder = new TextDecoder();

function bufferToString(buffer){
	return textDecoder.decode(buffer);
}

const { describe, it } = require('mocha');
const assert = require('assert');

const RESPONSES = {
	// Simple response with fixed content length
	SIMPLE_FIXED: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Content-Length: 12\r\n'
		+ '\r\n'
		+ 'Hello World!',

	// Simple response with chunked encoding
	SIMPLE_CHUNKED: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Transfert-Encoding: chunked\r\n'
		+ '\r\n'
		+ 'c\r\n'
		+ 'Hello World!\r\n'
		+ '0\r\n'
		+ '\r\n',

	// Long response with fixed content length
	LONG_FIXED: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Content-Length: 12000\r\n'
		+ '\r\n'
		+ 'Hello World!'.repeat(1000)
}

describe('HTTP responses parser', () => {
	it('Should emit a "header" event with proper headers, status code, status text and http version', done => {
		const parser = new Parser();
		parser.on('headers', ({
            headers,
            statusCode,
            statusMessage,
            version
        }) => {
			try{
				assert.strictEqual(statusCode, 200);
				assert.strictEqual(statusMessage, 'OK');
				assert.strictEqual(version, 'HTTP/1.1');

				assert.strictEqual(headers['content-type'], 'text/plain');
				assert.strictEqual(headers['content-length'], 12);

				done();
			}catch(err){
				done(err);
			}
		});

		parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED));
	});

	it('Should parse a simple response, given as a single buffer', (done) => {

		const parser = new Parser();
		parser.on('headers', ({
            headers,
            statusCode,
            statusMessage,
            version
        }) => {
			assert.strictEqual(statusCode, 200);
			assert.strictEqual(statusMessage, 'OK');
			assert.strictEqual(version, 'HTTP/1.1');

			assert.strictEqual(headers['content-type'], 'text/plain');
			assert.strictEqual(headers['content-length'], 12);
		});

		parser.on('body_chunk', (chunk, isLast) => {
			assert.strictEqual(bufferToString(chunk), 'Hello World!');
			assert.strictEqual(isLast, true);

			done();
		});

		parser.on('error', error =>{
			throw error;
		});

		parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED));

	});
});