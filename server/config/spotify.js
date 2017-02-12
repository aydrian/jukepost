'use strict'

const Spotify = require('spotify-web-api-node')
const spotifyApi = new Spotify({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URL || 'http://localhost:3001/callback'
})

module.exports = spotifyApi
