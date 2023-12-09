const Parser = require('../../src/http/1.1/Parser');

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
		+ 'Transfer-Encoding: chunked\r\n'
		+ '\r\n'
		+ 'c\r\n'
		+ 'Hello World!\r\n'
		+ '0\r\n'
		+ '\r\n',

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
		+ '\r\n',

	// Simple response with chunked encoding and 2 chunks and an extension
	CHUNKED_2_EXT: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Transfer-Encoding: chunked\r\n'
		+ '\r\n'
		+ '6; ext=test\r\n'
		+ 'Hello \r\n'
		+ '6\r\n'
		+ 'World!\r\n'
		+ '0\r\n'
		+ '\r\n',

	// Simple fixed length response with a header missing a CR
	SIMPLE_FIXED_MISSING_CR: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Content-Length: 12\n'
		+ '\r\n'
		+ 'Hello World!',

	INVALID_CONTENT_LENGTH: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Content-Length: zzz\r\n'
		+ '\r\n'
		+ 'Hello World!',

	SIMPLE_CHUNKED_MISSING_CR: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Transfer-Encoding: chunked\r\n'
		+ '\r\n'
		+ '12\n'
		+ 'Hello World!\r\n'
		+ '0\r\n'
		+ '\r\n',

	INVALID_CHUNK_SIZE: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Transfer-Encoding: chunked\r\n'
		+ '\r\n'
		+ 'zzz\r\n'
		+ 'Hello World!\r\n'
		+ '0\r\n'
		+ '\r\n',

	NO_CHUNK_SIZE: 'HTTP/1.1 200 OK\r\n'
		+ 'Content-Type: text/plain\r\n'
		+ 'Transfer-Encoding: chunked\r\n'
		+ '\r\n'
		+ '\r\n'
		+ 'Hello World!\r\n'
		+ '0\r\n'
		+ '\r\n',
}

describe('HTTP responses parser', () => {

	describe('Parsing a single response', () => {

		describe('Fixed length, one buffer', () => {

			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED));
				});
			});

			it('Must emit a "headers" event with proper headers, status code, status text and http version', done => {
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
			});

			it('Must emit a "body_read_mode" event with value "FIXED"', done => {
				parser.on('body_read_mode', (mode) => {
					try{
						assert.strictEqual(mode, 'FIXED');

						done();
					}catch(err){
						done(err);
					}
				});
			});

			it('Must emit a "body_chunk" event with the body content', done => {
				parser.on('body_chunk', (data, isLast) => {
					try{
						assert.strictEqual(data.toString(), 'Hello World!');
						assert.strictEqual(isLast, true);

						done();
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});
		});

		describe('Chunked, one chunk, one buffer', () => {

			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_CHUNKED));
				})
			});

			it('Must emit 2 "body_chunk" events. The first one with data, the last one empty with isLast = true', done => {
				parser.on('body_chunk', (data, isLast) => {
					try{
						if(isLast){
							assert.strictEqual(data.toString(), '');
							done();
						}else{
							assert.strictEqual(data.toString(), 'Hello World!');
						}
					}catch(err){
						done(err);
					}
				});
			});

			it('Must emit a "body_read_mode" event with value "CHUNKED"', done => {
				parser.on('body_read_mode', (mode) => {
					try{
						assert.strictEqual(mode, 'CHUNKED');

						done();
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});
		});

		describe('Chunked, 2 chunks, one buffer', () => {

			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_CHUNKED_2));
				});
			});

			it('Must emit 3 "body_chunk" events. The first 2 with partial body content, the last one empty with isLast = true', done => {
				let i = 0;
				const PARTS = ['Hello ', 'World!'];

				parser.on('body_chunk', (data, isLast) => {
					try{
						if(isLast){
							assert.strictEqual(data.toString(), '');
							done();
						}else{
							assert.strictEqual(data.toString(), PARTS[i++]);
						}
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

		describe('Chunked, 2 chunks (one with extension), one buffer', () => {

			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.CHUNKED_2_EXT));
				});
			});

			it('Must emit 3 "body_chunk" events. The first 2 with partial body content, the last one empty with isLast = true', done => {
				let i = 0;
				const PARTS = ['Hello ', 'World!'];

				parser.on('body_chunk', (data, isLast) => {
					try{
						if(isLast){
							assert.strictEqual(data.toString(), '');
							done();
						}else{
							assert.strictEqual(data.toString(), PARTS[i++]);
						}
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

		describe('Fixed length, 2 buffers cutting the body', () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(0, 70)));
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(70)));
				});
			});

			it('Must emit 2 "body_chunk" events.', done => {

				let nb = 0;
				let body = '';
				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();
					nb++;

					try{
						if(isLast){
							assert.strictEqual(body, 'Hello World!');
							assert.strictEqual(nb, 2);
							done();
						}
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});
		});

		describe('Fixed length, 5 buffers cutting headers and body', () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(0, 20)));
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(20, 40)));
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(40, 50)));
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(50, 70)));
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.slice(70)));
				});
			});

			it('Must emit 2 "body_chunk" events.', done => {
				let nb = 0;
				let body = '';
				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();
					nb++;

					try{
						if(isLast){
							assert.strictEqual(body, 'Hello World!');
							assert.strictEqual(nb, 2);
							done();
						}
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});
		});

		describe('Chunked, 2 buffers cutting the body', () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_CHUNKED_2.slice(0, 70)));
					parser.feed(Buffer.from(RESPONSES.SIMPLE_CHUNKED_2.slice(70)));
				});
			});

			it('Must emit 3 "body_chunk" events.', done => {

				let nb = 0;
				let body = '';
				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();
					nb++;

					try{
						if(isLast){
							assert.strictEqual(nb, 3);
							assert.strictEqual(data.toString(), '');
							assert.strictEqual(body, 'Hello World!');
							done();
						}
					}catch(err){
						done(err);
					}
				});
			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});
		});
	});

	describe('Parsing several responses in one buffer', () => {

		const NB_RESPONSES = 20

		describe(`Fixed length, ${NB_RESPONSES} responses`, () => {

			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_FIXED.repeat(NB_RESPONSES)));
				});
			});

			it(`Must emit "body_chunk" events until ${NB_RESPONSES} "Hello World! have been received.".`, done => {

				let nb = 0,
					body = '',
					aggregatedBodies = '';

				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();

					try{
						if(isLast){
							nb++;
							assert.strictEqual(body, 'Hello World!');
							aggregatedBodies += body;
							body = '';

							if(nb === NB_RESPONSES){
								assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES));
								done();
							}
						}
					}catch(err){
						done(err);
					}
				});

			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

		describe(`Chunked, ${NB_RESPONSES} responses`, () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from(RESPONSES.SIMPLE_CHUNKED_2.repeat(20)));
				});
			});

			it(`Must emit "body_chunk" events until ${NB_RESPONSES} "Hello World! have been received.".`, done => {

				let nb = 0,
					body = '',
					aggregatedBodies = '';

				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();

					try{
						if(isLast){
							nb++;
							assert.strictEqual(body, 'Hello World!');
							aggregatedBodies += body;
							body = '';

							if(nb === NB_RESPONSES){
								assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES));
								done();
							}
						}
					}catch(err){
						done(err);
					}
				});

			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

		describe(`Mixed chunked/fixed length, ${NB_RESPONSES} responses`, () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					parser.feed(Buffer.from((RESPONSES.SIMPLE_CHUNKED_2 + RESPONSES.SIMPLE_FIXED).repeat(10)));
				});
			});

			it(`Must emit "body_chunk" events until ${NB_RESPONSES} "Hello World! have been received.".`, done => {

				let nb = 0,
					body = '',
					aggregatedBodies = '';

				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();

					try{
						if(isLast){
							nb++;
							assert.strictEqual(body, 'Hello World!');
							aggregatedBodies += body;
							body = '';

							if(nb === NB_RESPONSES){
								assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES));
								done();
							}
						}
					}catch(err){
						done(err);
					}
				});

			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

	});

	describe('Parsing several pipelined responses chunked into several buffers', () => {

		const NB_CHUNKS = 275;
		const NB_RESPONSES = 21;

		describe(`Fixed length, ${NB_RESPONSES} responses, arbitrary cut in ${NB_CHUNKS} chunks`, () => {

			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					const fullResponse = Buffer.from(RESPONSES.SIMPLE_FIXED.repeat(NB_RESPONSES));
					const chunkSize = Math.ceil(fullResponse.length / NB_CHUNKS);

					for(let i = 0; i < NB_CHUNKS; i++){
						if(NB_CHUNKS - 1 === i){
							parser.feed(fullResponse.subarray(i * chunkSize));
						}else{
							parser.feed(fullResponse.subarray(i * chunkSize, (i + 1) * chunkSize));
						}
					}
				});
			});

			it(`Must emit "body_chunk" events until ${NB_RESPONSES} "Hello World! have been received.".`, done => {

				let nb = 0,
					body = '',
					aggregatedBodies = '';

				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();

					try{
						if(isLast){
							nb++;
							assert.strictEqual(body, 'Hello World!');
							aggregatedBodies += body;
							body = '';

							if(nb === NB_RESPONSES){
								assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES));
								done();
							}
						}
					}catch(err){
						done(err);
					}
				});

			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

		describe(`Chunked, ${NB_RESPONSES} responses, arbitrary cut in ${NB_CHUNKS} chunks`, () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					const fullResponse = Buffer.from(RESPONSES.SIMPLE_CHUNKED_2.repeat(NB_RESPONSES));
					const chunkSize = Math.ceil(fullResponse.length / NB_CHUNKS);

					for(let i = 0; i < NB_CHUNKS; i++){
						if(NB_CHUNKS - 1 === i){
							parser.feed(fullResponse.subarray(i * chunkSize));
						}else{
							parser.feed(fullResponse.subarray(i * chunkSize, (i + 1) * chunkSize));
						}
					}
				});
			});

			it(`Must emit "body_chunk" events until ${NB_RESPONSES} "Hello World!" have been received.`, done => {

				let nb = 0,
					body = '',
					aggregatedBodies = '';

				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();

					try{
						if(isLast){
							nb++;
							assert.strictEqual(body, 'Hello World!');
							aggregatedBodies += body;
							body = '';

							if(nb === NB_RESPONSES){
								assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES));
								done();
							}
						}
					}catch(err){
						done(err);
					}
				});

			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});

		describe(`Mixed chunked / fixed length, ${NB_RESPONSES*2} responses, arbitrary cut in ${NB_CHUNKS} chunks`, () => {
			let parser;

			beforeEach(() => {
				parser = new Parser();

				setImmediate(() => {
					const fullResponse = Buffer.from((RESPONSES.SIMPLE_CHUNKED_2 + RESPONSES.SIMPLE_FIXED).repeat(NB_RESPONSES));
					const chunkSize = Math.ceil(fullResponse.length / NB_CHUNKS);

					for(let i = 0; i < NB_CHUNKS; i++){
						if(NB_CHUNKS - 1 === i){
							parser.feed(fullResponse.subarray(i * chunkSize));
						}else{
							parser.feed(fullResponse.subarray(i * chunkSize, (i + 1) * chunkSize));
						}
					}
				});
			});

			it(`Must emit "body_chunk" events until ${NB_RESPONSES*2} "Hello World! have been received.".`, done => {

				let nb = 0,
					body = '',
					aggregatedBodies = '';

				parser.on('body_chunk', (data, isLast) => {
					body += data.toString();

					try{
						if(isLast){
							nb++;
							assert.strictEqual(body, 'Hello World!');
							aggregatedBodies += body;
							body = '';

							if(nb === NB_RESPONSES*2){
								assert.strictEqual(aggregatedBodies, 'Hello World!'.repeat(NB_RESPONSES*2));
								done();
							}
						}
					}catch(err){
						done(err);
					}
				});

			});

			it('Must not report any error', () => {
				return Promise.race([
					new Promise((_resolve, reject) => {
						parser.on('error', err => {
							reject(err);
						});
					}),
					new Promise(resolve => {
						parser.on('body_chunk', (_, isLast) => {
							if(isLast) resolve();
						});
					})
				]);
			});

		});
	});

	describe('Error handling and emitting', () => {

		let parser;

		beforeEach(() => {
			parser = new Parser();
		});

		describe('Fatal errors', () => {

			describe('Invalid content-length error', () => {

				it('Must emit an error E_INVALID_CONTENT_LENGTH', done => {
					parser.on('error', err => {
						try{
							assert.strictEqual(err.code, 'E_INVALID_CONTENT_LENGTH');
							done();
						}catch(err){
							done(err);
						}
					});

					parser.feed(Buffer.from(RESPONSES.INVALID_CONTENT_LENGTH));
				});

				it('Must emit a reset event', done => {
					parser.on('reset', () => {
						done();
					});

					parser.on('error', _err => {
						// Ignore error (already tested)
					});

					parser.feed(Buffer.from(RESPONSES.INVALID_CONTENT_LENGTH));
				});

			});

			describe('Invalid chunk length', () => {

				it('Must emit an error E_INVALID_CHUNK_SIZE', done => {
					parser.on('error', err => {
						try{
							assert.strictEqual(err.code, 'E_INVALID_CHUNK_SIZE');
							done();
						}catch(err){
							done(err);
						}
					});

					parser.feed(Buffer.from(RESPONSES.INVALID_CHUNK_SIZE));
				});

				it('Must emit a reset event', done => {
					parser.on('reset', () => {
						done();
					});

					parser.on('error', _err => {
						// Ignore error (already tested)
					});

					parser.feed(Buffer.from(RESPONSES.INVALID_CHUNK_SIZE));
				});

			});

			describe('Missing chunk length', () => {

				it('Must emit an error E_INVALID_CHUNK_SIZE', done => {
					parser.on('error', err => {
						try{
							assert.strictEqual(err.code, 'E_INVALID_CHUNK_SIZE');
							done();
						}catch(err){
							done(err);
						}
					});

					parser.feed(Buffer.from(RESPONSES.NO_CHUNK_SIZE));
				});

				it('Must emit a reset event', done => {
					parser.on('reset', () => {
						done();
					});

					parser.on('error', _err => {
						// Ignore error (already tested)
					});

					parser.feed(Buffer.from(RESPONSES.NO_CHUNK_SIZE));
				});

			});

		});

	});

});