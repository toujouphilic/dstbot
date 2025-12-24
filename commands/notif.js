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
              { name: 'twitch', value: 'twitch' },
              { name: 'youtube', value: 'youtube' }
            ))
        .addStringOption(o =>
          o.setName('from')
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
      s.setName('