import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import notifCommand from './commands/notif.js';
import './db/database.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();
client.commands.set('notif', notifCommand);

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

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

client.login(process.env.DISCORD_TOKEN);