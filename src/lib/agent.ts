import Anthropic from "@anthropic-ai/sdk";
import { listAccounts } from "./accounts";
import { HttpError, type User } from "./auth";
import { id } from "./crypto";
import { all, now, one, run, tx } from "./db";
import { CHAR_LIMITS, countChars } from "./limits";
import { publicMedia, getMedia } from "./media";
import { createPost, deletePost, getPost, listPosts, retryFailed, updatePost, type PostStatus, type PostView } from "./posts";
import { publishSoon } from "./scheduler";
import { isoInZone, parseIsoWithOffset, zonedToEpoch } from "./time";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max";
const MAX_TURNS = 15;

export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function anthropic() {
  if (!aiEnabled()) throw new HttpError(503, "AI is not configured — set ANTHROPIC_API_KEY in .env");
  return (client ??= new Anthropic());
}

/** Shared request options: adaptive thinking, effort, and server-side refusal fallback. */
function baseParams() {
  return {
    model: MODEL,
    thinking: { type: "adaptive" as const },
    output_config: { effort: EFFORT },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
}

const SYSTEM = `You are Goblin, the social media agent inside PostGoblins, a scheduling tool. You help the user plan, write, schedule and manage posts on their own connected social accounts (X, Bluesky, Mastodon, LinkedIn, Threads, Facebook Pages, Instagram, YouTube, TikTok, Discord, Telegram).

How you work:
- Use the tools to look things up rather than guessing. Call list_accounts before targeting accounts; only use account ids it returns.
- Write native-sounding copy for each platform and respect character limits: ${Object.entries(CHAR_LIMITS)
  .map(([k, v]) => `${k} ${v}`)
  .join(", ")}. When one text can't fit every chosen platform well, create separate posts (e.g. a short one for X/Bluesky and a longer one for LinkedIn).
- Media rules: Instagram posts need at least one photo or video; YouTube and TikTok posts need exactly one video (the first line becomes the YouTube title). Use list_media to find uploaded files; if the user hasn't uploaded what a platform needs, say so instead of creating a post that will fail.
- Times: every user message starts with a <context> block giving the current time and the user's timezone. Interpret times like "tomorrow at 9" in that timezone, and always pass scheduled_at as ISO-8601 with an explicit offset. Use find_open_slots when the user wants you to pick good times.
- For a content calendar or campaign, schedule the whole series in one go, spaced sensibly, then summarise it as a short list (local time, platforms, first words of each post).
- Scheduling and drafting are fine to do directly when asked. Publishing immediately (mode "now") and deleting posts are irreversible: only do them when the user has clearly asked for that specific action.
- If no accounts are connected, say so and point the user to the Accounts tab. Drafts can still be saved without accounts.
- Keep replies brief and concrete. Don't paste raw ids at the user unless useful.`;

const tools: Tool[] = [
  {
    name: "list_accounts",
    description: "List the user's connected social accounts with their ids, platform, name and status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_posts",
    description:
      "List posts (drafts, scheduled, published, failed) optionally filtered by status and time window. Times are ISO-8601 with offset.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "array",
          items: { type: "string", enum: ["draft", "scheduled", "publishing", "published", "partial", "failed"] },
        },
        from: { type: "string", description: "Inclusive lower bound, ISO-8601 with offset" },
        to: { type: "string", description: "Exclusive upper bound, ISO-8601 with offset" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_post",
    description: "Get one post with per-account delivery status and errors.",
    input_schema: {
      type: "object",
      properties: { post_id: { type: "string" } },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_post",
    description:
      'Create a post for one or more accounts. mode "draft" saves it unscheduled, "schedule" publishes at scheduled_at, "now" publishes immediately.',
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The post text exactly as it should appear." },
        account_ids: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: ["draft", "schedule", "now"] },
        scheduled_at: { type: "string", description: 'Required when mode is "schedule". ISO-8601 with offset.' },
        media_ids: { type: "array", items: { type: "string" }, description: "Ids from list_media." },
      },
      required: ["content", "account_ids", "mode"],
      additionalProperties: false,
    },
  },
  {
    name: "update_post",
    description:
      "Edit a draft, scheduled or failed post: text, accounts, media, time, or mode (e.g. turn a draft into a scheduled post).",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string" },
        content: { type: "string" },
        account_ids: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: ["draft", "schedule", "now"] },
        scheduled_at: { type: "string", description: "ISO-8601 with offset" },
        media_ids: { type: "array", items: { type: "string" } },
      },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_post",
    description: "Permanently delete a post from PostGoblins (does not remove already-published copies).",
    input_schema: {
      type: "object",
      properties: { post_id: { type: "string" } },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "retry_post",
    description: "Retry the failed deliveries of a post right away.",
    input_schema: {
      type: "object",
      properties: { post_id: { type: "string" } },
      required: ["post_id"],
      additionalProperties: false,
    },
  },
  {
    name: "find_open_slots",
    description:
      "Suggest good posting times in the user's timezone over the next N days, skipping times within 90 minutes of already scheduled posts.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 60 },
        per_day: { type: "integer", minimum: 1, maximum: 4, description: "Slots per day (default 1)" },
        start_date: { type: "string", description: "YYYY-MM-DD in the user's timezone; default today" },
        weekdays_only: { type: "boolean" },
      },
      required: ["days"],
      additionalProperties: false,
    },
  },
  {
    name: "list_media",
    description: "List the user's recently uploaded images/videos that can be attached to posts.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
];

/** Tools offered to external agents over MCP: the agent's tools plus a clock. */
export const mcpTools: Tool[] = [
  {
    name: "get_current_time",
    description:
      "Get the current time and the user's timezone. Call this before scheduling so relative times like 'tomorrow at 9' resolve correctly.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  ...tools,
];

function summarizePost(p: PostView, tz: string) {
  return {
    id: p.id,
    status: p.status,
    scheduled_at: p.scheduledAt ? isoInZone(p.scheduledAt, tz) : null,
    published_at: p.publishedAt ? isoInZone(p.publishedAt, tz) : null,
    content: p.content,
    media: p.media.map((m) => m.name),
    created_by: p.createdBy,
    targets: p.targets.map((t) => ({
      account_id: t.accountId,
      platform: t.provider,
      account: t.accountName,
      status: t.status,
      url: t.remoteUrl,
      error: t.error,
      chars: `${countChars(t.provider, p.content)}/${CHAR_LIMITS[t.provider]}`,
    })),
  };
}

const SLOT_TIMES: [number, number][] = [
  [9, 0],
  [12, 30],
  [17, 0],
  [19, 30],
];

type Action = { tool: string; summary: string; ok: boolean; postId?: string };

export async function runTool(
  user: User,
  tz: string,
  name: string,
  input: any,
): Promise<{ result: unknown; action?: Action }> {
  const time = (v?: string) => (v ? parseIsoWithOffset(v) : undefined);
  switch (name) {
    case "get_current_time":
      return { result: { now: isoInZone(now(), tz), timezone: tz, user: user.name } };
    case "list_accounts":
      return {
        result: (await listAccounts(user.id)).map((a) => ({
          id: a.id,
          platform: a.provider,
          name: a.name,
          username: a.username,
          status: a.status,
          char_limit: CHAR_LIMITS[a.provider],
          ...(a.lastError ? { last_error: a.lastError } : {}),
        })),
      };
    case "list_posts":
      return {
        result: (
          await listPosts(user.id, {
            status: input.status as PostStatus[] | undefined,
            from: time(input.from),
            to: time(input.to),
            limit: input.limit ?? 50,
          })
        ).map((p) => summarizePost(p, tz)),
      };
    case "get_post":
      return { result: summarizePost(await getPost(user.id, input.post_id), tz) };
    case "create_post": {
      const post = await createPost(
        user.id,
        {
          content: input.content,
          accountIds: input.account_ids ?? [],
          mediaIds: input.media_ids ?? [],
          mode: input.mode,
          scheduledAt: time(input.scheduled_at),
        },
        "agent",
      );
      if (input.mode === "now") publishSoon();
      const verb = input.mode === "draft" ? "Drafted" : input.mode === "now" ? "Publishing" : "Scheduled";
      return {
        result: summarizePost(post, tz),
        action: { tool: name, ok: true, postId: post.id, summary: `${verb}: “${post.content.slice(0, 60)}”` },
      };
    }
    case "update_post": {
      const post = await updatePost(user.id, input.post_id, {
        content: input.content,
        accountIds: input.account_ids,
        mediaIds: input.media_ids,
        mode: input.mode,
        scheduledAt: input.scheduled_at !== undefined ? time(input.scheduled_at) : undefined,
      });
      if (input.mode === "now") publishSoon();
      return {
        result: summarizePost(post, tz),
        action: { tool: name, ok: true, postId: post.id, summary: `Updated: “${post.content.slice(0, 60)}”` },
      };
    }
    case "delete_post": {
      const post = await getPost(user.id, input.post_id);
      await deletePost(user.id, input.post_id);
      return {
        result: { deleted: true },
        action: { tool: name, ok: true, summary: `Deleted: “${post.content.slice(0, 60)}”` },
      };
    }
    case "retry_post": {
      const post = await retryFailed(user.id, input.post_id);
      publishSoon();
      return {
        result: summarizePost(post, tz),
        action: { tool: name, ok: true, postId: post.id, summary: "Retrying failed deliveries" },
      };
    }
    case "find_open_slots": {
      const taken = (await listPosts(user.id, { status: ["scheduled"], from: now(), limit: 1000 }))
        .map((p) => p.scheduledAt!)
        .filter(Boolean);
      const today = isoInZone(now(), tz).slice(0, 10);
      const [y, m, d] = (input.start_date ?? today).split("-").map(Number);
      const perDay = input.per_day ?? 1;
      const slots: string[] = [];
      for (let i = 0; i < input.days; i++) {
        const day = new Date(Date.UTC(y, m - 1, d + i));
        if (input.weekdays_only && [0, 6].includes(day.getUTCDay())) continue;
        let picked = 0;
        for (const [h, mi] of SLOT_TIMES) {
          if (picked >= perDay) break;
          const at = zonedToEpoch(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi, tz);
          if (at < now() + 10 * 60_000) continue;
          if (taken.some((t) => Math.abs(t - at) < 90 * 60_000)) continue;
          slots.push(isoInZone(at, tz));
          picked++;
        }
      }
      return { result: { timezone: tz, slots } };
    }
    case "list_media": {
      const ids = (
        await all<{ id: string }>("SELECT id FROM media WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [
          user.id,
          input.limit ?? 20,
        ])
      ).map((r) => r.id);
      return { result: (await getMedia(user.id, ids)).map(publicMedia) };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

// ---------- conversation storage (append-only, so thinking blocks stay valid) ----------

async function loadMessages(conversationId: string): Promise<MessageParam[]> {
  const rows = await all<{ role: "user" | "assistant"; content: string }>(
    "SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY seq",
    [conversationId],
  );
  return rows.map((r) => ({ role: r.role, content: JSON.parse(r.content) }));
}

async function appendMessage(conversationId: string, message: MessageParam) {
  await tx([
    [
      "INSERT INTO conversation_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
      [conversationId, message.role, JSON.stringify(message.content), now()],
    ],
    ["UPDATE conversations SET updated_at = ? WHERE id = ?", [now(), conversationId]],
  ]);
}

export function listConversations(userId: string) {
  return all<{ id: string; title: string; updatedAt: number }>(
    `SELECT id, title, updated_at AS "updatedAt" FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    [userId],
  );
}

export async function deleteConversation(userId: string, conversationId: string) {
  await run("DELETE FROM conversations WHERE id = ? AND user_id = ?", [conversationId, userId]);
}

export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "action"; summary: string; ok: boolean };

const CONTEXT_RE = /^<context>[\s\S]*?<\/context>\s*/;

/** Turns the stored API transcript into a simple display transcript. */
export async function getConversation(userId: string, conversationId: string): Promise<ChatItem[]> {
  const owner = await one<{ user_id: string }>("SELECT user_id FROM conversations WHERE id = ?", [conversationId]);
  if (!owner || owner.user_id !== userId) throw new HttpError(404, "Conversation not found");
  const items: ChatItem[] = [];
  const toolNames = new Map<string, string>();
  for (const m of await loadMessages(conversationId)) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : (m.content as any[]);
    for (const b of blocks) {
      if (b.type === "text" && b.text.trim()) {
        const text = m.role === "user" ? b.text.replace(CONTEXT_RE, "") : b.text;
        if (text.trim()) items.push({ kind: m.role === "user" ? "user" : "assistant", text });
      } else if (b.type === "tool_use") {
        toolNames.set(b.id, b.name);
      } else if (b.type === "tool_result") {
        const name = toolNames.get(b.tool_use_id) ?? "tool";
        if (["list_accounts", "list_posts", "get_post", "find_open_slots", "list_media"].includes(name)) continue;
        const text = Array.isArray(b.content) ? b.content.map((c: any) => c.text).join("") : String(b.content ?? "");
        const summary = text.startsWith("{") ? (JSON.parse(text).__summary ?? name) : text;
        items.push({ kind: "action", summary, ok: !b.is_error });
      }
    }
  }
  return items;
}

export async function chat(user: User, opts: { conversationId?: string; message: string; timezone: string }) {
  const tz = opts.timezone;
  let conversationId = opts.conversationId;
  if (conversationId) {
    await getConversation(user.id, conversationId); // ownership check
  } else {
    conversationId = id("conv_");
    await run("INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [
      conversationId,
      user.id,
      opts.message.slice(0, 80),
      now(),
      now(),
    ]);
  }

  const messages = await loadMessages(conversationId);
  const userMessage: MessageParam = {
    role: "user",
    content: [
      {
        type: "text",
        text: `<context>Current time: ${isoInZone(now(), tz)} (${tz}). User: ${user.name}.</context>\n\n${opts.message}`,
      },
    ],
  };
  messages.push(userMessage);
  await appendMessage(conversationId, userMessage);

  const actions: Action[] = [];
  const replyParts: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic().beta.messages.create({
      ...baseParams(),
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
    });

    // Persist the full content (incl. thinking/fallback blocks) unchanged.
    const assistant: MessageParam = { role: "assistant", content: response.content as any };
    messages.push(assistant);
    await appendMessage(conversationId, assistant);

    for (const b of response.content) if (b.type === "text" && b.text.trim()) replyParts.push(b.text);

    if (response.stop_reason === "refusal") {
      replyParts.push("Sorry — I can't help with that request.");
      break;
    }
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") break;

    const results: ToolResult[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const { result, action } = await runTool(user, tz, block.name, block.input);
        if (action) actions.push(action);
        const payload = action ? { __summary: action.summary, ...(result as object) } : result;
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(payload) });
      } catch (err) {
        const message = (err as Error).message;
        if (!["list_accounts", "list_posts", "get_post"].includes(block.name)) {
          actions.push({ tool: block.name, ok: false, summary: `${block.name} failed: ${message}` });
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${message}`, is_error: true });
      }
    }
    // All results for one assistant turn go back in a single user message.
    const toolMessage: MessageParam = { role: "user", content: results };
    messages.push(toolMessage);
    await appendMessage(conversationId, toolMessage);
  }

  return { conversationId, reply: replyParts.join("\n\n"), actions };
}

/** One-shot writing help for the composer (rewrite, shorten, generate…). */
export async function assist(input: { instruction: string; content: string; platforms: string[] }) {
  const limits = input.platforms.map((p) => `${p} (${CHAR_LIMITS[p] ?? "?"} chars)`).join(", ");
  const response = await anthropic().beta.messages.create({
    ...baseParams(),
    output_config: { effort: "low" },
    max_tokens: 4000,
    system:
      "You write social media posts. Reply with only the finished post text — no preamble, quotes, or alternatives.",
    messages: [
      {
        role: "user",
        content: `Target platforms: ${limits || "general"}. Stay within the smallest limit.\n\nCurrent draft:\n${
          input.content || "(empty)"
        }\n\nInstruction: ${input.instruction}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new HttpError(422, "The AI declined this request");
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}
