const agent = require('superagent')
const config = require('../../../config.json')

const media = {}

media.status = async function(id) {
	try {
		const response = await agent
		.get(config.api + '/media/status/' + id)
		.set({'app-platform': 'svb-downloader'})
		.set({'username': config.auth.username})
		.set({'password': config.auth.password})
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
		.set({'app-platform': 'svb-downloader'})
		.set({'username': config.auth.username})
		.set({'password': config.auth.password})
		.send(attrs)
		.retry(3)

		return response.body
	}
	catch(e) {
		throw e
	}
}

module.exports = media
