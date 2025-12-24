import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import notifCommand from './commands/notif.js';
import './db/database.js';
import {
  subscribeAllYouTube,
  handleYouTubeWebSub
} from './youtube/websub.js';

/* ================= DISCORD ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();
client.commands.set('notif', notifCommand);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Initial YouTube subscription
  await subscribeAllYouTube(process.env.PUBLIC_BASE_URL);

  // 🔁 Auto-renew YouTube subscriptions every 24h
  setInterval(async () => {
    try {
      console.log('🔁 Renewing YouTube WebSub subscriptions');
      await subscribeAllYouTube(process.env.PUBLIC_BASE_URL);
    } catch (err) {
      console.error('❌ Failed to renew YouTube subscriptions', err);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
});

/* ================= COMMAND HANDLER ================= */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ Something went wrong.',
        ephemeral: true
      });
    }
  }
});

/* ================= EXPRESS (WEBHOOKS) ================= */

const app = express();

// YouTube WebSub requires raw body
app.use('/youtube/websub', express.raw({ type: '*/*' }));

// Health check (Render + UptimeRobot)
app.get('/', (req, res) => res.status(200).send('OK'));

// YouTube WebSub endpoint (GET verification + POST notifications)
app.all('/youtube/websub', (req, res) =>
  handleYouTubeWebSub(req, res, client)
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌐 Web server listening on port ${PORT}`)
);

/* ================= START ================= */

await client.login(process.env.DISCORD_TOKEN);