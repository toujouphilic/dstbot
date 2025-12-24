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
      s.setName('add')
        .setDescription('add a notification')
        .addStringOption(o =>
          o.setName('type')
            .setDescription('notification type')
            .setRequired(true)
            .addChoices(
              { name: 'twitch', value: 'twitch' },
              { name: 'youtube', value: 'youtube' }
            ))
        .addStringOption(o =>
          o.setName('from')
            .setDescription('source id')
            .setRequired(true))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('destination channel')
            .setRequired(true))
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('optional role ping')))

    .addSubcommand(s =>
      s.setName('list')
        .setDescription('list notifications'))

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

    .addSubcommand(s =>
      s.setName('remove')
        .setDescription('remove a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true)))

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

    /* setup is private */
    if (sub === 'setup') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const channel = interaction.options.getChannel('channel');

        await dbRun(
          `insert or ignore into servers
           (server_id, server_name, default_channel_id)
           values (?, ?, ?)`,
          [guildId, interaction.guild?.name ?? 'unknown', channel.id]
        );

        return interaction.editReply('notification setup complete');
      } catch (err) {
        console.error(err);
        return interaction.editReply(
          'an internal error occurred while running this command'
        );
      }
    }

    /* everything else is public */
    await interaction.deferReply();

    try {
      if (!(await hasNotifPermission(interaction))) {
        return interaction.followUp({
          content: 'you do not have permission to use this command',
          ephemeral: true
        });
      }

      if (sub === 'help') {
        return interaction.editReply(`
/notif setup
/notif add
/notif list
/notif enable
/notif disable
/notif remove
/notif addrole
/notif removerole
        `.trim());
      }

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
            `id ${n.id} | ${n.type} | ${n.source} -> <#${n.channel_id}> | ${n.enabled ? 'enabled' : 'disabled'}`
          ).join('\n')
        );
      }

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

      if (sub === 'remove') {
        await dbRun(
          `delete from notifications where id = ? and server_id = ?`,
          [interaction.options.getInteger('id'), guildId]
        );
        return interaction.editReply('notification removed');
      }

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
      return interaction.followUp({
        content: 'an internal error occurred while running this command',
        ephemeral: true
      });
    }
  }
};