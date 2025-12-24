import { EmbedBuilder } from 'discord.js';

/* ================= TWITCH ================= */

export async function sendTwitchLiveEmbed(client, {
  channelId,
  roleId,
  streamerName,
  streamTitle,
  game,
  viewers,
  previewImage,
  profileImage,
  streamUrl
}) {
  const channel = await client.channels.fetch(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${streamerName} is now live on Twitch!`,
      iconURL: profileImage ?? undefined,
      url: streamUrl
    })
    .setTitle(streamTitle)
    .setURL(streamUrl)
    .setColor(0x9146FF)
    .addFields(
      { name: 'Game', value: game || 'Unknown', inline: true },
      { name: 'Viewers', value: String(viewers ?? 0), inline: true }
    )
    .setImage(previewImage)
    .setFooter({ text: 'Twitch' })
    .setTimestamp();

  await channel.send({
    content: roleId ? `<@&${roleId}>` : null,
    embeds: [embed],
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
}

/* ================= YOUTUBE ================= */

export async function sendYouTubeUploadEmbed(client, {
  channelId,
  roleId,
  channelName,
  title,
  videoUrl,
  thumbnail
}) {
  const channel = await client.channels.fetch(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${channelName} uploaded a new video!`,
      url: videoUrl
    })
    .setTitle(title)
    .setURL(videoUrl)
    .setColor(0xFF0000)
    .setImage(thumbnail)
    .setFooter({ text: 'YouTube' })
    .setTimestamp();

  await channel.send({
    content: roleId ? `<@&${roleId}>` : null,
    embeds: [embed],
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
}