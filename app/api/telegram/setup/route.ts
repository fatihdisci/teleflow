import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

export const runtime = "edge";

type SetupPayload = { apiId?: string; apiHash?: string; phone?: string };

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

  try {
    const encryptedApiHash = await encrypt(apiHash);
    const phoneHint = phone.length > 4 ? `${phone.slice(0, 3)}••••${phone.slice(-2)}` : "••••";
    await env.DB.prepare(`INSERT INTO telegram_secrets (owner_id, api_id, encrypted_api_hash, encrypted_session, phone_hint)
      VALUES (?, ?, ?, '', ?)
      ON CONFLICT(owner_id) DO UPDATE SET api_id = excluded.api_id, encrypted_api_hash = excluded.encrypted_api_hash, phone_hint = excluded.phone_hint`)
      .bind(user.userId, apiId, encryptedApiHash, phoneHint)
      .run();
    return Response.json({ message: "Bilgileriniz şifreli olarak kaydedildi." });
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
