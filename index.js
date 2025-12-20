import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits } from 'discord.js';
import { XMLParser } from 'fast-xml-parser';

/* ======================= DISCORD ======================= */
const discord = new Client({ intents: [GatewayIntentBits.Guilds] });

async function sendEmbed({ embed, roleId }) {
  const channel = await discord.channels.fetch(process.env.DISCORD_CHANNEL_ID);
  if (!channel) throw new Error("Discord channel not found");

  const ping = roleId ? `<@&${roleId}>` : "";

  await channel.send({
    content: ping,
    embeds: [embed],
    allowedMentions: {
      parse: [],
      roles: roleId ? [roleId] : []
    }
  });
}

/* ======================= EXPRESS ======================= */
const app = express();
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.use('/twitch/eventsub', express.raw({ type: '*/*' }));
app.use('/youtube/websub', express.raw({ type: '*/*' }));

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

/* ======================= ROLE CONFIG ======================= */
const ROLE_REKRAP = "1451111489682411541";
const ROLE_MISC   = "1451125072650833942";
const ROLE_4CVIT  = "1333276977494495233";
const ROLE_ZAM    = "1333277012466335745";

/* Twitch login → role */
const TWITCH_ROLES = {
  rekrap22: ROLE_REKRAP,
  rekrap12: ROLE_REKRAP,
  doctordrr: ROLE_MISC,
  kateylouu: ROLE_MISC,
  hyperfixed789: ROLE_MISC,
  "4cvit": ROLE_4CVIT,
  princezam: ROLE_ZAM
};

/* YouTube channel ID → role */
const YT_ROLES = {
  "UCvt0HYxX34vUvqu66HLXeUw": ROLE_REKRAP,
  "UCupOeAF8co65kZ-N6zoVxmw": ROLE_REKRAP,
  "UCBChThUUh1ckdJoQX6VRrZw": ROLE_4CVIT,
  "UCE1U91gqwuBeSyqeuSpDXlw": ROLE_ZAM
};

/* ======================= TWITCH ======================= */
let twitchToken, twitchTokenExp = 0;

async function getTwitchToken() {
  if (twitchToken && Date.now() < twitchTokenExp) return twitchToken;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );

  const data = await res.json();
  twitchToken = data.access_token;
  twitchTokenExp = Date.now() + data.expires_in * 1000;
  return twitchToken;
}

async function twitchApi(path, method = 'GET', body) {
  const token = await getTwitchToken();
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    method,
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

async function createTwitchSubs() {
  const logins = process.env.TWITCH_BROADCASTER_LOGINS.split(',');

  for (const login of logins) {
    const user = await twitchApi(`/users?login=${login}`);
    const id = user.data?.[0]?.id;
    if (!id) continue;

    await twitchApi('/eventsub/subscriptions', 'POST', {
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_id: id },
      transport: {
        method: "webhook",
        callback: `${PUBLIC_BASE_URL}/twitch/eventsub`,
        secret: process.env.TWITCH_EVENTSUB_SECRET
      }
    });
  }
}

function verifyTwitch(req) {
  const id = req.header('Twitch-Eventsub-Message-Id');
  const ts = req.header('Twitch-Eventsub-Message-Timestamp');
  const sig = req.header('Twitch-Eventsub-Message-Signature');

  const hash = 'sha256=' + crypto
    .createHmac('sha256', process.env.TWITCH_EVENTSUB_SECRET)
    .update(id + ts + req.body.toString())
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(sig));
}

app.post('/twitch/eventsub', async (req, res) => {
  if (!verifyTwitch(req)) return res.sendStatus(403);

  const body = JSON.parse(req.body.toString());
  const type = req.header('Twitch-Eventsub-Message-Type');

  if (type === 'webhook_callback_verification') {
    return res.send(body.challenge);
  }

  if (type === 'notification') {
    const ev = body.event;
    const login = ev.broadcaster_user_login.toLowerCase();
    const role = TWITCH_ROLES[login];

    const embed = {
      title: `🔴 ${ev.broadcaster_user_name} is LIVE!`,
      url: `https://twitch.tv/${login}`,
      color: 0x9146FF,
      image: {
        url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg?${Date.now()}`
      },
      footer: { text: "Twitch" },
      timestamp: new Date()
    };

    await sendEmbed({ embed, roleId: role });
  }

  res.sendStatus(200);
});

/* ======================= YOUTUBE ======================= */
const parser = new XMLParser();

async function subscribeYT(channelId) {
  const hub = 'https://pubsubhubbub.appspot.com/subscribe';
  const topic = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  const form = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.topic': topic,
    'hub.callback': `${PUBLIC_BASE_URL}/youtube/websub`,
    'hub.verify': 'async',
    'hub.secret': process.env.YOUTUBE_CALLBACK_SECRET
  });

  await fetch(hub, { method: 'POST', body: form });
}

async function subscribeAllYT() {
  for (const id of process.env.YOUTUBE_CHANNEL_IDS.split(',')) {
    await subscribeYT(id);
  }
}

app.get('/youtube/websub', (req, res) => {
  if (req.query['hub.challenge']) return res.send(req.query['hub.challenge']);
  res.sendStatus(404);
});

app.post('/youtube/websub', async (req, res) => {
  const feed = parser.parse(req.body.toString());
  const entry = feed?.feed?.entry;
  if (!entry) return res.sendStatus(200);

  const videoId = entry['yt:videoId'];
  const channelId = entry['yt:channelId'];
  const title = entry.title;
  const role = YT_ROLES[channelId];

  const embed = {
    title,
    url: `https://youtube.com/watch?v=${videoId}`,
    color: 0xFF0000,
    image: {
      url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    },
    footer: { text: "YouTube" },
    timestamp: new Date()
  };

  await sendEmbed({ embed, roleId: role });

  res.sendStatus(200);
});

/* ======================= START ======================= */
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

discord.once('ready', async () => {
  console.log(`Logged in as ${discord.user.tag}`);
  await createTwitchSubs();
  await subscribeAllYT();
});

await discord.login(process.env.DISCORD_TOKEN);

