import { mcpTools, runTool } from "@/lib/agent";
import { userFromApiKey } from "@/lib/apikeys";
import { HttpError, appUrl, type User } from "@/lib/auth";

/**
 * MCP server over Streamable HTTP (stateless, JSON responses).
 * Clients authenticate with a PostGoblins API key: `Authorization: Bearer pg_…`.
 */

export const maxDuration = 300;

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "postgoblins", title: "PostGoblins", version: "0.1.0" };
const INSTRUCTIONS =
  "PostGoblins schedules posts to the user's own connected social accounts (X, Bluesky, Mastodon, LinkedIn, Threads, Facebook Pages, Discord, Telegram). " +
  "Call get_current_time and list_accounts first. Always pass scheduled_at as ISO-8601 with an explicit UTC offset. " +
  "Respect each platform's character limit (returned by list_accounts). Only use mode 'now' or delete_post when the user explicitly asked for that.";

const READ_ONLY = new Set(["get_current_time", "list_accounts", "list_posts", "get_post", "find_open_slots", "list_media"]);
const TITLES: Record<string, string> = {
  get_current_time: "Current time",
  list_accounts: "List connected accounts",
  list_posts: "List posts",
  get_post: "Get post",
  create_post: "Create / schedule post",
  update_post: "Update post",
  delete_post: "Delete post",
  retry_post: "Retry failed deliveries",
  find_open_slots: "Find open posting slots",
  list_media: "List uploaded media",
};

const toolList = mcpTools.map((t) => ({
  name: t.name,
  title: TITLES[t.name],
  description: t.description,
  inputSchema: t.input_schema,
  annotations: {
    readOnlyHint: READ_ONLY.has(t.name),
    destructiveHint: t.name === "delete_post",
    idempotentHint: READ_ONLY.has(t.name),
    // Publishing reaches external social networks.
    openWorldHint: ["create_post", "update_post", "retry_post"].includes(t.name),
  },
}));

type RpcMessage = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: any };

const ok = (id: RpcMessage["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: RpcMessage["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(user: User, msg: RpcMessage) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolList });
    case "tools/call": {
      const name = params?.name;
      if (!mcpTools.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool: ${name}`);
      try {
        const { result, action } = await runTool(user, user.timezone, name, params?.arguments ?? {});
        const payload = action ? { summary: action.summary, result } : result;
        return ok(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: false });
      } catch (err) {
        // Tool failures are reported to the model, not as protocol errors.
        return ok(id, { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

function unauthorized() {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid API key. Create one in PostGoblins → Settings." } },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="postgoblins"' } },
  );
}

export async function POST(req: Request) {
  // Guard against DNS rebinding: browsers send Origin, CLI/desktop MCP clients don't.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(appUrl()).origin) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }
  const user = userFromApiKey(req);
  if (!user) return unauthorized();

  let body: RpcMessage | RpcMessage[];
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const msg of messages) {
    if (msg?.jsonrpc !== "2.0") {
      responses.push(fail(msg?.id ?? null, -32600, "Invalid request"));
      continue;
    }
    // Notifications (no id) and client responses get no reply.
    if (msg.id === undefined || msg.id === null || !msg.method) continue;
    try {
      responses.push(await handle(user, msg));
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "Internal error";
      responses.push(fail(msg.id, -32603, message));
    }
  }

  if (!responses.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

// Stateless server: no server-initiated SSE stream and no sessions to end.
export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
