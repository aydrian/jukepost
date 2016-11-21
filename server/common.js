'use strict'

module.exports = {
  generateRandomString: N => (Math.random().toString(36) + Array(N).join('0')).slice(2, N + 2)
}
