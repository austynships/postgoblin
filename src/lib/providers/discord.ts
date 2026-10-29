import { api, readMedia } from "./http";
import { ProviderError, type Provider } from "./types";

export const discord: Provider = {
  id: "discord",
  name: "Discord",
  color: "#5865f2",
  maxChars: 2000,
  maxMedia: 10,
  connect: "form",
  fields: [
    {
      name: "webhookUrl",
      label: "Channel webhook URL",
      type: "url",
      placeholder: "https://discord.com/api/webhooks/…",
      help: "Channel settings → Integrations → Webhooks → New Webhook → Copy URL.",
      required: true,
    },
  ],
  isConfigured: () => true,

  async connectForm(values) {
    const url = values.webhookUrl.trim();
    if (!/^https:\/\/(canary\.|ptb\.)?(discord|discordapp)\.com\/api\/webhooks\//.test(url)) {
      throw new ProviderError("That doesn't look like a Discord webhook URL", false);
    }
    const hook = await api(url, {}, "Discord webhook");
    return [
      {
        externalId: hook.id,
        name: hook.name,
        username: `#${hook.channel_id}`,
        avatar: hook.avatar ? `https://cdn.discordapp.com/avatars/${hook.id}/${hook.avatar}.png` : undefined,
        profileUrl: hook.guild_id ? `https://discord.com/channels/${hook.guild_id}/${hook.channel_id}` : undefined,
        secrets: { webhookUrl: url, guildId: hook.guild_id, channelId: hook.channel_id },
      },
    ];
  },

  async publish(account, { text, media }) {
    const { webhookUrl, guildId, channelId } = account.secrets as Record<string, string>;
    const body = new FormData();
    body.append(
      "payload_json",
      JSON.stringify({
        content: text,
        attachments: media.slice(0, 10).map((m, i) => ({ id: i, filename: m.name })),
      }),
    );
    for (const [i, m] of media.slice(0, 10).entries()) body.append(`files[${i}]`, await readMedia(m), m.name);
    const msg = await api(`${webhookUrl}?wait=true`, { method: "POST", body }, "Discord post");
    return {
      id: msg.id,
      url: guildId ? `https://discord.com/channels/${guildId}/${channelId}/${msg.id}` : undefined,
    };
  },
};
