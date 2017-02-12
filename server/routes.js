'use strict'

const spotifyApi = require('./config/spotify')
const router = new require('express').Router() // eslint-disable-line no-new-require, new-cap
const authController = require('./controllers/auth')
const spotifyController = require('./controllers/spotify')

router.get('/login', authController.login)
router.get('/callback', authController.callback)
router.get('/refresh_token', authController.refreshToken)

router.get('/user-playlists', spotifyController.userPlaylists)
router.get('/credcheck', spotifyController.credCheck)

module.exports = router
