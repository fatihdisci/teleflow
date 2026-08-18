import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

type RunRequest = { botUsername?: string; commands?: string[]; intervalSeconds?: number };

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  const body = await request.json() as RunRequest;
  if (!body.botUsername || !body.commands?.length) return Response.json({ message: "Bot ve komut listesi zorunludur." }, { status: 400 });
  const response = await agentFetch("/v1/runs", { bot_username: body.botUsername, commands: body.commands, interval_seconds: body.intervalSeconds ?? 4 });
  return Response.json(await response.json(), { status: response.status });
}

export async function GET(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ message: "Akış kimliği gerekli." }, { status: 400 });
  const response = await agentFetch(`/v1/runs/${encodeURIComponent(id)}`);
  const data = await response.json() as { responses?: Array<{ media_url?: string | null }> };
  if (data.responses) data.responses = data.responses.map((item) => ({ ...item, media_url: item.media_url ? `/api/telegram/media?token=${encodeURIComponent(item.media_url.split("/").pop() ?? "")}` : null }));
  return Response.json(data, { status: response.status });
}

async function agentFetch(path: string, body?: unknown) {
  if (!env.MAC_AGENT_URL || !env.MAC_AGENT_TOKEN) return Response.json({ message: "Mac mini bağlantısı henüz ayarlanmadı." }, { status: 503 });
  return fetch(`${env.MAC_AGENT_URL.replace(/\/$/, "")}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${env.MAC_AGENT_TOKEN}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
