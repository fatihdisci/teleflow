import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

type FlowPayload = { id?: number; name?: string; bot?: string; commands?: Array<{ id?: number; text?: string; argument?: string }> };

function decodeCommand(value: string) {
  try {
    const parsed = JSON.parse(value) as { text?: string; argument?: string };
    if (parsed.text) return { text: parsed.text, argument: parsed.argument || undefined };
  } catch {
    // Existing records contain plain command text.
  }
  return { text: value };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Kayıt veritabanı hazır değil." }, { status: 503 });

  const flows = await env.DB.prepare("SELECT id, name, bot_username FROM flows WHERE owner_id = ? ORDER BY id ASC").bind(user.userId).all<{ id: number; name: string; bot_username: string }>();
  const templates = await Promise.all((flows.results ?? []).map(async (flow) => {
    const commands = await env.DB.prepare("SELECT id, command FROM flow_commands WHERE flow_id = ? ORDER BY position ASC, id ASC").bind(flow.id).all<{ id: number; command: string }>();
    return { id: flow.id, name: flow.name, bot: flow.bot_username, commands: (commands.results ?? []).map((command) => ({ id: command.id, ...decodeCommand(command.command) })) };
  }));
  return Response.json({ templates });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Kayıt veritabanı hazır değil." }, { status: 503 });

  const body = await request.json() as { templates?: FlowPayload[] };
  const templates = (body.templates ?? []).slice(0, 50).map((template) => ({
    name: String(template.name ?? "").trim().slice(0, 120),
    bot: String(template.bot ?? "").trim().slice(0, 120),
    commands: (template.commands ?? []).slice(0, 100).map((command) => ({ text: String(command.text ?? "").trim().slice(0, 200), argument: String(command.argument ?? "").trim().slice(0, 100) })).filter((command) => command.text),
  })).filter((template) => template.name && template.bot);

  for (const template of templates) {
    const existingId = Number((body.templates ?? []).find((candidate) => String(candidate.name ?? "").trim() === template.name && candidate.id)?.id ?? 0);
    const owned = existingId ? await env.DB.prepare("SELECT id FROM flows WHERE id = ? AND owner_id = ?").bind(existingId, user.userId).first<{ id: number }>() : null;
    const inserted = owned
      ? await env.DB.prepare("UPDATE flows SET name = ?, bot_username = ? WHERE id = ? AND owner_id = ? RETURNING id").bind(template.name, template.bot, owned.id, user.userId).first<{ id: number }>()
      : await env.DB.prepare("INSERT INTO flows (owner_id, name, bot_username, interval_seconds) VALUES (?, ?, ?, 4) RETURNING id").bind(user.userId, template.name, template.bot).first<{ id: number }>();
    if (!inserted?.id) continue;
    await env.DB.prepare("DELETE FROM flow_commands WHERE flow_id = ?").bind(inserted.id).run();
    for (const [position, command] of template.commands.entries()) {
      const storedCommand = command.argument ? JSON.stringify(command) : command.text;
      await env.DB.prepare("INSERT INTO flow_commands (flow_id, command, position) VALUES (?, ?, ?)").bind(inserted.id, storedCommand, position).run();
    }
  }
  return Response.json({ saved: true, count: templates.length });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Kayıt veritabanı hazır değil." }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ message: "Geçersiz şablon." }, { status: 400 });
  await env.DB.prepare("DELETE FROM flow_commands WHERE flow_id = ? AND flow_id IN (SELECT id FROM flows WHERE id = ? AND owner_id = ?)").bind(id, id, user.userId).run();
  await env.DB.prepare("DELETE FROM flows WHERE id = ? AND owner_id = ?").bind(id, user.userId).run();
  return Response.json({ deleted: true });
}
