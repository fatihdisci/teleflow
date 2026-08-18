import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

type ChatItem = { bot?: string; command?: string; responseText?: string; responseKind?: string; status?: string };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Kayıt veritabanı hazır değil." }, { status: 503 });
  const result = await env.DB.prepare("SELECT id, command, response_text, response_kind, status, created_at FROM run_history WHERE owner_id = ? AND flow_id = 0 ORDER BY id DESC LIMIT 100").bind(user.userId).all<{ id: number; command: string; response_text: string; response_kind: string; status: string; created_at: string }>();
  return Response.json({ items: (result.results ?? []).map((item) => ({ id: item.id, command: item.command, responseText: item.response_text, responseKind: item.response_kind, status: item.status, createdAt: item.created_at })) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Kayıt veritabanı hazır değil." }, { status: 503 });
  const body = await request.json() as { items?: ChatItem[] };
  const items = (body.items ?? []).slice(0, 20).filter((item) => item.command && item.bot);
  for (const item of items) {
    await env.DB.prepare("INSERT INTO run_history (owner_id, flow_id, command, response_text, response_kind, status) VALUES (?, 0, ?, ?, ?, ?)").bind(user.userId, `${item.bot} · ${item.command}`, String(item.responseText ?? "").slice(0, 12000), item.responseKind ?? "text", item.status ?? "received").run();
  }
  return Response.json({ saved: true, count: items.length });
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Kayıt veritabanı hazır değil." }, { status: 503 });
  await env.DB.prepare("DELETE FROM run_history WHERE owner_id = ? AND flow_id = 0").bind(user.userId).run();
  return Response.json({ deleted: true });
}
