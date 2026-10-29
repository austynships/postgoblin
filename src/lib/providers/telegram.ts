import { api, readMedia } from "./http";
import type { MediaFile, Provider } from "./types";

const CAPTION_LIMIT = 1024;

export const telegram: Provider = {
  id: "telegram",
  name: "Telegram",
  color: "#229ed9",
  maxChars: 4096,
  maxMedia: 10,
  connect: "form",
  fields: [
    {
      name: "botToken",
      label: "Bot token",
      type: "password",
      placeholder: "123456:ABC-DEF…",
      help: "Create a bot with @BotFather, then add it as an admin of your channel or group.",
      required: true,
    },
    { name: "chatId", label: "Channel / chat", placeholder: "@mychannel or -1001234567890", required: true },
  ],
  isConfigured: () => true,

  async connectForm(values) {
    const base = `https://api.telegram.org/bot${values.botToken.trim()}`;
    await api(`${base}/getMe`, {}, "Telegram bot");
    const { result: chat } = await api(
      `${base}/getChat?chat_id=${encodeURIComponent(values.chatId.trim())}`,
      {},
      "Telegram chat",
    );
    return [
      {
        externalId: String(chat.id),
        name: chat.title ?? chat.username ?? String(chat.id),
        username: chat.username ? `@${chat.username}` : undefined,
        profileUrl: chat.username ? `https://t.me/${chat.username}` : undefined,
        secrets: { botToken: values.botToken.trim(), chatId: String(chat.id), chatUsername: chat.username },
      },
    ];
  },

  async publish(account, { text, media }) {
    const { botToken, chatId, chatUsername } = account.secrets as Record<string, string>;
    const base = `https://api.telegram.org/bot${botToken}`;
    const send = (method: string, body: FormData) => api(`${base}/${method}`, { method: "POST", body }, "Telegram");
    const fileField = (m: MediaFile) => (m.mime.startsWith("video/") ? "video" : "photo");

    // Long captions don't fit on media; send the text as its own message.
    const captionFits = text.length <= CAPTION_LIMIT;
    let first: any;

    if (media.length === 1) {
      const body = new FormData();
      body.append("chat_id", chatId);
      body.append(fileField(media[0]), await readMedia(media[0]), media[0].name);
      if (captionFits) body.append("caption", text);
      first = (await send(media[0].mime.startsWith("video/") ? "sendVideo" : "sendPhoto", body)).result;
    } else if (media.length > 1) {
      const body = new FormData();
      body.append("chat_id", chatId);
      const items = media.slice(0, 10).map((m, i) => ({
        type: fileField(m),
        media: `attach://file${i}`,
        ...(i === 0 && captionFits ? { caption: text } : {}),
      }));
      body.append("media", JSON.stringify(items));
      for (const [i, m] of media.slice(0, 10).entries()) body.append(`file${i}`, await readMedia(m), m.name);
      first = (await send("sendMediaGroup", body)).result[0];
    }

    if (!media.length || !captionFits) {
      const body = new FormData();
      body.append("chat_id", chatId);
      body.append("text", text);
      const msg = (await send("sendMessage", body)).result;
      first ??= msg;
    }

    return {
      id: String(first.message_id),
      url: chatUsername ? `https://t.me/${chatUsername}/${first.message_id}` : undefined,
    };
  },
};
