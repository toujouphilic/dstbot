import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import notif from './commands/notif.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ Deploying slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [notif.data.toJSON()] }
    );

    console.log('✅ Slash commands deployed');
  } catch (err) {
    console.error('❌ Failed to deploy commands');
    console.error(err);
  }
})();