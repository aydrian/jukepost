'use strict'

const spotifyApi = require('../config/spotify')

const controller = module.exports = {}

controller.userPlaylists = (req, res) => {
  spotifyApi
    .getUserPlaylists()
    .then(data => {
      res.json(data.body)
    })
    .catch(err => {
      res.json(err)
    })
}

controller.credCheck = (req, res) => {
  res.send(spotifyApi.getCredentials())
}
