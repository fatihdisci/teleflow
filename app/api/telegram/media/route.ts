import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export async function GET(request: Request) {
  if (!await getChatGPTUser()) return new Response("Unauthorized", { status: 401 });
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !/^[A-Za-z0-9_-]{20,}$/.test(token)) return new Response("Invalid media token", { status: 400 });
  if (!env.MAC_AGENT_URL || !env.MAC_AGENT_TOKEN) return new Response("Mac mini bağlantısı ayarlanmadı", { status: 503 });
  const response = await fetch(`${env.MAC_AGENT_URL.replace(/\/$/, "")}/v1/media/${token}`, { headers: { authorization: `Bearer ${env.MAC_AGENT_TOKEN}` } });
  return new Response(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/octet-stream", "content-disposition": response.headers.get("content-disposition") ?? "inline" } });
}
