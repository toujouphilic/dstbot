import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db/database.js';

/* promise helpers */
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/* permission helper */
async function hasNotifPermission(interaction) {
  if (interaction.memberPermissions.has('Administrator')) return true;

  const rows = await dbAll(
    `select role_id from notif_roles where server_id = ?`,
    [interaction.guildId]
  );

  return interaction.member.roles.cache.some(r =>
    rows.some(row => row.role_id === r.id)
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
            .setDescription('default channel')
            .setRequired(true)))

    .addSubcommand(s =>
      s.setName('reload')
        .setDescription('reload notif system'))

    .addSubcommand(s =>
      s.setName('help')
        .setDescription('show notif commands'))

    .addSubcommand(s =>
      s.setName('add')
        .setDescription('add a notification')
        .addStringOption(o =>
          o.setName('type')
            .setRequired(true)
            .addChoices(
              { name: 'twitch', value: 'twitch' },
              { name: 'youtube', value: 'youtube' }
            ))
        .addStringOption(o =>
          o.setName('from')
            .setRequired(true))
        .addChannelOption(o =>
          o.setName('channel')
            .setRequired(true))
        .addRoleOption(o =>
          o.setName('role')))

    .addSubcommand(s =>
      s.setName('list')
        .setDescription('list notifications'))

    .addSubcommand(s =>
      s.setName('addrole')
        .setDescription('allow a role')
        .addRoleOption(o =>
          o.setName('role')
            .setRequired(true)))

    .addSubcommand(s =>
      s.setName('removerole')
        .setDescription('remove allowed role')
        .addRoleOption(o =>
          o.setName('role')
            .setRequired(true))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'this command can only be used in servers',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    /* admin-only commands */
    if (['addrole', 'removerole', 'reload'].includes(sub) &&
        !interaction.memberPermissions.has('Administrator')) {
      return interaction.editReply('only administrators can do this');
    }

    /* permission check */
    if (!(await hasNotifPermission(interaction))) {
      return interaction.editReply('you do not have permission to use this');
    }

    /* help */
    if (sub === 'help') {
      return interaction.editReply(`
/notif setup
/notif add
/notif list
/notif addrole
/notif removerole
/notif reload
      `.trim());
    }

    /* reload */
    if (sub === 'reload') {
      await dbRun(`select 1`);
      return interaction.editReply('notif system reloaded');
    }

    /* setup */
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      await dbRun(
        `insert or ignore into servers
         (server_id, server_name, default_channel_id)
         values (?, ?, ?)`,
        [guildId, interaction.guild.name, channel.id]
      );
      return interaction.editReply('notification setup complete');
    }

    /* require setup */
    const server = await dbGet(
      `select server_id from servers where server_id = ?`,
      [guildId]
    );

    if (!server) {
      return interaction.editReply(
        'this server is not set up yet. run /notif setup first'
      );
    }

    /* add */
    if (sub === 'add') {
      await dbRun(
        `insert into notifications
         (server_id, type, source, channel_id, role_id)
         values (?, ?, ?, ?, ?)`,
        [
          guildId,
          interaction.options.getString('type'),
          interaction.options.getString('from'),
          interaction.options.getChannel('channel').id,
          interaction.options.getRole('role')?.id ?? null
        ]
      );
      return interaction.editReply('notification added');
    }

    /* list */
    if (sub === 'list') {
      const rows = await dbAll(
        `select * from notifications where server_id = ?`,
        [guildId]
      );

      if (!rows.length) {
        return interaction.editReply('no notifications configured');
      }

      return interaction.editReply(
        rows.map(n =>
          `id ${n.id} | ${n.type} | ${n.source} -> <#${n.channel_id}>`
        ).join('\n')
      );
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
  }
};