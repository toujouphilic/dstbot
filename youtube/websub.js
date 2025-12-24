import fetch from 'node-fetch';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { db } from '../db/database.js';
import { sendYouTubeUploadEmbed } from '../notifier/discordNotifier.js';

const HUB = 'https://pubsubhubbub.appspot.com/subscribe';
const parser = new XMLParser({ ignoreAttributes: false });

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r)))
  );
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, e => (e ? reject(e) : resolve()))
  );
}

/* ================= SUBSCRIBE ================= */

export async function subscribeAllYouTube(PUBLIC_BASE_URL) {
  const notifs = await dbAll(
    `select distinct source from notifications
     where type = 'youtube' and enabled = 1`
  );

  for (const n of notifs) {
    const topic = `https://www.youtube.com/feeds/videos.xml?channel_id=${n.source}`;

    await fetch(HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.callback': `${PUBLIC_BASE_URL}/youtube/websub`,
        'hub.verify': 'async',
        'hub.lease_seconds': '432000'
      })
    });
  }
}

/* ================= EXPRESS HANDLER ================= */

export async function handleYouTubeWebSub(req, res, client) {
  /* Verification */
  if (req.method === 'GET') {
    return res.status(200).send(req.query['hub.challenge']);
  }

  /* Notification */
  const xml = parser.parse(req.body.toString());
  const entry = xml.feed?.entry;
  if (!entry) return res.sendStatus(204);

  const videoId = entry['yt:videoId'];
  const channelId = entry['yt:channelId'];
  const title = entry.title;
  const channelName = entry.author?.name;

  const notifs = await dbAll(
    `select * from notifications
     where type = 'youtube' and source = ? and enabled = 1`,
    [channelId]
  );

  for (const n of notifs) {
    await sendYouTubeUploadEmbed(client, {
      channelId: n.channel_id,
      roleId: n.role_id,
      channelName,
      title,
      videoUrl: `https://youtube.com/watch?v=${videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
    });
  }

  res.sendStatus(204);
}