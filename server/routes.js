'use strict'

const SparkPost = require('sparkpost')
const firebase = require('firebase')
const Spotify = require('spotify-web-api-node')
const router = new require('express').Router() // eslint-disable-line no-new-require, new-cap
const logger = require('./logger')('verbose')
const common = require('./common')
const relayParser = require('./relay_parser')
// configure the express server
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const SPOTIFY_REDIRECT_URL = process.env.SPOTIFY_REDIRECT_URL || 'http://localhost:3001/callback'
const STATE_KEY = 'spotify_auth_state'
// your application requests authorization
const SPOTIFY_SCOPES = ['user-read-private', 'user-read-email', 'playlist-modify-public'] // , 'playlist-modify-private']

// configure your playlist
// const SPOTIFY_PLAYLIST_URL = process.env.SPOTIFY_PLAYLIST_URL
// const SPOTIFY_USERNAME = process.env.SPOTIFY_USERNAME
// const SPOTIFY_PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID

let isListening = false
let myPlaylists = {}
let currentUser = {}

// configure spotify
const spotifyApi = new Spotify({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: SPOTIFY_REDIRECT_URL
})

// configure firebase
firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_URL
})

const sparky = new SparkPost()

const listen = () => {
  if (isListening) {
    logger.warn('Already listening for raw-inbound events.')
    return
  }
  const db = firebase.database()
  const ref = db.ref('raw-inbound')
  isListening = true

  ref.on('child_added', snapshot => {
    logger.verbose('Recieved and Processing email')
    snapshot.forEach(item => {
      const data = relayParser.processRelayMessage(item.val().msys.relay_message)
      const playlist = myPlaylists[data.playList.toLowerCase()]
      console.log(playlist)
      if (!playlist) {
        // TODO: Send reply with error.
        logger.warn(`Playlist ${data.playList} not found.`)
        ref.child(snapshot.key).remove()
        return
      }
      const subData = {
        playList: {
          name: data.playList,
          url: playlist.external_urls.spotify // SPOTIFY_PLAYLIST_URL
        },
        action: data.action
      }
      logger.verbose(`${data.playList}: ${data.action}`)
      const searches = data.tracks.map(item => {
        const query = `track:${item.track}` + (item.artist ? ` artist:${item.artist}` : '')
        logger.verbose('Search Query: ', query)
        return spotifyApi.searchTracks(query)
          .catch(err => {
            logger.error(`Error searching for ${query}`, err)
          })
      })
      Promise.all(searches)
        .then(results => {
          return results.map(result => {
            const track = result.body.tracks.items[0]
            return {
              id: track.id,
              name: track.name,
              uri: track.uri,
              preview_url: track.preview_url,
              artists: track.artists,
              // image: track.album.images[track.album.images.length - 1]
              image: track.album.images[1]
            }
          })
        })
        .then(tracks => {
          subData.tracks = tracks
          const uris = tracks.map(track => {
            return track.uri
          })
          // return spotifyApi.addTracksToPlaylist(SPOTIFY_USERNAME, SPOTIFY_PLAYLIST_ID, uris)
          return spotifyApi.addTracksToPlaylist(currentUser.id, playlist.id, uris)
        })
        .then(result => {
          logger.verbose('Added tracks to playlist!', subData.tracks)
          logger.verbose('Sending confirmation to ', data.msg_from)
          return sparky.transmissions.send({
            campaign_id: 'sparkpost-party',
            content: {
              template_id: 'spark-post-party-add'
            },
            substitution_data: subData,
            recipients: [{ address: { email: data.msg_from } }]
          })
        })
        .catch(err => {
          logger.error('Something went wrong!', err)
        })
      ref.child(snapshot.key).remove()
    })
  }, err => {
    logger.error(err)
  })
}

router.get('/login', (req, res) => {
  const state = common.generateRandomString(16)
  res.cookie(STATE_KEY, state)
  res.redirect(spotifyApi.createAuthorizeURL(SPOTIFY_SCOPES, state))
})

router.get('/callback', (req, res) => {
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
    spotifyApi.authorizationCodeGrant(code).then(data => {
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
              listen()
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
    }).catch(err => {
      // res.redirect('/#/error/invalid token')
      logger.error(err)
      res.send('error')
    })
  }
})

const processPlaylists = (data) => {
  let hash = {}
  data.items.forEach((list) => {
    if (list.owner.id === currentUser.id) {
      hash[list.name.toLowerCase()] = list
    }
  })
  return hash
}

router.get('/user-playlists', (req, res) => {
  spotifyApi.getUserPlaylists(null, {limit: 50})
    .then(data => {
      res.json(data.body)
    })
    .catch(err => {
      res.json(err)
    })
})

router.get('/refresh_token', (req, res) => {
  // requesting access token from refresh token
  spotifyApi.refreshAccessToken()
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
})

router.get('/credcheck', (req, res) => {
  res.send(spotifyApi.getCredentials())
})

module.exports = router
