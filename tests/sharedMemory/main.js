const sharedBuffer = new SharedArrayBuffer(1024 * 1024); // 1MB
const buffer = new Uint8Array(sharedBuffer);

const {
	  Worker
} = require('worker_threads');

const child = new Worker(__dirname + '/child.js');

let written = 0;
let read = 0;
let jsonReceived = 0;

const MAX = 100000;

const toSend = Uint8Array.from(Buffer.from('Hello World!'));
const jsonToSend = {
	'Contant-Type': 'application/json',
	'Content-Length': 12,
	'X-Header': 'Hello World',
	'status': '200 OK'
};

child.on('message', (message) => {
	  switch (message) {
		  case 0x0:
				read++;
				if(read !== MAX) write(toSend);
				else {
					const end = process.hrtime(start);
					console.log('done');
					console.log('Read by seconds: ', MAX / (end[0] + end[1] / 1e9));
					process.exit();
				}
				break;
		  default:
			  jsonReceived++;
			  if(jsonReceived === MAX) {
				  const end = process.hrtime(start);
				  console.log('done');
				  console.log('JSON by seconds: ', MAX / (end[0] + end[1] / 1e9));
				  process.exit();
			  }else{
				  child.postMessage(jsonToSend);
			  }
	  }
});

child.on("error", (err) => {
	  console.error(err);
});

child.postMessage({ sharedBuffer });

function write(bufferMessage) {
	buffer.set(bufferMessage);
	written++;
	child.postMessage(bufferMessage.length);
}

const start = process.hrtime();

//write(toSend);

/*for(let i = 0; i< MAX; i++){
	buffer.set(toSend);
}
console.log('done');
const end = process.hrtime(start);
console.log('Writing by seconds: ', MAX / (end[0] + end[1] / 1e9));*/
