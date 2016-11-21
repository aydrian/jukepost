'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const routes = require('./routes')
// const firebase = require('firebase')

const app = express()

app.set('port', process.env.PORT || 3001)
app.use(express.static(__dirname + '../build'))
app.use(bodyParser.json())
app.use(cookieParser())
app.use('/', routes)

app.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'))
})
