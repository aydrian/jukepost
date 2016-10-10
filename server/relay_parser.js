'use strict';

const parseText = (text) => {
  const payload = text.split('\r\n\r\n')[0];
  const lines = payload.split('\r\n');
  const data = lines.map(line => {
    const arr = line.split('by');
    return {
      track: arr[0].trim(),
      artist: arr.length > 1 ? arr[1].trim() : ''
    }
  });
  return data;
};

module.exports = {
  processRelayMessage: event => {
    const data = parseText(event.content.text);
    return {
      msg_from: event.msg_from,
      playList: event.rcpt_to.split('@')[0],
      action: event.content.subject,
      tracks: data
    };
  },
  parseText: parseText
};
