import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db/database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('notif')
    .setDescription('manage notifications')
    .addSubcommand(s =>
      s.setName('setup')
        .setDescription('initialize notifications for this server')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('default notification channel')
            .setRequired(true)))
    .addSubcommand(s =>
      s.setName('help')
        .setDescription('show notification commands'))
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
            .setDescription('optional role')))
    .addSubcommand(s =>
      s.setName('edit')
        .setDescription('edit a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('new channel'))
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('new role')))
    .addSubcommand(s =>
      s.setName('disable')
        .setDescription('disable a notification')
        .addIntegerOption(o =>
          o.setName('id')
            .setDescription('notification id')
            .setRequired(true)))
    .addSubcommand(s =>
      s.setName('enable')
        .setDescription('enable a notification')
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
      s.setName('list')
        .setDescription('list notifications')),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'this command can only be used in servers',
        ephemeral: true
      });
    }

    if (!interaction.memberPermissions.has('ManageGuild')) {
      return interaction.reply({
        content: 'you need manage server permission to use this command',
        ephemeral: true
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'help') {
      return interaction.reply({
        ephemeral: true,
        content: `
/notif setup
/notif add
/notif edit
/notif disable
/notif enable
/notif remove
/notif list
        `.trim()
      });
    }

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');

      db.run(
        `insert or ignore into servers (server_id, server_name, default_channel_id)
         values (?, ?, ?)`,
        [guildId, interaction.guild.name, channel.id]
      );

      return interaction.reply({
        content: 'notification setup complete',
        ephemeral: true
      });
    }

    db.get(
      `select * from servers where server_id = ?`,
      [guildId],
      (err, server) => {
        if (!server) {
          return interaction.reply({
            content: 'this server is not set up yet. run /notif setup first',
            ephemeral: true
          });
        }

        if (sub === 'add') {
          db.run(
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

          return interaction.reply({
            content: 'notification added',
            ephemeral: true
          });
        }

        if (sub === 'edit') {
          const id = interaction.options.getInteger('id');
          const channel = interaction.options.getChannel('channel');
          const role = interaction.options.getRole('role');

          db.get(
            `select * from notifications where id = ? and server_id = ?`,
            [id, guildId],
            (err, notif) => {
              if (!notif) {
                return interaction.reply({
                  content: 'notification not found',
                  ephemeral: true
                });
              }

              if (channel) {
                db.run(
                  `update notifications set channel_id = ? where id = ?`,
                  [channel.id, id]
                );
              }

              if (role !== null) {
                db.run(
                  `update notifications set role_id = ? where id = ?`,
                  [role?.id ?? null, id]
                );
              }

              return interaction.reply({
                content: 'notification updated',
                ephemeral: true
              });
            }
          );
        }

        if (sub === 'disable' || sub === 'enable') {
          db.run(
            `update notifications set enabled = ?
             where id = ? and server_id = ?`,
            [
              sub === 'enable' ? 1 : 0,
              interaction.options.getInteger('id'),
              guildId
            ]
          );

          return interaction.reply({
            content: `notification ${sub === 'enable' ? 'enabled' : 'disabled'}`,
            ephemeral: true
          });
        }

        if (sub === 'remove') {
          db.run(
            `delete from notifications where id = ? and server_id = ?`,
            [interaction.options.getInteger('id'), guildId]
          );

          return interaction.reply({
            content: 'notification removed',
            ephemeral: true
          });
        }

        if (sub === 'list') {
          db.all(
            `select * from notifications where server_id = ?`,
            [guildId],
            (err, rows) => {
              if (!rows.length) {
                return interaction.reply({
                  content: 'no notifications configured for this server',
                  ephemeral: true
                });
              }

              const output = rows.map(n =>
                `id ${n.id} | ${n.type} | ${n.source} -> <#${n.channel_id}> | ${n.enabled ? 'enabled' : 'disabled'}`
              );

              interaction.reply({
                content: output.join('\n'),
                ephemeral: true
              });
            }
          );
        }
      }
    );
  }
};