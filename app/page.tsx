/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element -- storage hydration is intentional; Telegram media URLs must bypass image optimization */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Command = { id: number; text: string; argument?: string };
type Template = { id: number; name: string; bot: string; commands: Command[]; interval?: number };
type Message = { id: number; command: string; text: string; time: string; imageUrl?: string };
type ChatMessage = { id: number; bot: string; command: string; text: string; time: string; imageUrl?: string };

const b0ptCommands: Command[] = [
  "/derinlik", "/akd", "/islem", "/teorik", "/teorikyd", "/takas", "/grafik", "/sirketkarti", "/detay", "/tum",
  "/piyasayd", "/kurum", "/doviz", "/halkaarz", "/viop", "/teminat", "/bulten", "/tlref", "/cds",
].map((text, index) => ({ id: 100 + index, text }));

const freeDepthCommands: Command[] = ["/derinlik", "/akd", "/takas", "/teorik", "/kurum"].map((text, index) => ({ id: 300 + index, text }));
const stockCommentCommands: Command[] = ["/stop", "/ta", "/yorum", "/sinyal", "/grafik", "/plus", "/zincir", "/takasrapor", "/detay", "/canli", "/akd", "/takas", "/sepet", "/temel", "/hedef", "/ortavadede", "/trend"].map((text, index) => ({ id: 400 + index, text }));
const ipoTheoreticalCommands: Command[] = ["karcl", "quick", "meten", "masfn", "sarae", "citas", "isvea", "veyas", "tknka", "kpeks"].map((argument, index) => ({ id: 500 + index, text: "/teorik", argument }));
const attentionStockCodes = ["sasa", "sise", "thyao", "gundg", "ozatd", "asels", "tuprs", "tralt", "astor", "bimas"];
const attentionCommands = (offset: number) => attentionStockCodes.map((argument, index) => ({ id: offset + index, text: "/teorik", argument }));
const botCatalog = [
  { bot: "@b0pt_bot", label: "B0PT", commands: b0ptCommands },
  { bot: "@ucretsizderinlikbot", label: "Ücretsiz Derinlik", commands: freeDepthCommands },
  { bot: "@hisseyorumbot", label: "Hisse Yorum", commands: stockCommentCommands },
];

const starter: Template[] = [
  { id: 1, name: "Gün sonu özeti", bot: "@BOT_KULLANICI_ADI", commands: [{ id: 21, text: "/ozet" }] },
  { id: 5, name: "Son halka arzlar teorik (UDB)", bot: "@ucretsizderinlikbot", commands: ipoTheoreticalCommands },
  { id: 6, name: "Son halka arzlar teorik (BOPT)", bot: "@b0pt_bot", commands: ipoTheoreticalCommands.map((command) => ({ ...command, id: command.id + 100 })) },
  { id: 7, name: "Dikkat çekenler (BOPT)", bot: "@b0pt_bot", commands: attentionCommands(700) },
  { id: 8, name: "Dikkat çekenler (UDB)", bot: "@ucretsizderinlikbot", commands: attentionCommands(800) },
];

const retiredTemplateNames = new Set(["B0PT · Hisse ve piyasa", "Ücretsiz derinlik", "Hisse yorumları"]);

function mergeBuiltInPresets(items: Template[]) {
  const next = items.filter((template) => !retiredTemplateNames.has(template.name));
  for (const preset of starter) {
    const existingIndex = next.findIndex((template) => template.name === preset.name);
    if (existingIndex < 0) {
      next.push(preset);
      continue;
    }
    // Yerleşik şablonları yeni komutlarla yükseltirken sunucudaki kalıcı kimliği koru.
    next[existingIndex] = { ...preset, id: next[existingIndex].id, interval: next[existingIndex].interval };
  }
  return next;
}

const TELEFLOW_STORAGE_KEY = "teleflow.local.v2";

type StoredState = {
  templates?: Template[];
  selectedId?: number;
  interval?: number;
  botUsername?: string;
  commandArguments?: Record<number, string>;
  messages?: Message[];
  messageHistory?: Record<number, Message[]>;
};

export default function Home() {
  const [tab, setTab] = useState<"flows" | "templates" | "chat" | "settings">("flows");
  const [templates, setTemplates] = useState(starter);
  const [selectedId, setSelectedId] = useState(1);
  const [interval, setInterval] = useState(4);
  const [newCommand, setNewCommand] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [botUsername, setBotUsername] = useState("@b0pt_bot");
  const [commandArguments, setCommandArguments] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"idle" | "running" | "paused">("idle");
  const [messageHistory, setMessageHistory] = useState<Record<number, Message[]>>({});
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
  const [chatBot, setChatBot] = useState(botCatalog[0].bot);
  const [chatCommand, setChatCommand] = useState(botCatalog[0].commands[0].text);
  const [chatArgument, setChatArgument] = useState("");
  const [chatQueue, setChatQueue] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const runMessageAnchor = useRef(0);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const messages = messageHistory[selectedId] ?? [];
  function setMessages(next: Message[] | ((previous: Message[]) => Message[])) {
    setMessageHistory((history) => {
      const previous = history[selectedId] ?? [];
      const value = typeof next === "function" ? next(previous) : next;
      return { ...history, [selectedId]: value };
    });
  }
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
        if (saved.messageHistory) setMessageHistory(saved.messageHistory);
        else if (saved.messages) setMessageHistory({ [saved.selectedId ?? 1]: saved.messages });
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
      window.localStorage.setItem(TELEFLOW_STORAGE_KEY, JSON.stringify({ templates, selectedId, interval, botUsername, commandArguments, messageHistory } satisfies StoredState));
    } catch {
      setNotice("Tarayıcı depolaması kullanılamıyor; şablonlar bu oturumla sınırlı kalabilir.");
    }
  }, [storageReady, templates, selectedId, interval, botUsername, commandArguments, messageHistory]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/flows").then((response) => response.ok ? response.json() : null).then(async (data: { templates?: Template[] } | null) => {
      if (cancelled || !data?.templates?.length) return;
      const retired = data.templates.filter((template) => retiredTemplateNames.has(template.name));
      await Promise.all(retired.map((template) => fetch(`/api/flows?id=${template.id}`, { method: "DELETE" }).catch(() => undefined)));
      const next = mergeBuiltInPresets(data.templates);
      setTemplates(next);
      setSelectedId(next[0]?.id ?? 0);
      setBotUsername(next[0]?.bot ?? "@b0pt_bot");
      if (typeof next[0]?.interval === "number") setInterval(next[0].interval);
    }).catch(() => undefined).finally(() => { if (!cancelled) setRemoteReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!remoteReady) return;
    const timer = window.setTimeout(() => {
      fetch("/api/flows", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ templates: templates.map((template) => ({ ...template, interval })) }) }).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [remoteReady, templates, interval]);

  useEffect(() => { fetch("/api/telegram/setup").then((response) => response.ok ? response.json() : null).then((data: { configured?: boolean; apiId?: string; phoneHint?: string } | null) => { if (data?.configured && data.apiId && data.phoneHint) setSavedSetup({ apiId: data.apiId, phoneHint: data.phoneHint }); }).catch(() => undefined); fetch("/api/telegram/auth").then((response) => response.ok ? response.json() : null).then((data: { status?: "authorized" | "idle" } | null) => { if (data?.status) setAuthPhase(data.status); }).catch(() => undefined); }, []);

  useEffect(() => { fetch("/api/chat-history").then((response) => response.ok ? response.json() : null).then((data: { items?: Array<{ id: number; command: string; responseText: string; responseKind: string; createdAt: string }> } | null) => { if (!data?.items) return; setChatMessages(data.items.reverse().map((item) => { const separator = item.command.indexOf(" · "); return { id: item.id, bot: separator >= 0 ? item.command.slice(0, separator) : "Telegram botu", command: separator >= 0 ? item.command.slice(separator + 3) : item.command, text: item.responseText, time: new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) }; })); }).catch(() => undefined); }, []);

  function addCommand() { const value = newCommand.trim(); if (!value || !selected) return; updateSelected({ ...selected, commands: [...selected.commands, { id: Date.now(), text: value.startsWith("/") ? value : `/${value}` }] }); setNewCommand(""); }
  function updateSelected(next: Template) { setTemplates((items) => items.map((item) => item.id === next.id ? next : item)); }
  function addTemplate() { const name = newTemplate.trim(); if (!name) return; const next = { id: Date.now(), name, bot: "@BOT_KULLANICI_ADI", commands: [] }; setTemplates((items) => [...items, next]); setSelectedId(next.id); setNewTemplate(""); }
  async function run() { if (!selected?.commands.length) { setNotice("Önce en az bir komut ekleyin."); return; } const commands = selected.commands.map((command) => `${command.text}${commandArguments[command.id]?.trim() || command.argument?.trim() ? ` ${commandArguments[command.id]?.trim() || command.argument?.trim()}` : ""}`); runMessageAnchor.current = messages.length; setNotice(""); setStatus("running"); try { const response = await fetch("/api/telegram/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ botUsername, commands, intervalSeconds: interval }) }); const data = await response.json() as { id?: string; message?: string }; if (!response.ok || !data.id) throw new Error(data.message || "Akış başlatılamadı."); pollRun(data.id); } catch (error) { setStatus("idle"); setNotice(error instanceof Error ? error.message : "Akış başlatılamadı."); } }
  async function pollRun(id: string) { try { const response = await fetch(`/api/telegram/run?id=${encodeURIComponent(id)}`); const data = await response.json() as { status?: string; error?: string; wait_seconds?: number; responses?: Array<{ command: string; text: string; media_url?: string | null }> }; if (!response.ok) throw new Error(data.error || "Akış durumu alınamadı."); if (data.responses) setMessages((previous) => [...previous.slice(0, runMessageAnchor.current), ...data.responses!.map((item, index) => ({ id: runMessageAnchor.current + index + 1, command: item.command, text: item.text || "Medya yanıtı", imageUrl: item.media_url ?? undefined, time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) }))]); if (data.status === "completed") { setStatus("idle"); return; } if (data.status === "failed") { setStatus("idle"); setNotice(data.error || "Telegram akışı başarısız oldu."); return; } if (data.status === "waiting_flood") setNotice(`Telegram yoğunluk sınırı: ${data.wait_seconds ?? 0} saniye bekleniyor.`); window.setTimeout(() => pollRun(id), 2000); } catch (error) { setStatus("idle"); setNotice(error instanceof Error ? error.message : "Akış durumu alınamadı."); } }
  function selectChatBot(value: string) { const catalog = botCatalog.find((item) => item.bot === value) ?? botCatalog[0]; setChatBot(catalog.bot); setChatCommand(catalog.commands[0].text); setChatArgument(""); }
  function addChatCommand() { const command = `${chatCommand}${chatArgument.trim() ? ` ${chatArgument.trim()}` : ""}`; setChatQueue((items) => [...items, command]); setChatArgument(""); }
  async function waitForRun(id: string): Promise<Array<{ command: string; text: string; media_url?: string | null }>> { const response = await fetch(`/api/telegram/run?id=${encodeURIComponent(id)}`); const data = await response.json() as { status?: string; error?: string; responses?: Array<{ command: string; text: string; media_url?: string | null }> }; if (!response.ok || data.status === "failed") throw new Error(data.error || "Mesaj gönderilemedi."); if (data.status === "completed") return data.responses ?? []; await new Promise((resolve) => window.setTimeout(resolve, 1500)); return waitForRun(id); }
  async function sendChat() { const commands = chatQueue.length ? chatQueue : [`${chatCommand}${chatArgument.trim() ? ` ${chatArgument.trim()}` : ""}`]; if (!commands[0]) return; setChatSending(true); setChatQueue([]); setNotice(""); try { const response = await fetch("/api/telegram/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ botUsername: chatBot, commands, intervalSeconds: interval }) }); const data = await response.json() as { id?: string; message?: string }; if (!response.ok || !data.id) throw new Error(data.message || "Mesaj gönderilemedi."); const responses = await waitForRun(data.id); const additions = responses.map((item, index) => ({ id: Date.now() + index, bot: chatBot, command: item.command, text: item.text || "Medya yanıtı", imageUrl: item.media_url ?? undefined, time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) })); setChatMessages((items) => [...items, ...additions]); await fetch("/api/chat-history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: additions.map((item) => ({ bot: item.bot, command: item.command, responseText: item.text, responseKind: item.imageUrl ? "image" : "text", status: "received" })) }) }); } catch (error) { setNotice(error instanceof Error ? error.message : "Mesaj gönderilemedi."); } finally { setChatSending(false); } }
  async function saveSetup() { if (!apiId || !apiHash || !phone) { setNotice("api_id, api_hash ve telefon numarası zorunludur."); return; } setSaving(true); setNotice(""); try { const response = await fetch("/api/telegram/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiId, apiHash, phone }) }); const data = await response.json() as { message?: string; status?: "authorized" }; if (!response.ok) throw new Error(data.message); if (data.status) setAuthPhase(data.status); setApiHash(""); setSavedSetup({ apiId, phoneHint: `${phone.slice(0, 3)}••••${phone.slice(-2)}` }); setStep(3); setNotice(data.status === "authorized" ? "Telegram bağlantısı zaten kayıtlı; tekrar onay gerekmez." : "Bilgileriniz şifreli olarak kaydedildi."); } catch (error) { setNotice(error instanceof Error ? error.message : "Kayıt başarısız oldu."); } finally { setSaving(false); } }
  async function authenticate(action: "send-code" | "verify-code" | "verify-password") { setSaving(true); setNotice(""); try { const response = await fetch("/api/telegram/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, code: verificationCode, password: twoFactorPassword }) }); const data = await response.json() as { status?: "code_required" | "password_required" | "authorized"; message?: string; detail?: string }; if (!response.ok) throw new Error(data.message || data.detail || "Telegram doğrulanamadı."); if (data.status) setAuthPhase(data.status); setNotice(data.status === "authorized" ? "Telegram hesabı bağlandı." : data.status === "password_required" ? "İki aşamalı doğrulama parolanızı girin." : "Doğrulama kodu Telegram uygulamanıza gönderildi."); } catch (error) { setNotice(error instanceof Error ? error.message : "Telegram doğrulanamadı."); } finally { setSaving(false); } }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark" aria-hidden="true">T</div><div><strong>Teleflow</strong><span>Telegram komut merkezi</span></div></div><div className="top-actions"><div className={`connection-pill ${savedSetup ? "connected" : ""}`}><i /> {savedSetup ? "Telegram hazır" : "Kurulum bekliyor"}</div><button className="avatar" aria-label="Profil">FD</button></div></header>
    <div className="workspace"><aside className="sidebar" aria-label="Ana menü"><div className="sidebar-label">ÇALIŞMA ALANI</div><Nav icon="⌁" label="Akışlar" active={tab === "flows"} onClick={() => setTab("flows")} /><Nav icon="◉" label="Mesajlar" active={tab === "chat"} onClick={() => setTab("chat")} /><Nav icon="▤" label="Şablonlar" active={tab === "templates"} onClick={() => setTab("templates")} /><Nav icon="⚙" label="Ayarlar" active={tab === "settings"} onClick={() => setTab("settings")} /><div className="sidebar-bottom"><div className="mini-card"><span className="shield">✓</span><div><strong>Güvenli çalışma alanı</strong><small>Kimlik bilgileri şifreli saklanır</small></div></div></div></aside>
      <section className="content">{tab === "flows" && <Flows template={selected} botUsername={botUsername} setBotUsername={setBotUsername} interval={interval} status={status} statusText={statusText} commands={selected?.commands ?? []} commandArguments={commandArguments} onArgumentChange={(id, value) => { setCommandArguments({ ...commandArguments, [id]: value }); if (selected) updateSelected({ ...selected, commands: selected.commands.map((command) => command.id === id ? { ...command, argument: value } : command) }); }} messages={messages} newCommand={newCommand} setNewCommand={setNewCommand} onAddCommand={addCommand} onDelete={(id) => selected && updateSelected({ ...selected, commands: selected.commands.filter((command) => command.id !== id) })} onRun={run} onPause={() => setStatus("paused")} onCancel={() => setStatus("idle")} onClear={() => setMessages([])} />}{tab === "chat" && <Chat bot={chatBot} command={chatCommand} argument={chatArgument} queue={chatQueue} messages={chatMessages} sending={chatSending} onBotChange={selectChatBot} onCommandChange={setChatCommand} onArgumentChange={setChatArgument} onAdd={addChatCommand} onRemove={(index) => setChatQueue((items) => items.filter((_, itemIndex) => itemIndex !== index))} onSend={sendChat} onClear={() => { setChatMessages([]); fetch("/api/chat-history", { method: "DELETE" }).catch(() => undefined); }} />}{tab === "templates" && <Templates templates={templates} selectedId={selectedId} newTemplate={newTemplate} setNewTemplate={setNewTemplate} onAdd={addTemplate} onOpen={(id) => { setSelectedId(id); setBotUsername(templates.find((item) => item.id === id)?.bot ?? botUsername); setTab("flows"); }} onDelete={(id) => { setTemplates((items) => items.filter((item) => item.id !== id)); fetch(`/api/flows?id=${id}`, { method: "DELETE" }).catch(() => undefined); if (id === selectedId) setSelectedId(templates.find((item) => item.id !== id)?.id ?? 0); }} />}{tab === "settings" && <Settings interval={interval} setInterval={setInterval} botUsername={botUsername} setBotUsername={setBotUsername} savedSetup={savedSetup} onSetup={() => { setStep(savedSetup ? 3 : 1); setNotice(""); setSetupOpen(true); }} />}</section>
      <aside className="setup-panel"><div className="panel-kicker">✦ {savedSetup ? "BAĞLANTI MERKEZİ" : "HIZLI BAŞLANGIÇ"}</div><h2>{savedSetup ? "Telegram bağlantın hazır" : "Telegram hesabını bağla"}</h2><p>{savedSetup ? `${savedSetup.phoneHint} numaralı hesap için güvenli bağlantı yapılandırıldı.` : "Bot tokenına ihtiyaç duymadan, kişisel Telegram hesabınla akışlarını yönet."}</p><div className="secure-note"><span>⌘</span><div><strong>Uçtan uca güvenli kurulum</strong><small>Gizli bilgiler tarayıcıya geri dönmez ve arayüzde gösterilmez.</small></div></div><div className="setup-steps"><div className={`step ${savedSetup ? "done" : "active"}`}><b>{savedSetup ? "✓" : "1"}</b><div><strong>API bilgileri</strong><small>Kimlik bilgilerini güvenle kaydet</small></div></div><div className={`step ${authPhase === "authorized" ? "done" : savedSetup ? "active" : ""}`}><b>{authPhase === "authorized" ? "✓" : "2"}</b><div><strong>Hesabı doğrula</strong><small>Telegram koduyla bağlantıyı tamamla</small></div></div><div className={`step ${authPhase === "authorized" ? "done" : ""}`}><b>{authPhase === "authorized" ? "✓" : "3"}</b><div><strong>Akışlarını çalıştır</strong><small>Komutlarını tek merkezden yönet</small></div></div></div><button className="setup-button" onClick={() => { setStep(savedSetup ? 3 : 1); setNotice(""); setSetupOpen(true); }}>{savedSetup ? "Bağlantıyı yönet" : "Güvenli kurulumu başlat"} <span>→</span></button></aside>
    </div><footer><span>Teleflow · Güvenli Telegram otomasyonu</span><span>Hızlı · Akıcı · Güvenli</span></footer>
    {setupOpen && <div className="modal-backdrop" role="button" tabIndex={0} aria-label="Kurulum penceresini kapat" onClick={(event) => { if (event.target === event.currentTarget) setSetupOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setSetupOpen(false); }}><div className="setup-modal"><button className="modal-close" aria-label="Kurulum penceresini kapat" onClick={() => setSetupOpen(false)}>×</button><div className="modal-icon">T</div><div className="eyebrow">GÜVENLİ KURULUM · ADIM {step}/3</div><h2>{step === 1 ? "Telegram API bilgileri" : step === 2 ? "Telefon numarası" : "Telegram doğrulaması"}</h2><p>{step === 1 ? "my.telegram.org üzerindeki API development tools bölümünden aldığınız bilgileri girin." : step === 2 ? "Telefon numaranızı ülke koduyla girin." : savedSetup ? `${savedSetup.phoneHint} için bilgiler Mac mini üzerinde şifreli saklanıyor.` : "Önce API bilgilerini kaydedin."}</p>{step === 1 && <div className="form-grid"><label>api_id<input value={apiId} onChange={(event) => setApiId(event.target.value)} placeholder="12345678" /></label><label>api_hash<input type="password" value={apiHash} onChange={(event) => setApiHash(event.target.value)} placeholder="32 karakter" /></label></div>}{step === 2 && <label>Telefon numarası<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" /></label>}{step === 3 && savedSetup && <div>{authPhase === "idle" && <button className="primary-button" disabled={saving} onClick={() => authenticate("send-code")}>Telegram kodu gönder</button>}{authPhase === "code_required" && <><label>Doğrulama kodu<input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="Telegram’dan gelen kod" /></label><button className="primary-button" disabled={saving} onClick={() => authenticate("verify-code")} style={{ marginTop: 12 }}>Kodu doğrula</button></>}{authPhase === "password_required" && <><label>İki aşamalı doğrulama parolası<input type="password" value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} placeholder="Parolanız" /></label><button className="primary-button" disabled={saving} onClick={() => authenticate("verify-password")} style={{ marginTop: 12 }}>Parolayı doğrula</button></>}{authPhase === "authorized" && <p className="save-message saved">Telegram hesabı bağlı. Akışları başlatabilirsiniz.</p>}</div>}{notice && <p className="save-message error">{notice}</p>}<div className="modal-actions"><button className="secondary-button" onClick={() => setSetupOpen(false)}>Kapat</button>{step < 3 && <button className="primary-button" disabled={saving} onClick={() => step === 1 ? setStep(2) : saveSetup()}>{step === 1 ? "Devam et" : saving ? "Kaydediliyor…" : "Güvenle kaydet"}</button>}{step === 3 && <button className="secondary-button" onClick={() => { setAuthPhase("idle"); setStep(1); }}>Bilgileri değiştir</button>}</div></div></div>}
  </main>;
}

function Nav({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}><span aria-hidden="true">{icon}</span><em>{label}</em></button>; }

async function copyText(value: string) { await navigator.clipboard.writeText(value); }
async function copyImage(url: string) { const blob = await (await fetch(url)).blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); }
async function downloadImage(url: string, fileName: string) { const blob = await (await fetch(url)).blob(); const objectUrl = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = objectUrl; link.download = fileName; link.click(); URL.revokeObjectURL(objectUrl); }
async function combineImages(messages: Message[]) { const loaded = await Promise.all(messages.map(async (message) => { const image = new Image(); image.src = message.imageUrl!; await image.decode(); return image; })); const width = Math.max(...loaded.map((image) => image.width)); const height = loaded.reduce((total, image) => total + Math.round(image.height * width / image.width) + 32, 32); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) return; context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); let y = 16; loaded.forEach((image) => { const scaledHeight = Math.round(image.height * width / image.width); context.drawImage(image, 0, y, width, scaledHeight); y += scaledHeight + 32; }); await downloadImage(canvas.toDataURL("image/png"), "b0pt-tum-gorsel-yanitlar.png"); }
async function copyAllResponseText(messages: Array<{ command: string; text: string; time: string }>) { const value = messages.map((message, index) => `${index + 1}. ${message.command} · ${message.time}\n${message.text || "(Görsel yanıt)"}`).join("\n\n────────────────────\n\n"); await copyText(value); }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character)); }
async function downloadCombinedResponses(messages: Array<{ command: string; text: string; time: string; imageUrl?: string }>, title: string) { const items = await Promise.all(messages.map(async (message) => { let image = ""; if (message.imageUrl) { const blob = await (await fetch(message.imageUrl)).blob(); image = `data:${blob.type};base64,${await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(blob); })}`; } return { ...message, image }; })); const body = items.map((message, index) => `<article><div class="meta">${index + 1}. ${escapeHtml(message.command)} · ${escapeHtml(message.time)}</div>${message.text ? `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>` : ""}${message.image ? `<img src="${message.image}" alt="${escapeHtml(message.command)}">` : ""}</article>`).join(""); const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px Arial;color:#172b4d;max-width:900px;margin:32px auto;padding:0 20px}h1{font-size:24px}.meta{font-weight:700;color:#4c648a;margin-bottom:12px}article{border-bottom:1px solid #dfe6ef;padding:20px 0}p{white-space:normal;line-height:1.6;color:#536682}img{display:block;max-width:100%;max-height:900px;object-fit:contain;margin-top:14px}</style><h1>${escapeHtml(title)}</h1>${body}</html>`; const blob = new Blob([html], { type: "text/html;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${safeFileName(title)}.html`; link.click(); URL.revokeObjectURL(url); }
function safeFileName(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "telegram-yanit"; }
function Flows({ template, botUsername, setBotUsername, commands, commandArguments, onArgumentChange, interval, status, statusText, messages, newCommand, setNewCommand, onAddCommand, onDelete, onRun, onPause, onCancel, onClear }: { template: Template | undefined; botUsername: string; setBotUsername: (value: string) => void; commands: Command[]; commandArguments: Record<number, string>; onArgumentChange: (id: number, value: string) => void; interval: number; status: string; statusText: string; messages: Message[]; newCommand: string; setNewCommand: (value: string) => void; onAddCommand: () => void; onDelete: (id: number) => void; onRun: () => void; onPause: () => void; onCancel: () => void; onClear: () => void }) {
  const images = messages.filter((message) => message.imageUrl);
  return <>
    <div className="content-head"><div><div className="eyebrow">AKIŞ KONSOLU</div><h1>{template?.name ?? "Şablon seçin"}</h1><p>Komut sırasını düzenle, tek dokunuşla çalıştır ve tüm yanıtları aynı yerde yönet.</p></div><div className="headline-meta"><span><b>{commands.length}</b> komut</span><span><b>{interval} sn</b> aralık</span></div></div>
    <div className="flow-card primary-card"><div className="flow-card-head"><div className="flow-title"><span className={`status-dot ${status}`} /><div><strong>{template?.name}</strong><span>{botUsername} üzerinden gönderilecek</span></div></div><span className={`run-status ${status}`}>{statusText}</span></div>
      <label className="field-label">Bot kullanıcı adı<input list="bot-options" value={botUsername} onChange={(event) => setBotUsername(event.target.value)} placeholder="@kullanici_adi" /><datalist id="bot-options"><option value="@b0pt_bot" /><option value="@ucretsizderinlikbot" /></datalist></label>
      <div className="command-list">{commands.map((command, index) => <div className="command-row" key={command.id}><span className="command-number">{index + 1}</span><div className="command-copy"><code>{command.text}</code><small>Komut {index + 1}</small></div><input className="command-argument" aria-label={`${command.text} parametresi`} value={commandArguments[command.id] ?? command.argument ?? ""} onChange={(event) => onArgumentChange(command.id, event.target.value)} placeholder="Hisse kodu / parametre" /><button className="icon-button danger" aria-label={`${command.text} komutunu sil`} title="Komutu sil" onClick={() => onDelete(command.id)}>×</button></div>)}</div>
      <div className="add-command"><input aria-label="Yeni komut" value={newCommand} onChange={(event) => setNewCommand(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAddCommand()} placeholder="Yeni komut ekle (ör. /teorik THYAO)" /><button onClick={onAddCommand}>+ Komut ekle</button></div>
      <div className="flow-actions main-actions"><button className="primary-button" onClick={onRun}>{status === "paused" ? "▶ Devam et" : "▶ Akışı başlat"}</button><button className="secondary-button" onClick={onPause}>Ⅱ Duraklat</button><button className="ghost-danger" onClick={onCancel}>■ Durdur</button><span className="action-note">Komutlar {interval} saniye arayla gönderilir</span></div>
    </div>
    <div className="section-head"><div><h2>Son yanıtlar</h2><span>Metinleri kopyala, görselleri birleştir veya tek dosyada dışa aktar.</span></div>{messages.length > 0 && <div className="section-actions"><button className="soft-button" onClick={() => copyAllResponseText(messages)}>Metinleri kopyala</button><button className="primary-button" onClick={() => downloadCombinedResponses(messages, template?.name ?? "Telegram yanıtları")}>Tümünü indir</button>{images.length > 1 && <button className="soft-button" onClick={() => combineImages(images)}>Görselleri birleştir</button>}<button className="text-button danger-text" onClick={onClear}>Temizle</button></div>}</div>
    <div className="message-stack">{messages.length ? messages.map((message) => <article className="message-card" key={message.id}><div className="message-meta"><span className="telegram-icon">T</span><div><strong>Telegram botu</strong><span>{message.time} · {message.command}</span></div><span className="reply-badge">Yanıtlandı</span></div><p>{message.text}</p><div className="card-actions"><button className="soft-button" onClick={() => copyText(message.text)}>Metni kopyala</button>{message.imageUrl && <><button className="soft-button" onClick={() => copyImage(message.imageUrl!)}>Görseli kopyala</button><button className="primary-button" onClick={() => downloadImage(message.imageUrl!, `${safeFileName(message.command)}.png`)}>Görseli indir</button></>}</div>{message.imageUrl && <img src={message.imageUrl} alt={`${message.command} görsel yanıtı`} />}</article>) : <EmptyState icon="↗" title="İlk akışını çalıştır" text="Yanıtlar, grafikler ve indirilebilir sonuçlar burada düzenli biçimde görünecek." />}</div>
  </>;
}

function Chat({ bot, command, argument, queue, messages, sending, onBotChange, onCommandChange, onArgumentChange, onAdd, onRemove, onSend, onClear }: { bot: string; command: string; argument: string; queue: string[]; messages: ChatMessage[]; sending: boolean; onBotChange: (value: string) => void; onCommandChange: (value: string) => void; onArgumentChange: (value: string) => void; onAdd: () => void; onRemove: (index: number) => void; onSend: () => void; onClear: () => void }) {
  const catalog = botCatalog.find((item) => item.bot === bot) ?? botCatalog[0];
  return <><div className="content-head"><div><div className="eyebrow">HIZLI MESAJ</div><h1>Telegram komut merkezi</h1><p>Botu ve komutu seç; tek seferde gönder veya bir kuyruk oluştur.</p></div>{queue.length > 0 && <div className="headline-meta"><span><b>{queue.length}</b> kuyrukta</span></div>}</div><div className="flow-card primary-card"><div className="form-grid"><label className="field-label">Bot<select value={bot} onChange={(event) => onBotChange(event.target.value)}>{botCatalog.map((item) => <option key={item.bot} value={item.bot}>{item.label} · {item.bot}</option>)}</select></label><label className="field-label">Komut<select value={command} onChange={(event) => onCommandChange(event.target.value)}>{catalog.commands.map((item, index) => <option key={`${item.text}-${index}`} value={item.text}>{item.text}</option>)}</select></label></div><div className="composer"><input aria-label="Komut parametresi" value={argument} onChange={(event) => onArgumentChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAdd()} placeholder="Hisse kodu / parametre (ör. THYAO)" /><button className="secondary-button" onClick={onAdd}>+ Kuyruğa ekle</button></div>{queue.length > 0 && <div className="queue-panel"><div className="queue-title"><strong>Gönderim kuyruğu</strong><span>{queue.length} komut</span></div>{queue.map((item, index) => <div className="command-row compact" key={`${item}-${index}`}><span className="command-number">{index + 1}</span><code>{item}</code><button className="icon-button danger" aria-label={`${item} komutunu kuyruktan çıkar`} onClick={() => onRemove(index)}>×</button></div>)}</div>}<div className="flow-actions main-actions"><button className="primary-button wide-button" disabled={sending} onClick={onSend}>{sending ? "Yanıt bekleniyor…" : queue.length ? `${queue.length} komutu gönder` : "Komutu şimdi gönder"}</button></div></div><div className="section-head"><div><h2>Son mesajlar</h2><span>Komutlar ve yanıtlar bu çalışma alanında saklanır.</span></div>{messages.length > 0 && <button className="text-button danger-text" onClick={onClear}>Geçmişi temizle</button>}</div><div className="message-stack">{messages.length ? messages.map((message) => <article className="message-card" key={message.id}><div className="message-meta"><span className="telegram-icon">T</span><div><strong>{message.bot}</strong><span>{message.time} · {message.command}</span></div><span className="reply-badge">Yanıtlandı</span></div><p>{message.text || "Medya yanıtı"}</p><div className="card-actions"><button className="soft-button" onClick={() => copyText(message.text)}>Metni kopyala</button>{message.imageUrl && <><button className="soft-button" onClick={() => copyImage(message.imageUrl!)}>Görseli kopyala</button><button className="primary-button" onClick={() => downloadImage(message.imageUrl!, `${safeFileName(message.command)}.png`)}>Görseli indir</button></>}</div>{message.imageUrl && <img src={message.imageUrl} alt={`${message.command} yanıtı`} />}</article>) : <EmptyState icon="◉" title="Yeni bir mesaj gönder" text="Seçtiğin botun yanıtı birkaç saniye içinde burada görünecek." />}</div></>;
}

function Templates({ templates, selectedId, newTemplate, setNewTemplate, onAdd, onOpen, onDelete }: { templates: Template[]; selectedId: number; newTemplate: string; setNewTemplate: (value: string) => void; onAdd: () => void; onOpen: (id: number) => void; onDelete: (id: number) => void }) { return <><div className="content-head"><div><div className="eyebrow">ŞABLON KÜTÜPHANESİ</div><h1>Hazır akışlar</h1><p>Sık kullandığın komut gruplarına tek dokunuşla ulaş.</p></div><div className="headline-meta"><span><b>{templates.length}</b> şablon</span></div></div><div className="flow-card create-template"><input aria-label="Yeni şablon adı" value={newTemplate} onChange={(event) => setNewTemplate(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAdd()} placeholder="Yeni şablon adı" /><button className="primary-button" onClick={onAdd}>+ Şablon oluştur</button></div><div className="template-grid">{templates.map((template) => <article className={`template-card ${template.id === selectedId ? "selected" : ""}`} key={template.id}><div className="template-icon">{template.name.slice(0, 1)}</div><div className="template-copy"><strong>{template.name}</strong><span>{template.bot}</span><div className="template-stat">{template.commands.length} komut</div></div><div className="template-actions"><button className="soft-button" onClick={() => onOpen(template.id)}>Akışı aç</button><button className="icon-button danger" aria-label={`${template.name} şablonunu sil`} onClick={() => onDelete(template.id)}>×</button></div></article>)}</div></>; }

function Settings({ interval, setInterval, botUsername, setBotUsername, savedSetup, onSetup }: { interval: number; setInterval: (value: number) => void; botUsername: string; setBotUsername: (value: string) => void; savedSetup: { apiId: string; phoneHint: string } | null; onSetup: () => void }) { return <><div className="content-head"><div><div className="eyebrow">TERCİHLER</div><h1>Akış ayarları</h1><p>Gönderim davranışını ve güvenli Telegram bağlantını yönet.</p></div></div><div className="settings-grid"><section className="flow-card setting-card"><div className="setting-icon">◴</div><div><h2>Gönderim aralığı</h2><p>Komutlar arasındaki varsayılan bekleme süresi.</p><label className="field-label">Saniye<input type="number" min="1" max="120" value={interval} onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))} /></label><small>Yoğunluk durumunda bekleme otomatik olarak uzatılır.</small></div></section><section className="flow-card setting-card"><div className="setting-icon">⌁</div><div><h2>Varsayılan bot</h2><p>Yeni akışlarda önce seçilecek Telegram botu.</p><label className="field-label">Bot<select value={botUsername} onChange={(event) => setBotUsername(event.target.value)}><option value="@b0pt_bot">B0PT · @b0pt_bot</option><option value="@ucretsizderinlikbot">UDF · @ucretsizderinlikbot</option><option value="@BOT_KULLANICI_ADI">Özel bot</option></select></label></div></section><section className="flow-card setting-card full"><div className="setting-icon secure">✓</div><div><h2>Telegram bağlantısı</h2><p>{savedSetup ? `${savedSetup.phoneHint} numaralı hesap güvenle yapılandırıldı.` : "Henüz bir Telegram hesabı bağlanmadı."}</p><button className="primary-button" onClick={onSetup}>{savedSetup ? "Bağlantıyı yönet" : "Güvenli kurulumu başlat"}</button></div></section></div></>; }

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) { return <article className="empty-state"><span aria-hidden="true">{icon}</span><strong>{title}</strong><p>{text}</p></article>; }
