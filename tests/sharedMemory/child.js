const { parentPort } = require('worker_threads')

let sharedBuffer, bufferView;

parentPort.on('message', (message) => {
	if(!sharedBuffer){
		sharedBuffer = message.sharedBuffer;
		bufferView = new Uint8Array(sharedBuffer);
	}else{
		switch(message){
			case 0x0:
				const buffer = bufferView.subarray(0, message);
				if(buffer.length !== 12) throw new Error('Invalid buffer length');
				parentPort.postMessage(0x0);
				break;
			default:
				// we recevied json
				parentPort.postMessage(message)
		}
	}
});