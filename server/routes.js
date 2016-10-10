'use strict';

const firebase = require("firebase");
const Spotify = require('spotify-web-api-node');
const router = new require('express').Router();
const common = require('./common');
const relayParser = require('./relay_parser');
// configure the express server
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URL = process.env.SPOTIFY_REDIRECT_URL || 'http://localhost:3001/callback';
const STATE_KEY = 'spotify_auth_state';
// your application requests authorization
const SPOTIFY_SCOPES = ['user-read-private', 'user-read-email', 'playlist-modify-public', 'playlist-modify-private'];

// configure spotify
const spotifyApi = new Spotify({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URL
});

// configure firebase
firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
	authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_URL
});

const listen = () => {
  const db = firebase.database();
  const ref = db.ref('raw-inbound');

  ref.on('child_added', snapshot => {
    console.log('Recieved and Processing email');
    snapshot.forEach(item => {
      const data = relayParser.processRelayMessage(item.val().msys.relay_message);
      console.log(data);
      const query = `track:${data.track}` + data.artist ? ` artist:${data.artist}` : '';
      spotifyApi.searchTracks(query)
        .then(data => {
          console.log('Track Found: ', data.body.tracks.items[0].uri);
          const tracks = [data.body.tracks.items[0].uri];
          spotifyApi.addTracksToPlaylist('haybien', '2GedPwtB9YnAW95E5pWDNJ', tracks)
            .then(function(data) {
              console.log('Added tracks to playlist!');
            }, function(err) {
              console.log('Something went wrong!', err);
            });
        })
        .catch(err => {
          console.log('An error occurred finding track', err);
        });
  	});
    //spotify:user:haybien:playlist:2GedPwtB9YnAW95E5pWDNJ
  }, err => {
    console.log(err);
  });
};

router.get('/login', (req, res) => {
  const state = common.generateRandomString(16);
  res.cookie(STATE_KEY, state);
  res.redirect(spotifyApi.createAuthorizeURL(SPOTIFY_SCOPES, state));
});

router.get('/callback', (req, res) => {
  //const { code, state } = req.query;
  const code = req.query.code;
  const state = req.query.state;

  const storedState = req.cookies ? req.cookies[STATE_KEY] : null;

  // first do state validation
  if (state == null || state !== storedState) {
    res.redirect('/#/error/state mismatch');
  // if the state is valid, get the authorization code and pass it to the client
  } else {
    res.clearCookie(STATE_KEY);
    // Retrieve an access token and a refresh token
    spotifyApi.authorizationCodeGrant(code).then(data => {
      //const { expires_in, access_token, refresh_token } = data.body;
      const access_token = data.body.access_token;
      const refresh_token = data.body.refresh_token;

      // Set the access token on the API object to use it in later calls
      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);

      // use the access token to access the Spotify Web API
      /*spotifyApi.getMe().then((data) => {
        console.log(data.body);
      });*/

      // we can also pass the token to the browser to make requests from there
      //res.redirect(`/#/user/${access_token}/${refresh_token}`);
      console.log('Starting service');
      listen();
      console.log(data.body);
      res.send(data.body);
    }).catch(err => {
      //res.redirect('/#/error/invalid token');
      console.log(err);
      res.send('error');
    });
  }
});

router.get('/refresh_token', (req, res) => {
  // requesting access token from refresh token
  spotifyApi.refreshAccessToken()
    .then(data => {
      //const { access_token } = data.body;
      const access_token = data.body.access_token;
      spotifyApi.setAccessToken(access_token);
      // we can also pass the token to the browser to make requests from there
      res.send({
        'access_token': access_token
      });
    })
    .catch(err => {
      res.redirect('/#/error/invalid token');
    });
});

router.get('/credcheck', (req, res) => {
  res.send(spotifyApi.getCredentials());
});

module.exports = router;
