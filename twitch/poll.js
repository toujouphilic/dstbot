import fetch from 'node-fetch';
import { db } from '../db/database.js';
import { sendTwitchLiveEmbed } from '../notifier/discordNotifier.js';

/* ================= SQLITE HELPERS ================= */

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, err => (err ? reject(err) : resolve()));
  });
}

/* ================= TWITCH AUTH ================= */

let twitchToken = null;
let tokenExpires = 0;

async function getTwitchToken() {
  if (twitchToken && Date.now() < tokenExpires) return twitchToken;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token` +
      `?client_id=${process.env.TWITCH_CLIENT_ID}` +
      `&client_secret=${process.env.TWITCH_CLIENT_SECRET}` +
      `&grant_type=client_credentials`,
    { method: 'POST' }
  );

  const data = await res.json();
  twitchToken = data.access_token;
  tokenExpires = Date.now() + (data.expires_in - 60) * 1000;
  return twitchToken;
}

async function checkStreamer(username) {
  const token = await getTwitchToken();

  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${username}`,
    {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      }
    }
  );

  const data = await res.json();
  return data.data?.[0] ?? null;
}

/* ================= POLLER ================= */

export async function pollTwitch(client) {
  console.log('🔁 twitch poll tick');

  const notifs = await dbAll(`
    select * from notifications
    where type = 'twitch' and enabled = 1
  `);

  console.log(`🎯 twitch notifs found: ${notifs.length}`);

  for (const n of notifs) {
    try {
      const stream = await checkStreamer(n.source);

      if (!stream) {
         await dbRun(
          `update notifications set last_state = null where id = ?`,
          [n.id]
        );
        continue;
      }

      if (n.last_state && n.last_state === stream.id) {
  console.log(`⏭ already notified for ${n.source}`);
  continue;
}
      await sendTwitchLiveEmbed(client, {
        channelId: n.channel_id,
        roleId: n.role_id,
        streamerName: stream.user_name,
        streamTitle: stream.title,
        game: stream.game_name,
        viewers: stream.viewer_count,
        previewImage: stream.thumbnail_url
          .replace('{width}', '1280')
          .replace('{height}', '720'),
        profileImage: null,
        streamUrl: `https://twitch.tv/${stream.user_login}`
      });

      await dbRun(
        `update notifications set last_state = ?, last_checked = ? where id = ?`,
        [stream.id, Date.now(), n.id]
      );
    } catch (err) {
      console.error('twitch poll error', err);
    }
  }
}