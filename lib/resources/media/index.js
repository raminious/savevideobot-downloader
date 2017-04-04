const agent = require('superagent')
const config = require('../../../config.json')
const access_token = config.access_token

const media = {}

media.status = async function(id) {
	try {
		const response = await agent
		.get(config.api + '/media/status/' + id)
		.set({'access-token': access_token})
		.retry(2)

		return response.body
	}
	catch(e) {
		throw e
	}
}

/*
*
*/
media.update = async function(id, attrs) {

	try {
		const response = await agent
		.post(config.api + '/media/update/' + id)
		.set({'access-token': access_token})
		.send(attrs)
		.retry(3)

		return response.body
	}
	catch(e) {
		throw e
	}
}

module.exports = media
