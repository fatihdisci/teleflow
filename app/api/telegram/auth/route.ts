import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

type AuthRequest = { action?: "send-code" | "verify-code" | "verify-password"; code?: string; password?: string };

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  const response = await agentFetch("/v1/health", "GET");
  const data = await response.json();
  return Response.json({ ...data, status: data.authorized ? "authorized" : "idle" }, { status: response.status });
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  const body = await request.json() as AuthRequest;
  const paths = { "send-code": "/v1/auth/send-code", "verify-code": "/v1/auth/verify-code", "verify-password": "/v1/auth/verify-password" } as const;
  if (!body.action || !paths[body.action]) return Response.json({ message: "Geçersiz doğrulama işlemi." }, { status: 400 });
  const response = await agentFetch(paths[body.action], "POST", body.action === "verify-code" ? { code: body.code } : body.action === "verify-password" ? { password: body.password } : undefined);
  const data = await response.json();
  return Response.json(data, { status: response.status });
}

async function agentFetch(path: string, method = "POST", body?: unknown) {
  if (!env.MAC_AGENT_URL || !env.MAC_AGENT_TOKEN) return Response.json({ message: "Mac mini bağlantısı henüz ayarlanmadı." }, { status: 503 });
  return fetch(`${env.MAC_AGENT_URL.replace(/\/$/, "")}${path}`, { method, headers: { authorization: `Bearer ${env.MAC_AGENT_TOKEN}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
