const agent = require('superagent')
const config = require('../../../config.json')
const access_token = config.access_token

const media = {}

media.status = function(id) {

	return new Promise((resolve, reject) => {
		agent
		.get(config.api + '/media/status/' + id)
		.set({'access-token': access_token})
		.retry(2)
		.end((err, res) => {
			if (err) return reject(err)
			return resolve(res.body)
		})
	})
}

/*
*
*/
media.update = function(id, attrs) {

	return new Promise((resolve, reject) => {

		agent
		.post(config.api + '/media/update/' + id)
		.set({'access-token': access_token})
		.send(attrs)
		.retry(3)
		.end((err, res) => {
			if (err) return reject(err)
			return resolve(res)
		})
	})
}

module.exports = media
