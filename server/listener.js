'use strict'

const SparkPost = require('sparkpost')
const sparky = new SparkPost()
const firebase = require('firebase')
firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_URL
})
const spotifyApi = require('./config/spotify')
const logger = require('./config/logger')('verbose')
const relayParser = require('./relay_parser')

let isListening = false

const listen = module.exports = ({currentUser, myPlaylists}) => {
  if (isListening) {
    logger.warn('Already listening for raw-inbound events.')
    return
  }
  const ref = firebase.database().ref('raw-inbound')
  isListening = true
  logger.verbose('Listening for raw-inbound events.')

  ref.on('child_added', snapshot => {
    logger.verbose('Recieved and Processing email')
    snapshot.forEach(item => {
      const data = relayParser.processRelayMessage(item.val().msys.relay_message)
      const playlist = myPlaylists[data.playList.toLowerCase()]
      if (!playlist) {
        logger.warn(`Playlist ${data.playList} not found.`)
        sendPlayListNotFound(data.msg_from, {
          type: 'playlist',
          name: data.playList,
          spotifyUser: currentUser.id
        })
        ref.child(snapshot.key).remove()
        return
      }
      const subData = {
        playList: {
          name: data.playList,
          url: playlist.external_urls.spotify
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
      Promise
        .all(searches)
        .then(processSearches)
        .then(tracks => {
          subData.tracks = tracks
          const uris = tracks.map(track => {
            return track.uri
          })
          return spotifyApi.addTracksToPlaylist(currentUser.id, playlist.id, uris)
        })
        .then(result => {
          logger.verbose(`Added ${subData.tracks.length} track(s) to playlist!`)
          return sendConfirmation(data.msg_from, subData)
        })
        .catch(err => {
          logger.error('Something went wrong!', err)
        })
      ref.child(snapshot.key).remove()
    })
  }, err => {
    logger.error('Error getting snapshot.', err)
  })
}

const processSearches = (results) => {
  return results
    .filter(result => {
      // Let's remove any searches that produced zero results
      return result.body.tracks.items.length
    })
    .map(result => {
      const track = result.body.tracks.items[0]
      return {
        id: track.id,
        name: track.name,
        uri: track.uri,
        preview_url: track.preview_url,
        artists: track.artists,
        image: track.album.images[1] // track.album.images[track.album.images.length - 1]
      }
    })
}

const sendConfirmation = (recipient, subData) => {
  logger.verbose('Sending confirmation to ', recipient)
  return sparky.transmissions.send({
    campaign_id: 'jukepost',
    content: {
      template_id: 'juke-post-add'
    },
    substitution_data: subData,
    recipients: [{ address: { email: recipient } }]
  })
}

const sendPlayListNotFound = (recipient, subData) => {
  return sparky.transmissions.send({
    campaign_id: 'jukepost',
    content: {
      template_id: 'juke-post-not-found'
    },
    substitution_data: subData,
    recipients: [{ address: { email: recipient } }]
  })
}
