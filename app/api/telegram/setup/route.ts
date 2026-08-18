import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const runtime = "edge";

type SetupPayload = { apiId?: string; apiHash?: string; phone?: string };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Güvenli kayıt alanı henüz hazır değil." }, { status: 503 });
  const saved = await env.DB.prepare("SELECT api_id, phone_hint FROM telegram_secrets WHERE owner_id = ?").bind(user.userId).first<{ api_id: string; phone_hint: string }>();
  return Response.json({ configured: Boolean(saved), apiId: saved?.api_id ?? null, phoneHint: saved?.phone_hint ?? null });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ message: "Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin." }, { status: 401 });
  if (!env.DB) return Response.json({ message: "Güvenli kayıt alanı henüz hazır değil." }, { status: 503 });

  const body = await request.json() as SetupPayload;
  const apiId = body.apiId?.trim() ?? "";
  const apiHash = body.apiHash?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  if (!/^\d{4,12}$/.test(apiId) || !/^[a-fA-F0-9]{32}$/.test(apiHash) || phone.length < 7) {
    return Response.json({ message: "Girdiğiniz API bilgilerini ve telefon numarasını kontrol edin." }, { status: 400 });
  }
  if (!env.MAC_AGENT_URL || !env.MAC_AGENT_TOKEN) {
    return Response.json({ message: "Mac mini bağlantısı henüz ayarlanmadı. Kurulum adımlarını tamamlayın." }, { status: 503 });
  }

  try {
    const agentResponse = await fetch(`${env.MAC_AGENT_URL?.replace(/\/$/, "")}/v1/setup`, { method: "POST", headers: { authorization: `Bearer ${env.MAC_AGENT_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ api_id: Number(apiId), api_hash: apiHash, phone }) });
    if (!agentResponse.ok) {
      const agentData = await agentResponse.json().catch(() => null) as { detail?: string } | null;
      return Response.json({ message: agentData?.detail || "Mac mini bağlantısına kaydedilemedi." }, { status: agentResponse.status });
    }
    const encryptedApiHash = await encrypt(apiHash);
    const phoneHint = phone.length > 4 ? `${phone.slice(0, 3)}••••${phone.slice(-2)}` : "••••";
    await env.DB.prepare(`INSERT INTO telegram_secrets (owner_id, api_id, encrypted_api_hash, encrypted_session, phone_hint)
      VALUES (?, ?, ?, '', ?)
      ON CONFLICT(owner_id) DO UPDATE SET api_id = excluded.api_id, encrypted_api_hash = excluded.encrypted_api_hash, phone_hint = excluded.phone_hint`)
      .bind(user.userId, apiId, encryptedApiHash, phoneHint)
      .run();
    return Response.json({ message: "Bilgileriniz Mac mini ve güvenli kayıt alanında şifreli olarak kaydedildi." });
  } catch (error) {
    console.error("Telegram setup save failed", error);
    return Response.json({ message: "Bilgiler güvenli kayıt alanına yazılamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
}

async function encrypt(value: string) {
  const secret = env.TELEGRAM_ENCRYPTION_KEY;
  if (!secret) throw new Error("TELEGRAM_ENCRYPTION_KEY is missing");
  const key = await crypto.subtle.importKey("raw", base64ToBytes(secret), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
function bytesToBase64(value: Uint8Array) { return btoa(String.fromCharCode(...value)); }
