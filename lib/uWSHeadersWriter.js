module.exports = function (res, headers){
	Object.keys(headers || {}).some(header => {
		if(['status', 'status code'].includes(header.toLowerCase())){
			res.writeStatus(
				typeof headers[header] === 'string'
					? headers[header]
					: headers[header].toString()
			);

			delete headers[header];
			return true;
		}
	});

	Object.keys(headers || {}).forEach(header => {
		if(Array.isArray(headers[header])){
			headers[header].forEach(val => res.writeHeader(
				header,
				typeof val === 'string' ? val : val.toString()
			));
		} else res.writeHeader(
			header,
			typeof headers[header] === 'string'
				? headers[header]
				: headers[header].toString()
		);
	});
};