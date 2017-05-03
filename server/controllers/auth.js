'use strict'

let currentUser = {}
let myPlaylists = {}
const spotifyApi = require('../config/spotify')
const listen = require('../listener')
const logger = require('../config/logger')('verbose')
const common = require('../common')
const STATE_KEY = 'spotify_auth_state'
const SPOTIFY_SCOPES = ['user-read-private', 'user-read-email', 'playlist-modify-public', 'playlist-modify-private', 'playlist-read-collaborative']

const controller = module.exports = {}

controller.login = (req, res) => {
  const state = common.generateRandomString(16)
  res.cookie(STATE_KEY, state)
  res.redirect(spotifyApi.createAuthorizeURL(SPOTIFY_SCOPES, state))
}

controller.callback = (req, res) => {
  // const { code, state } = req.query
  const code = req.query.code
  const state = req.query.state

  const storedState = req.cookies ? req.cookies[STATE_KEY] : null

  // first do state validation
  if (state == null || state !== storedState) {
    res.redirect('/#/error/state mismatch')
  // if the state is valid, get the authorization code and pass it to the client
  } else {
    res.clearCookie(STATE_KEY)
    // Retrieve an access token and a refresh token
    spotifyApi
      .authorizationCodeGrant(code)
      .then(data => {
        // const { expires_in, access_token, refresh_token } = data.body
        const accessToken = data.body.access_token
        const refreshToken = data.body.refresh_token

        // Set the access token on the API object to use it in later calls
        spotifyApi.setAccessToken(accessToken)
        spotifyApi.setRefreshToken(refreshToken)

        // use the access token to access the Spotify Web API
        logger.verbose(`Retrieving User Info`)
        spotifyApi
          .getMe()
          .then(({ body }) => {
            currentUser = body

            logger.verbose(`Retrieving Playlists for ${currentUser.id}`)
            spotifyApi
              .getUserPlaylists(null, {limit: 50})
              .then(data => data.body)
              .then(processPlaylists)
              .then((lists) => {
                logger.verbose(`Processed ${Object.keys(lists).length} Playlists`)
                myPlaylists = lists

                logger.verbose('Starting service')
                listen({currentUser, myPlaylists})
              })
              .catch((err) => {
                logger.error(err)
              })
          })
          .catch((err) => {
            logger.error(err)
          })

        // we can also pass the token to the browser to make requests from there
        // res.redirect(`/#/user/${access_token}/${refresh_token}`)

        // logger.verbose(data.body)
        res.send(data.body)
      })
      .catch(err => {
        // res.redirect('/#/error/invalid token')
        logger.error(err)
        res.send('error')
      })
  }
}

controller.refreshToken = (req, res) => {
  // requesting access token from refresh token
  spotifyApi
    .refreshAccessToken()
    .then(data => {
      // const { access_token } = data.body
      const accessToken = data.body.access_token
      spotifyApi.setAccessToken(accessToken)
      // we can also pass the token to the browser to make requests from there
      res.send({
        'access_token': accessToken
      })
    })
    .catch(err => {
      logger.error(err)
      res.redirect('/#/error/invalid token')
    })
}

const processPlaylists = (data) => {
  let hash = {}
  data.items.forEach((list) => {
    if (list.collaborative && list.owner.id === currentUser.id) {
      hash[list.name.toLowerCase()] = list
    }
  })
  return hash
}
