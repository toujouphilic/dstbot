import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db/database.js';

/* sqlite helpers */
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
    rows.some(r => r.role_id === role.id)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('notif')
    .setDescription('manage notifications')

    /* setup */
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('initialize notifications')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('default notification channel')
            .setRequired(true)))

    /* help */
    .addSubcommand(s =>
      s.setName('help')
        .setDescription('show notif commands'))

    /* add */
    .addSubcommand(s =>
      s.setName('add')
        .setDescription('add a notification')
        .addStringOption(o =>
          o.setName('type')
            .setDescription('notification type')
            .setRequired(true)
            .addChoices(
              { name: 'youtube', value: 'youtube' },
              { name: 'twitch', value: 'twitch' }
            ))
        .addStringOption(o =>
          o.setName('from')
            .setDescription('youtube channel id or twitch username')
            .setRequired(true))
        .addStringOption(o =>
          o.setName('name')
            .setDescription('optional name for this notification'))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('override channel (defaults to setup channel)'))
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('role to ping')))

    /* edit (name only, unchanged) */
    .addSubcommand(s =>
      s.setName('edit')
        .setDescription('edit a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true))
        .addStringOption(o =>
          o.setName('name')
            .setDescription('new name (leave empty to clear)')))

    /* list */
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('list notifications'))

    /* enable / disable */
    .addSubcommand(s =>
      s.setName('enable')
        .setDescription('enable a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true)))

    .addSubcommand(s =>
      s.setName('disable')
        .setDescription('disable a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true)))

    /* remove */
    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('remove a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true)))

    /* test */
    .addSubcommand(s =>
      s.setName('test')
        .setDescription('send a test notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('channel to send test to')
            .setRequired(true)))

    /* role permissions */
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

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    /* setup is public */
    if (sub === 'setup') {
      await interaction.deferReply();

      const channel = interaction.options.getChannel('channel');

      await dbRun(
        `insert or ignore into servers
         (server_id, server_name, default_channel_id)
         values (?, ?, ?)`,
        [guildId, interaction.guild?.name ?? 'unknown', channel.id]
      );

      return interaction.editReply(
        `notification system set up. default channel is <#${channel.id}>`
      );
    }

    await interaction.deferReply();

    if (!(await hasNotifPermission(interaction))) {
      return interaction.followUp({
        content: 'you do not have permission to use this command',
        ephemeral: true
      });
    }

    /* help */
    if (sub === 'help') {
      return interaction.editReply(`
/notif setup
/notif add
/notif edit
/notif list
/notif test
/notif enable
/notif disable
/notif remove
/notif addrole
/notif removerole
      `.trim());
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
          [
            `id ${n.id}`,
            n.name ? `name: ${n.name}` : null,
            n.type,
            n.source,
            `-> <#${n.channel_id}>`,
            n.enabled ? 'enabled' : 'disabled'
          ].filter(Boolean).join(' | ')
        ).join('\n')
      );
    }

    /* test */
    if (sub === 'test') {
      const id = interaction.options.getInteger('id');
      const channel = interaction.options.getChannel('channel');

      const notif = await dbGet(
        `select * from notifications where id = ? and server_id = ?`,
        [id, guildId]
      );

      if (!notif) {
        return interaction.editReply('notification not found');
      }

      const ping = notif.role_id ? `<@&${notif.role_id}> ` : '';
      const name = notif.name ? `**${notif.name}**` : 'notification';

      await channel.send(
        `${ping}🔔 **test notification**\n${name}\n${notif.type}: ${notif.source}`
      );

      return interaction.editReply(
        `test notification sent to <#${channel.id}>`
      );
    }

    /* enable / disable */
    if (sub === 'enable' || sub === 'disable') {
      await dbRun(
        `update notifications set enabled = ?
         where id = ? and server_id = ?`,
        [
          sub === 'enable' ? 1 : 0,
          interaction.options.getInteger('id'),
          guildId
        ]
      );

      return interaction.editReply(
        `notification ${sub === 'enable' ? 'enabled' : 'disabled'}`
      );
    }

    /* remove */
    if (sub === 'remove') {
      await dbRun(
        `delete from notifications where id = ? and server_id = ?`,
        [interaction.options.getInteger('id'), guildId]
      );

      return interaction.editReply('notification removed');
    }

    return interaction.editReply('unknown notif command');
  }
};