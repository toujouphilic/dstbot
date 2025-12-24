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
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('set the default notification channel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('channel to send notifications in')
            .setRequired(true)
        )
    )

    /* add */
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('add a notification')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('notification type')
            .setRequired(true)
            .addChoices(
              { name: 'twitch', value: 'twitch' },
              { name: 'youtube', value: 'youtube' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('source')
            .setDescription('twitch username or youtube channel id')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('optional display name')
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('override channel')
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('role to ping')
        )
    )

    /* list */
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('list notifications')
    )

    /* enable */
    .addSubcommand(sub =>
      sub
        .setName('enable')
        .setDescription('enable a notification')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('notification id')
            .setRequired(true)
        )
    )

    /* disable */
    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('disable a notification')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('notification id')
            .setRequired(true)
        )
    )

    /* remove */
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('remove a notification')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('notification id')
            .setRequired(true)
        )
    )

    /* test */
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('send a test embed')
        .addIntegerOption(opt =>
          opt
            .setName('id')
            .setDescription('notification id')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('channel to send test to')
            .setRequired(true)
        )
    ),

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

    if (!(await hasNotifPermission(interaction))) {
      return interaction.reply({
        content: 'you do not have permission to use this command',
        ephemeral: true
      });
    }

    /* list */
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
        return interaction.reply('notification not found');
      }

      if (notif.type === 'twitch') {
        await sendTwitchLiveEmbed(interaction.client, {
          channelId: channel.id,
          roleId: notif.role_id,
          streamerName: notif.source,
          streamTitle: 'test stream',
          game: 'test game',
          viewers: 0,
          previewImage: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-1280x720.jpg',
          profileImage: null,
          streamUrl: `https://twitch.tv/${notif.source}`
        });
      }

      if (notif.type === 'youtube') {
        await sendYouTubeUploadEmbed(interaction.client, {
          channelId: channel.id,
          roleId: notif.role_id,
          title: 'test upload',
          videoUrl: 'https://youtube.com',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
        });
      }

      return interaction.reply('test embed sent');
    }

    return interaction.reply('unknown command');
  }
};