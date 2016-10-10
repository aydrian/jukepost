'use strict';

const parseText = (text) => {
  const firstLine = text.split('\r\n')[0];
  const arr = firstLine.split('by');
  return {
    track: arr[0].trim(),
    artist: arr.length > 1 ? arr[1].trim() : ''
  };
};

module.exports = {
  processRelayMessage: event => {
    const data = parseText(event.content.text);
    return {
      playList: event.rcpt_to.split('@')[0],
      action: event.content.subject,
      track: data.track,
      artist: data.artist
    }
  },
  parseText: parseText
};
