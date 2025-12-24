import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import notifCommand from './commands/notif.js';
import './db/database.js';

import { pollTwitch } from './twitch/poll.js';
import { pollYouTube } from './youtube/poll.js';

/* ================= DISCORD ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();
client.commands.set('notif', notifCommand);

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔁 Poll Twitch every 60s
  setInterval(() => pollTwitch(client), 60 * 1000);

  // 🔁 Poll YouTube every 3 min
  setInterval(() => pollYouTube(client), 3 * 60 * 1000);
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
        content: 'something went wrong',
        ephemeral: true
      });
    }
  }
});

/* ================= EXPRESS ================= */

const app = express();

// health check for render / uptime robot
app.get('/', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌐 Web server listening on port ${PORT}`)
);

/* ================= START ================= */

await client.login(process.env.DISCORD_TOKEN);