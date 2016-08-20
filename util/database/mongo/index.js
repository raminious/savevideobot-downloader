const config = require('../../../config.json');
const mongoose = require('mongoose');
mongoose.connect(config.database.mongo.url);

const db = mongoose.connection;

// check error
db.on('error', console.error.bind(console, 'Connection error: '));

db.once('open', function() {
  console.log ('Mongo Connected');
});

module.exports = mongoose;
