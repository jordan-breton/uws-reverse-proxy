const MAX = 2000000;
const obj = {
	'Contant-Type': 'application/json',
	'Content-Length': 12,
	'X-Header': 'Hello World',
	'status': '200 OK'
};

const start = process.hrtime();

for(let i = 0; i < MAX; i++){
	JSON.parse(JSON.stringify(obj));
}

console.log('done');
const end = process.hrtime(start);
console.log('JSON by seconds: ', MAX / (end[0] + end[1] / 1e9));