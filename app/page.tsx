"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Command = { id: number; text: string };
type Template = { id: number; name: string; bot: string; commands: Command[] };
type Message = { id: number; command: string; text: string; time: string; imageUrl?: string };

const b0ptCommands: Command[] = [
  "/derinlik", "/akd", "/islem", "/teorik", "/takas", "/grafik", "/sirketkarti", "/detay", "/tum",
  "/piyasayd", "/kurum", "/doviz", "/halkaarz", "/viop", "/teminat", "/bulten", "/tlref", "/cds",
].map((text, index) => ({ id: 100 + index, text }));

const freeDepthCommands: Command[] = ["/derinlik", "/akd", "/takas", "/teorik", "/kurum"].map((text, index) => ({ id: 300 + index, text }));

const starter: Template[] = [
  { id: 1, name: "B0PT · Hisse ve piyasa", bot: "@b0pt_bot", commands: b0ptCommands },
  { id: 2, name: "Gün sonu özeti", bot: "@BOT_KULLANICI_ADI", commands: [{ id: 21, text: "/ozet" }] },
  { id: 3, name: "Ücretsiz derinlik", bot: "@ucretsizderinlikbot", commands: freeDepthCommands },
];

function mergeBuiltInPresets(items: Template[]) {
  return items.some((template) => template.bot.toLowerCase() === "@ucretsizderinlikbot")
    ? items
    : [...items, starter[2]];
}

const TELEFLOW_STORAGE_KEY = "teleflow.local.v2";

type StoredState = {
  templates?: Template[];
  selectedId?: number;
  interval?: number;
  botUsername?: string;
  commandArguments?: Record<number, string>;
  messages?: Message[];
};

export default function Home() {
  const [tab, setTab] = useState<"flows" | "templates" | "settings">("flows");
  const [templates, setTemplates] = useState(starter);
  const [selectedId, setSelectedId] = useState(1);
  const [interval, setInterval] = useState(4);
  const [newCommand, setNewCommand] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [botUsername, setBotUsername] = useState("@b0pt_bot");
  const [commandArguments, setCommandArguments] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"idle" | "running" | "paused">("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [authPhase, setAuthPhase] = useState<"idle" | "code_required" | "password_required" | "authorized">("idle");
  const [savedSetup, setSavedSetup] = useState<{ apiId: string; phoneHint: string } | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const runMessageAnchor = useRef(0);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const statusText = useMemo(() => ({ idle: "Hazır", running: "Çalışıyor", paused: "Duraklatıldı" }[status]), [status]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TELEFLOW_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as StoredState;
        if (saved.templates?.length) setTemplates(mergeBuiltInPresets(saved.templates));
        if (saved.selectedId) setSelectedId(saved.selectedId);
        if (typeof saved.interval === "number") setInterval(saved.interval);
        if (saved.botUsername) setBotUsername(saved.botUsername);
        if (saved.commandArguments) setCommandArguments(saved.commandArguments);
        if (saved.messages) setMessages(saved.messages);
      }
    } catch {
      // Bozuk veya engellenmiş tarayıcı depolaması uygulamayı durdurmamalı.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(TELEFLOW_STORAGE_KEY, JSON.stringify({ templates, selectedId, interval, botUsername, commandArguments, messages } satisfies StoredState));
    } catch {
      setNotice("Tarayıcı depolaması kullanılamıyor; şablonlar bu oturumla sınırlı kalabilir.");
    }
  }, [storageReady, templates, selectedId, interval, botUsername, commandArguments, messages]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/flows").then((response) => response.ok ? response.json() : null).then((data: { templates?: Template[] } | null) => {
      if (cancelled || !data?.templates?.length) return;
      const next = mergeBuiltInPresets(data.templates);
      setTemplates(next);
      setSelectedId(next[0]?.id ?? 0);
      setBotUsername(next[0]?.bot ?? "@b0pt_bot");
    }).catch(() => undefined).finally(() => { if (!cancelled) setRemoteReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!remoteReady) return;
    const timer = window.setTimeout(() => {
      fetch("/api/flows", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ templates }) }).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [remoteReady, templates]);

  useEffect(() => { fetch("/api/telegram/setup").then((response) => response.ok ? response.json() : null).then((data: { configured?: boolean; apiId?: string; phoneHint?: string } | null) => { if (data?.configured && data.apiId && data.phoneHint) setSavedSetup({ apiId: data.apiId, phoneHint: data.phoneHint }); }).catch(() => undefined); fetch("/api/telegram/auth").then((response) => response.ok ? response.json() : null).then((data: { status?: "authorized" | "idle" } | null) => { if (data?.status) setAuthPhase(data.status); }).catch(() => undefined); }, []);

  function addCommand() { const value = newCommand.trim(); if (!value || !selected) return; updateSelected({ ...selected, commands: [...selected.commands, { id: Date.now(), text: value.startsWith("/") ? value : `/${value}` }] }); setNewCommand(""); }
  function updateSelected(next: Template) { setTemplates((items) => items.map((item) => item.id === next.id ? next : item)); }
  function addTemplate() { const name = newTemplate.trim(); if (!name) return; const next = { id: Date.now(), name, bot: "@BOT_KULLANICI_ADI", commands: [] }; setTemplates((items) => [...items, next]); setSelectedId(next.id); setNewTemplate(""); }
  async function run() { if (!selected?.commands.length) { setNotice("Önce en az bir komut ekleyin."); return; } const commands = selected.commands.map((command) => `${command.text}${commandArguments[command.id]?.trim() ? ` ${commandArguments[command.id].trim()}` : ""}`); runMessageAnchor.current = messages.length; setNotice(""); setStatus("running"); try { const response = await fetch("/api/telegram/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ botUsername, commands, intervalSeconds: interval }) }); const data = await response.json() as { id?: string; message?: string }; if (!response.ok || !data.id) throw new Error(data.message || "Akış başlatılamadı."); pollRun(data.id); } catch (error) { setStatus("idle"); setNotice(error instanceof Error ? error.message : "Akış başlatılamadı."); } }
  async function pollRun(id: string) { try { const response = await fetch(`/api/telegram/run?id=${encodeURIComponent(id)}`); const data = await response.json() as { status?: string; error?: string; wait_seconds?: number; responses?: Array<{ command: string; text: string; media_url?: string | null }> }; if (!response.ok) throw new Error(data.error || "Akış durumu alınamadı."); if (data.responses) setMessages((previous) => [...previous.slice(0, runMessageAnchor.current), ...data.responses!.map((item, index) => ({ id: runMessageAnchor.current + index + 1, command: item.command, text: item.text || "Medya yanıtı", imageUrl: item.media_url ?? undefined, time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) }))]); if (data.status === "completed") { setStatus("idle"); return; } if (data.status === "failed") { setStatus("idle"); setNotice(data.error || "Telegram akışı başarısız oldu."); return; } if (data.status === "waiting_flood") setNotice(`Telegram yoğunluk sınırı: ${data.wait_seconds ?? 0} saniye bekleniyor.`); window.setTimeout(() => pollRun(id), 2000); } catch (error) { setStatus("idle"); setNotice(error instanceof Error ? error.message : "Akış durumu alınamadı."); } }
  async function saveSetup() { if (!apiId || !apiHash || !phone) { setNotice("api_id, api_hash ve telefon numarası zorunludur."); return; } setSaving(true); setNotice(""); try { const response = await fetch("/api/telegram/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiId, apiHash, phone }) }); const data = await response.json() as { message?: string; status?: "authorized" }; if (!response.ok) throw new Error(data.message); if (data.status) setAuthPhase(data.status); setApiHash(""); setSavedSetup({ apiId, phoneHint: `${phone.slice(0, 3)}••••${phone.slice(-2)}` }); setStep(3); setNotice(data.status === "authorized" ? "Telegram bağlantısı zaten kayıtlı; tekrar onay gerekmez." : "Bilgileriniz şifreli olarak kaydedildi."); } catch (error) { setNotice(error instanceof Error ? error.message : "Kayıt başarısız oldu."); } finally { setSaving(false); } }
  async function authenticate(action: "send-code" | "verify-code" | "verify-password") { setSaving(true); setNotice(""); try { const response = await fetch("/api/telegram/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, code: verificationCode, password: twoFactorPassword }) }); const data = await response.json() as { status?: "code_required" | "password_required" | "authorized"; message?: string; detail?: string }; if (!response.ok) throw new Error(data.message || data.detail || "Telegram doğrulanamadı."); if (data.status) setAuthPhase(data.status); setNotice(data.status === "authorized" ? "Telegram hesabı bağlandı." : data.status === "password_required" ? "İki aşamalı doğrulama parolanızı girin." : "Doğrulama kodu Telegram uygulamanıza gönderildi."); } catch (error) { setNotice(error instanceof Error ? error.message : "Telegram doğrulanamadı."); } finally { setSaving(false); } }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">T</div><div><strong>Teleflow</strong><span>Telegram komut akışları</span></div></div><div className="top-actions"><div className="connection-pill"><i /> {savedSetup ? "API bilgileri kaydedildi" : "Telegram bağlı değil"}</div><button className="avatar">FD</button></div></header>
    <div className="workspace"><aside className="sidebar"><div className="sidebar-label">ÇALIŞMA ALANI</div><Nav icon="⌁" label="Akışlar" active={tab === "flows"} onClick={() => setTab("flows")} /><Nav icon="▤" label="Şablonlar" active={tab === "templates"} onClick={() => setTab("templates")} /><Nav icon="⚙" label="Ayarlar" active={tab === "settings"} onClick={() => setTab("settings")} /><div className="sidebar-bottom"><div className="mini-card"><span className="shield">✓</span><div><strong>Güvenli alan</strong><small>Sırlar sunucuda şifreli</small></div></div></div></aside>
      <section className="content">{tab === "flows" && <Flows template={selected} botUsername={botUsername} setBotUsername={setBotUsername} interval={interval} status={status} statusText={statusText} commands={selected?.commands ?? []} commandArguments={commandArguments} setCommandArguments={setCommandArguments} messages={messages} newCommand={newCommand} setNewCommand={setNewCommand} onAddCommand={addCommand} onDelete={(id) => selected && updateSelected({ ...selected, commands: selected.commands.filter((command) => command.id !== id) })} onRun={run} onPause={() => setStatus("paused")} onCancel={() => setStatus("idle")} />}{tab === "templates" && <Templates templates={templates} selectedId={selectedId} newTemplate={newTemplate} setNewTemplate={setNewTemplate} onAdd={addTemplate} onOpen={(id) => { setSelectedId(id); setBotUsername(templates.find((item) => item.id === id)?.bot ?? botUsername); setTab("flows"); }} onDelete={(id) => { setTemplates((items) => items.filter((item) => item.id !== id)); fetch(`/api/flows?id=${id}`, { method: "DELETE" }).catch(() => undefined); if (id === selectedId) setSelectedId(templates.find((item) => item.id !== id)?.id ?? 0); }} />}{tab === "settings" && <Settings interval={interval} setInterval={setInterval} botUsername={botUsername} setBotUsername={setBotUsername} savedSetup={savedSetup} onSetup={() => { setStep(savedSetup ? 3 : 1); setNotice(""); setSetupOpen(true); }} />}</section>
      <aside className="setup-panel"><div className="panel-kicker">✦ {savedSetup ? "KAYITLI KURULUM" : "İLK KURULUM"}</div><h2>{savedSetup ? "Bilgiler kaydedildi" : "Telegram hesabını bağla"}</h2><p>{savedSetup ? `${savedSetup.phoneHint} için API bilgileri sunucuda şifreli saklanıyor.` : "Bot tokenı gerekmez. Kişisel Telegram hesabınızı güvenli biçimde bağlayın."}</p><div className="secure-note"><span>⌘</span><div><strong>Güvenli saklama</strong><small>Gizli bilgiler tarayıcıya geri dönmez.</small></div></div><button className="setup-button" onClick={() => { setStep(savedSetup ? 3 : 1); setNotice(""); setSetupOpen(true); }}>{savedSetup ? "Kurulumu yönet" : "Kurulumu başlat"} <span>→</span></button></aside>
    </div><footer><span>Teleflow · Kullanıcı API’si ile çalışır</span><span>Gizlilik · Güvenlik · Yardım</span></footer>
    {setupOpen && <div className="modal-backdrop" onClick={() => setSetupOpen(false)}><div className="setup-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSetupOpen(false)}>×</button><div className="modal-icon">T</div><div className="eyebrow">GÜVENLİ KURULUM · ADIM {step}/3</div><h2>{step === 1 ? "Telegram API bilgileri" : step === 2 ? "Telefon numarası" : "Telegram doğrulaması"}</h2><p>{step === 1 ? "my.telegram.org üzerindeki API development tools bölümünden aldığınız bilgileri girin." : step === 2 ? "Telefon numaranızı ülke koduyla girin." : savedSetup ? `${savedSetup.phoneHint} için bilgiler Mac mini üzerinde şifreli saklanıyor.` : "Önce API bilgilerini kaydedin."}</p>{step === 1 && <div className="form-grid"><label>api_id<input value={apiId} onChange={(event) => setApiId(event.target.value)} placeholder="12345678" /></label><label>api_hash<input type="password" value={apiHash} onChange={(event) => setApiHash(event.target.value)} placeholder="32 karakter" /></label></div>}{step === 2 && <label>Telefon numarası<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" /></label>}{step === 3 && savedSetup && <div>{authPhase === "idle" && <button className="primary-button" disabled={saving} onClick={() => authenticate("send-code")}>Telegram kodu gönder</button>}{authPhase === "code_required" && <><label>Doğrulama kodu<input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="Telegram’dan gelen kod" /></label><button className="primary-button" disabled={saving} onClick={() => authenticate("verify-code")} style={{ marginTop: 12 }}>Kodu doğrula</button></>}{authPhase === "password_required" && <><label>İki aşamalı doğrulama parolası<input type="password" value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} placeholder="Parolanız" /></label><button className="primary-button" disabled={saving} onClick={() => authenticate("verify-password")} style={{ marginTop: 12 }}>Parolayı doğrula</button></>}{authPhase === "authorized" && <p className="save-message saved">Telegram hesabı bağlı. Akışları başlatabilirsiniz.</p>}</div>}{notice && <p className="save-message error">{notice}</p>}<div className="modal-actions"><button className="secondary-button" onClick={() => setSetupOpen(false)}>Kapat</button>{step < 3 && <button className="primary-button" disabled={saving} onClick={() => step === 1 ? setStep(2) : saveSetup()}>{step === 1 ? "Devam et" : saving ? "Kaydediliyor…" : "Güvenle kaydet"}</button>}{step === 3 && <button className="secondary-button" onClick={() => { setAuthPhase("idle"); setStep(1); }}>Bilgileri değiştir</button>}</div></div></div>}
  </main>;
}

function Nav({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{label}</button>; }

function createChartPreview(label: string) {
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 680;
  const context = canvas.getContext("2d"); if (!context) return "";
  context.fillStyle = "#f7f9fc"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#172b4d"; context.font = "700 34px Arial"; context.fillText("B0PT · Görsel Yanıt", 58, 72);
  context.fillStyle = "#64738c"; context.font = "24px Arial"; context.fillText(label, 58, 112);
  context.strokeStyle = "#dce4ee"; context.lineWidth = 2; for (let y = 170; y < 620; y += 75) { context.beginPath(); context.moveTo(58, y); context.lineTo(1140, y); context.stroke(); }
  const points = [520, 470, 500, 410, 440, 350, 380, 300, 320, 245]; context.strokeStyle = "#2f6df6"; context.lineWidth = 8; context.beginPath(); points.forEach((y, index) => index ? context.lineTo(95 + index * 108, y) : context.moveTo(95, y)); context.stroke();
  points.forEach((y, index) => { context.fillStyle = index % 2 ? "#29aa78" : "#f15d5d"; context.fillRect(78 + index * 108, y - 38, 34, 76); });
  context.fillStyle = "#28aa79"; context.font = "700 32px Arial"; context.fillText("Örnek görsel yanıt", 58, 642);
  return canvas.toDataURL("image/png");
}

async function copyImage(url: string) { const blob = await (await fetch(url)).blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); }
async function downloadImage(url: string, fileName: string) { const blob = await (await fetch(url)).blob(); const objectUrl = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = objectUrl; link.download = fileName; link.click(); URL.revokeObjectURL(objectUrl); }
async function combineImages(messages: Message[]) { const loaded = await Promise.all(messages.map(async (message) => { const image = new Image(); image.src = message.imageUrl!; await image.decode(); return image; })); const width = Math.max(...loaded.map((image) => image.width)); const height = loaded.reduce((total, image) => total + Math.round(image.height * width / image.width) + 32, 32); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) return; context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); let y = 16; loaded.forEach((image) => { const scaledHeight = Math.round(image.height * width / image.width); context.drawImage(image, 0, y, width, scaledHeight); y += scaledHeight + 32; }); await downloadImage(canvas.toDataURL("image/png"), "b0pt-tum-gorsel-yanitlar.png"); }
function safeFileName(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "telegram-yanit"; }
function Flows({ template, botUsername, setBotUsername, commands, commandArguments, setCommandArguments, interval, status, statusText, messages, newCommand, setNewCommand, onAddCommand, onDelete, onRun, onPause, onCancel }: { template: Template | undefined; botUsername: string; setBotUsername: (value: string) => void; commands: Command[]; commandArguments: Record<number, string>; setCommandArguments: (value: Record<number, string>) => void; interval: number; status: string; statusText: string; messages: Message[]; newCommand: string; setNewCommand: (value: string) => void; onAddCommand: () => void; onDelete: (id: number) => void; onRun: () => void; onPause: () => void; onCancel: () => void }) { const images = messages.filter((message) => message.imageUrl); return <><div className="content-head"><div><div className="eyebrow">AKIŞLAR</div><h1>{template?.name ?? "Şablon seçin"}</h1><p>Komutlarınız sırayla gönderilir; cevaplar altta görünür.</p></div></div><div className="flow-card"><div className="flow-card-head"><div className="flow-title"><span className="status-dot" /><div><strong>{template?.name}</strong><span>{botUsername} · {commands.length} komut</span></div></div><span className={`run-status ${status}`}>{statusText}</span></div><label style={{ display: "block", margin: "16px 0", fontSize: 11, color: "#71809a" }}>Bot kullanıcı adı<input list="bot-options" value={botUsername} onChange={(event) => setBotUsername(event.target.value)} placeholder="@kullanici_adi" style={{ display: "block", marginTop: 6, width: "100%", padding: 9, border: "1px solid #e5eaf2", borderRadius: 7 }} /><datalist id="bot-options"><option value="@b0pt_bot" /><option value="@BOT_KULLANICI_ADI" /></datalist></label><div className="command-list">{commands.map((command, index) => <div className="command-row" key={command.id}><span className="command-number">{index + 1}</span><code>{command.text}</code><input aria-label={`${command.text} parametresi`} value={commandArguments[command.id] ?? ""} onChange={(event) => setCommandArguments({ ...commandArguments, [command.id]: event.target.value })} placeholder="Hisse kodu / parametre" style={{ width: 145, border: "1px solid #e5eaf2", borderRadius: 6, padding: 7, fontSize: 11 }} /><button className="delete-command" onClick={() => onDelete(command.id)}>×</button></div>)}</div><div className="add-command"><input value={newCommand} onChange={(event) => setNewCommand(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAddCommand()} placeholder="/teorik yeni_komut" /><button onClick={onAddCommand}>Ekle</button></div><div className="flow-actions"><button className="primary-button" onClick={onRun}>{status === "paused" ? "Devam et" : "▶ Akışı başlat"}</button><button className="control-button" onClick={onPause}>Ⅱ</button><button className="control-button danger" onClick={onCancel}>■</button></div></div><div className="section-head"><div><h2>Son yanıtlar</h2><span>Görselleri ayrı ayrı indirin ya da tek dosyada birleştirin.</span></div>{images.length > 1 && <button className="primary-button" onClick={() => combineImages(images)}>Tüm görselleri birleştir</button>}</div><div className="message-stack">{messages.length ? messages.map((message) => <article className="message-card" key={message.id}><div className="message-meta"><span className="telegram-icon">T</span><div><strong>Telegram botu</strong><span>{message.time} · {message.command}</span></div></div><p>{message.text}</p>{message.imageUrl && <><img src={message.imageUrl} alt={`${message.command} görsel yanıtı`} style={{ width: "100%", marginTop: 14, borderRadius: 8, border: "1px solid #e5eaf2" }} /><div className="flow-actions"><button className="soft-button" onClick={() => copyImage(message.imageUrl!)}>Görseli kopyala</button><button className="primary-button" onClick={() => downloadImage(message.imageUrl!, `${safeFileName(message.command)}.png`)}>İndir</button></div></>}</article>) : <article className="message-card"><p>Henüz yanıt yok. Akışı başlattığınızda yanıtlar burada listelenir.</p></article>}</div></>; }
function Templates({ templates, selectedId, newTemplate, setNewTemplate, onAdd, onOpen, onDelete }: { templates: Template[]; selectedId: number; newTemplate: string; setNewTemplate: (value: string) => void; onAdd: () => void; onOpen: (id: number) => void; onDelete: (id: number) => void }) { return <><div className="content-head"><div><div className="eyebrow">ŞABLONLAR</div><h1>Komut şablonları</h1><p>Tekrar kullanacağınız komut gruplarını yönetin.</p></div></div><div className="flow-card"><div className="add-command"><input value={newTemplate} onChange={(event) => setNewTemplate(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAdd()} placeholder="Yeni şablon adı" /><button onClick={onAdd}>Şablon oluştur</button></div>{templates.map((template) => <div className="command-row" key={template.id}><span className={`command-number ${template.id === selectedId ? "complete" : ""}`}>✓</span><div style={{ flex: 1 }}><strong>{template.name}</strong><div className="wait-label">{template.commands.length} komut · {template.bot}</div></div><button className="soft-button" onClick={() => onOpen(template.id)}>Aç</button><button className="delete-command" onClick={() => onDelete(template.id)}>×</button></div>)}</div></>; }
function Settings({ interval, setInterval, botUsername, setBotUsername, savedSetup, onSetup }: { interval: number; setInterval: (value: number) => void; botUsername: string; setBotUsername: (value: string) => void; savedSetup: { apiId: string; phoneHint: string } | null; onSetup: () => void }) { return <><div className="content-head"><div><div className="eyebrow">AYARLAR</div><h1>Akış ayarları</h1><p>Varsayılan gönderim hızını ve Telegram kurulumunu yönetin.</p></div></div><div className="flow-card"><label style={{ display: "block", fontSize: 13, fontWeight: 700 }}>Komutlar arası bekleme süresi<input style={{ display: "block", width: "100%", marginTop: 12, padding: 10, border: "1px solid #e5eaf2", borderRadius: 7 }} type="number" min="1" max="120" value={interval} onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))} /></label><p className="wait-label">Varsayılan: 4 saniye. Telegram yoğunluk hatalarında bekleme otomatik uzatılacaktır.</p></div><div className="flow-card" style={{ marginTop: 16 }}><label style={{ display: "block", fontSize: 13, fontWeight: 700 }}>Varsayılan bot<select value={botUsername} onChange={(event) => setBotUsername(event.target.value)} style={{ display: "block", width: "100%", marginTop: 12, padding: 10, border: "1px solid #e5eaf2", borderRadius: 7 }}><option value="@b0pt_bot">@b0pt_bot</option><option value="@BOT_KULLANICI_ADI">@BOT_KULLANICI_ADI</option></select></label></div><div className="flow-card" style={{ marginTop: 16 }}><strong>Telegram API bilgileri</strong><p className="wait-label">{savedSetup ? `${savedSetup.phoneHint} için kayıtlı` : "Henüz kayıtlı bilgi yok"}</p><button className="primary-button" onClick={onSetup}>{savedSetup ? "Bilgileri yönet" : "Kurulumu başlat"}</button></div></>; }
