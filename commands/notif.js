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
        )
    )
    .addStringOption(o =>
      o.setName('from')
        .setDescription('youtube channel id or twitch username')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('name')
        .setDescription('optional name for this notification')
        .setRequired(false)
    )
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('override channel (defaults to setup channel)')
        .setRequired(false)
    )
    .addRoleOption(o =>
      o.setName('role')
        .setDescription('role to ping')
        .setRequired(false)
    )
)
    /* edit (name only) */
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

    /* enable */
    .addSubcommand(s =>
      s.setName('enable')
        .setDescription('enable a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true)))

    /* disable */
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

    /* setup (public) */
    if (sub === 'setup') {
      await interaction.deferReply();

      try {
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
      } catch (err) {
        console.error(err);
        return interaction.followUp({
          content: 'an internal error occurred while running this command',
          ephemeral: true
        });
      }
    }

    /* everything else */
    await interaction.deferReply();

    try {
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
/notif enable
/notif disable
/notif remove
/notif addrole
/notif removerole
        `.trim());
      }

      /* add */
      if (sub === 'add') {
        const name = interaction.options.getString('name');
        const type = interaction.options.getString('type');
        const source = interaction.options.getString('from');
        const role = interaction.options.getRole('role');
        const overrideChannel = interaction.options.getChannel('channel');

        const server = await dbGet(
          `select default_channel_id from servers where server_id = ?`,
          [guildId]
        );

        if (!server) {
          return interaction.followUp({
            content: 'this server is not set up yet. run /notif setup first',
            ephemeral: true
          });
        }

        const finalChannelId = overrideChannel?.id ?? server.default_channel_id;
        const usedDefault = !overrideChannel;

        await dbRun(
          `insert into notifications
           (server_id, name, type, source, channel_id, role_id)
           values (?, ?, ?, ?, ?, ?)`,
          [
            guildId,
            name ?? null,
            type,
            source,
            finalChannelId,
            role?.id ?? null
          ]
        );

        return interaction.editReply(
          [
            'notification added',
            name ? `name: ${name}` : null,
            `type: ${type}`,
            `source: ${source}`,
            `channel: <#${finalChannelId}>${usedDefault ? ' (default)' : ''}`,
            role ? `ping: <@&${role.id}>` : 'ping: none'
          ].filter(Boolean).join(' | ')
        );
      }

      /* edit name */
      if (sub === 'edit') {
        const id = interaction.options.getInteger('id');
        const newName = interaction.options.getString('name');

        const notif = await dbGet(
          `select name from notifications where id = ? and server_id = ?`,
          [id, guildId]
        );

        if (!notif) {
          return interaction.editReply('notification not found');
        }

        await dbRun(
          `update notifications set name = ? where id = ? and server_id = ?`,
          [newName ?? null, id, guildId]
        );

        return interaction.editReply(
          [
            `notification updated`,
            `id: ${id}`,
            `old name: ${notif.name ?? 'none'}`,
            `new name: ${newName ?? 'none'}`
          ].join(' | ')
        );
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
      return interaction.followUp({
        content: 'an internal error occurred while running this command',
        ephemeral: true
      });
    }
  }
};