import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db/database.js';

/* sqlite promise helpers */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, err => (err ? reject(err) : resolve()));
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

/* permission helper */
async function hasNotifPermission(interaction) {
  if (interaction.memberPermissions.has('Administrator')) return true;

  const rows = await dbAll(
    `select role_id from notif_roles where server_id = ?`,
    [interaction.guildId]
  );

  return interaction.member.roles.cache.some(role =>
    rows.some(row => row.role_id === role.id)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('notif')
    .setDescription('manage notifications')

    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('initialize notifications')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('default notification channel')
            .setRequired(true)))

    .addSubcommand(s =>
      s.setName('help')
        .setDescription('show notif commands'))

    .addSubcommand(s =>
      s.setName('addrole')
        .setDescription('allow a role to manage notif commands')
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('role to allow')
            .setRequired(true)))

    .addSubcommand(s =>
      s.setName('removerole')
        .setDescription('remove a role from notif permissions')
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('role to remove')
            .setRequired(true))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'this command can only be used in servers',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      /* 🔑 setup MUST bypass permissions */
      if (sub === 'setup') {
        const channel = interaction.options.getChannel('channel');

        await dbRun(
          `insert or ignore into servers
           (server_id, server_name, default_channel_id)
           values (?, ?, ?)`,
          [
            guildId,
            interaction.guild?.name ?? 'unknown',
            channel.id
          ]
        );

        return interaction.editReply('notification setup complete');
      }

      /* everything else requires permission */
      if (!(await hasNotifPermission(interaction))) {
        return interaction.editReply(
          'you do not have permission to use this command'
        );
      }

      /* help */
      if (sub === 'help') {
        return interaction.editReply(`
/notif setup
/notif help
/notif addrole
/notif removerole
        `.trim());
      }

      /* addrole */
      if (sub === 'addrole') {
        const role = interaction.options.getRole('role');

        await dbRun(
          `insert or ignore into notif_roles (server_id, role_id)
           values (?, ?)`,
          [guildId, role.id]
        );

        return interaction.editReply(
          `role ${role.name} can now manage notif commands`
        );
      }

      /* removerole */
      if (sub === 'removerole') {
        const role = interaction.options.getRole('role');

        await dbRun(
          `delete from notif_roles where server_id = ? and role_id = ?`,
          [guildId, role.id]
        );

        return interaction.editReply(
          `role ${role.name} can no longer manage notif commands`
        );
      }

      return interaction.editReply('unknown notif command');

    } catch (err) {
      console.error('notif command error:', err);
      return interaction.editReply(
        'an internal error occurred while running this command'
      );
    }
  }
};