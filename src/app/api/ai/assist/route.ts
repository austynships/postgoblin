import { assist } from "@/lib/agent";
import { HttpError, handler, requireUser } from "@/lib/auth";

export const POST = handler(async (req: Request) => {
  await requireUser();
  const { instruction, content, platforms } = await req.json();
  if (!String(instruction ?? "").trim()) throw new HttpError(400, "Tell the AI what to do");
  const text = await assist({
    instruction: String(instruction).slice(0, 2000),
    content: String(content ?? "").slice(0, 10000),
    platforms: Array.isArray(platforms) ? platforms : [],
  });
  return Response.json({ text });
});
