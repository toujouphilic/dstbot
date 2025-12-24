import fetch from 'node-fetch';
import { db } from '../db/database.js';
import { sendYouTubeUploadEmbed } from '../notifier/discordNotifier.js';

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

async function getLatestVideo(channelId) {
  const url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&channelId=${channelId}` +
    `&order=date&maxResults=1&type=video` +
    `&key=${process.env.YOUTUBE_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();
  return data.items?.[0] ?? null;
}

export async function pollYouTube(client) {
  const notifs = await dbAll(`
    select * from notifications
    where type = 'youtube' and enabled = 1
  `);

  for (const n of notifs) {
    try {
      const video = await getLatestVideo(n.source);
      if (!video) continue;

      const videoId = video.id.videoId;
      if (n.last_state === videoId) continue;

      await sendYouTubeUploadEmbed(client, {
        channelId: n.channel_id,
        roleId: n.role_id,
        channelName: video.snippet.channelTitle,
        title: video.snippet.title,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: video.snippet.thumbnails.high.url
      });

      await dbRun(
        `update notifications set last_state = ?, last_checked = ? where id = ?`,
        [videoId, Date.now(), n.id]
      );
    } catch (err) {
      console.error('youtube poll error', err);
    }
  }
}