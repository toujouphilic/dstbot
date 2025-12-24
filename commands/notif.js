import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db/database.js';

/* permission helper */
async function hasNotifPermission(interaction) {
  if (interaction.memberPermissions.has('Administrator')) return true;

  return new Promise((resolve) => {
    db.all(
      `select role_id from notif_roles where server_id = ?`,
      [interaction.guildId],
      (err, rows) => {
        if (err || !rows.length) return resolve(false);

        const allowed = rows.map(r => r.role_id);
        const memberRoles = interaction.member.roles.cache;

        resolve(memberRoles.some(r => allowed.includes(r.id)));
      }
    );
  });
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
      s.setName('list')
        .setDescription('list notifications'))

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

    // prevent discord timeout
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // admin-only actions
    if (['addrole', 'removerole', 'reload'].includes(sub) &&
        !interaction.memberPermissions.has('Administrator')) {
      return interaction.editReply(
        'only administrators can manage notif roles'
      );
    }

    // permission check
    if (!(await hasNotifPermission(interaction))) {
      return interaction.editReply(
        'you do not have permission to use this command'
      );
    }

    /* reload */
    if (sub === 'reload') {
      db.serialize(() => db.run(`select 1`));
      return interaction.editReply('notif system reloaded');
    }

    /* help */
    if (sub === 'help') {
      return interaction.editReply(`
/notif setup
/notif add
/notif edit
/notif enable
/notif disable
/notif remove
/notif list
/notif addrole
/notif removerole
/notif reload
      `.trim());
    }

    /* setup */
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');

      db.run(
        `insert or ignore into servers
         (server_id, server_name, default_channel_id)
         values (?, ?, ?)`,
        [guildId, interaction.guild.name, channel.id]
      );

      return interaction.editReply('notification setup complete');
    }

    /* commands that require setup */
    db.get(
      `select server_id from servers where server_id = ?`,
      [guildId],
      (err, server) => {
        if (!server) {
          return interaction.editReply(
            'this server is not set up yet. run /notif setup first'
          );
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

          return interaction.editReply('notification added');
        }

        if (sub === 'edit') {
          const id = interaction.options.getInteger('id');
          const channel = interaction.options.getChannel('channel');
          const role = interaction.options.getRole('role');

          db.get(
            `select id from notifications where id = ? and server_id = ?`,
            [id, guildId],
            (err, notif) => {
              if (!notif) {
                return interaction.editReply('notification not found');
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

              return interaction.editReply('notification updated');
            }
          );
          return;
        }

        if (sub === 'enable' || sub === 'disable') {
          db.run(
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
          db.run(
            `delete from notifications where id = ? and server_id = ?`,
            [interaction.options.getInteger('id'), guildId]
          );

          return interaction.editReply('notification removed');
        }

        if (sub === 'list') {
          db.all(
            `select * from notifications where server_id = ?`,
            [guildId],
            (err, rows) => {
              if (!rows.length) {
                return interaction.editReply(
                  'no notifications configured for this server'
                );
              }

              const lines = rows.map(n =>
                `id ${n.id} | ${n.type} | ${n.source} -> <#${n.channel_id}> | ${n.enabled ? 'enabled' : 'disabled'}`
              );

              interaction.editReply(lines.join('\n'));
            }
          );
          return;
        }

        if (sub === 'addrole') {
          const role = interaction.options.getRole('role');

          db.run(
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

          db.run(
            `delete from notif_roles where server_id = ? and role_id = ?`,
            [guildId, role.id]
          );

          return interaction.editReply(
            `role ${role.name} can no longer manage notif commands`
          );
        }

        // required fallback to prevent infinite thinking
        return interaction.editReply('unknown notif command');
      }
    );
  }
};