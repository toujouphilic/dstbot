import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db/database.js';
import {
  sendTwitchLiveEmbed,
  sendYouTubeUploadEmbed
} from '../notifier/discordNotifier.js';

/* ================= SQLITE HELPERS ================= */

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

/* ================= PERMISSIONS ================= */

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

/* ================= COMMAND ================= */

export default {
  data: new SlashCommandBuilder()
    .setName('notif')
    .setDescription('manage notifications')

    /* setup */
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('set default notification channel')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('default channel')
            .setRequired(true)))

    /* add */
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
          o.setName('source')
            .setDescription('twitch username or youtube channel id')
            .setRequired(true))
        .addStringOption(o =>
          o.setName('name')
            .setDescription('optional name'))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('override channel'))
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('role to ping')))

    /* edit */
    .addSubcommand(s =>
      s.setName('edit')
        .setDescription('edit a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true))
        .addStringOption(o =>
          o.setName('name')
            .setDescription('new name')))

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
      const channel = interaction.options.getChannel('channel');

      await dbRun(
        `insert or replace into servers
         (server_id, server_name, default_channel_id)
         values (?, ?, ?)`,
        [guildId, interaction.guild.name, channel.id]
      );

      return interaction.reply(
        `notifications set up in <#${channel.id}>`
      );
    }

    /* role management = admin only */
    if (sub === 'addrole' || sub === 'removerole') {
      if (!interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({
          content: 'only administrators can manage notif roles',
          ephemeral: true
        });
      }

      const role = interaction.options.getRole('role');

      if (sub === 'addrole') {
        await dbRun(
          `insert or ignore into notif_roles (server_id, role_id)
           values (?, ?)`,
          [guildId, role.id]
        );
        return interaction.reply(`role <@&${role.id}> can now manage notifications`);
      }

      if (sub === 'removerole') {
        await dbRun(
          `delete from notif_roles where server_id = ? and role_id = ?`,
          [guildId, role.id]
        );
        return interaction.reply(`role <@&${role.id}> removed from notif permissions`);
      }
    }

    /* permission gate */
    if (!(await hasNotifPermission(interaction))) {
      return interaction.reply({
        content: 'you do not have permission to use this command',
        ephemeral: true
      });
    }

    /* ADD */
    if (sub === 'add') {
      const type = interaction.options.getString('type');
      const source = interaction.options.getString('source');
      const name = interaction.options.getString('name');
      const channelOpt = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');

      const server = await dbGet(
        `select default_channel_id from servers where server_id = ?`,
        [guildId]
      );

      if (!server && !channelOpt) {
        return interaction.reply(
          'run /notif setup first or specify a channel'
        );
      }

      const channelId = channelOpt?.id ?? server.default_channel_id;

      await dbRun(
        `insert into notifications
         (server_id, type, source, name, channel_id, role_id, enabled)
         values (?, ?, ?, ?, ?, ?, 1)`,
        [
          guildId,
          type,
          source,
          name ?? null,
          channelId,
          role?.id ?? null
        ]
      );

      return interaction.reply(
        `notification added for **${type}**: \`${source}\``
      );
    }

    /* LIST */
    if (sub === 'list') {
      const rows = await dbAll(
        `select * from notifications where server_id = ?`,
        [guildId]
      );

      if (!rows.length) {
        return interaction.reply('no notifications configured');
      }

      return interaction.reply(
        rows.map(n =>
          [
            `id ${n.id}`,
            n.name ? `name: ${n.name}` : null,
            n.type,
            n.source,
            `channel <#${n.channel_id}>`,
            n.enabled ? 'enabled' : 'disabled'
          ].filter(Boolean).join(' | ')
        ).join('\n')
      );
    }

    /* ENABLE / DISABLE */
    if (sub === 'enable' || sub === 'disable') {
      await dbRun(
        `update notifications set enabled = ?
         where id = ? and server_id = ?`,
        [sub === 'enable' ? 1 : 0, interaction.options.getInteger('id'), guildId]
      );

      return interaction.reply(
        `notification ${sub === 'enable' ? 'enabled' : 'disabled'}`
      );
    }

    /* REMOVE */
    if (sub === 'remove') {
      await dbRun(
        `delete from notifications where id = ? and server_id = ?`,
        [interaction.options.getInteger('id'), guildId]
      );
      return interaction.reply('notification removed');
    }

    /* TEST */
    if (sub === 'test') {
      const id = interaction.options.getInteger('id');
      const channel = interaction.options.getChannel('channel');

      const notif = await dbGet(
        `select * from notifications where id = ? and server_id = ?`,
        [id, guildId]
      );

      if (!notif) return interaction.reply('notification not found');

      if (notif.type === 'twitch') {
        await sendTwitchLiveEmbed(interaction.client, {
          channelId: channel.id,
          roleId: notif.role_id,
          streamerName: notif.source,
          streamTitle: 'test stream',
          game: 'test game',
          viewers: 0,
          previewImage:
            'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-1280x720.jpg',
          profileImage: null,
          streamUrl: `https://twitch.tv/${notif.source}`
        });
      }

      if (notif.type === 'youtube') {
        await sendYouTubeUploadEmbed(interaction.client, {
          channelId: channel.id,
          roleId: notif.role_id,
          channelName: notif.name ?? notif.source,
          title: 'test upload',
          videoUrl: 'https://youtube.com',
          thumbnail:
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
        });
      }

      return interaction.reply('test notification sent');
    }

    return interaction.reply('unknown command');
  }
};