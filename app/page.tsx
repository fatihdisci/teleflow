"use client";

import { useMemo, useState } from "react";

type Command = { id: number; text: string };
type Message = { id: number; command: string; text: string; time: string };

const initialCommands: Command[] = [
  { id: 1, text: "/teorik karcl" },
  { id: 2, text: "/teorik quick" },
  { id: 3, text: "/teorik halka_arz" },
];
const initialMessages: Message[] = [
  { id: 1, command: "/teorik karcl", text: "KAREL Elektronik için teorik kâr: %18,4\nTalep toplama aralığı ve tahmini dağılım hesaplandı.", time: "10:42" },
  { id: 2, command: "/teorik quick", text: "Hızlı özet hazırlandı. 3 yeni halka arz takipte.", time: "10:42" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"flow" | "templates" | "settings">("flow");
  const [commands, setCommands] = useState(initialCommands);
  const [messages, setMessages] = useState(initialMessages);
  const [newCommand, setNewCommand] = useState("");
  const [interval, setIntervalValue] = useState(4);
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [setupOpen, setSetupOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [step, setStep] = useState(1);
  const statusLabel = useMemo(() => ({ idle: "Hazır", running: "Çalışıyor", paused: "Duraklatıldı", done: "Tamamlandı" }[status]), [status]);
  function addCommand() { const value = newCommand.trim(); if (!value) return; setCommands((current) => [...current, { id: Date.now(), text: value.startsWith("/") ? value : `/${value}` }]); setNewCommand(""); }
  function runFlow() { setStatus("running"); const next = commands[messages.length % Math.max(commands.length, 1)]; if (next) setMessages((current) => [...current, { id: Date.now(), command: next.text, text: "Bot yanıtı alındı. Bu demo akışında Telegram cevabı burada görünür.", time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) }]); }
  async function saveSetup() {
    if (!apiId.trim() || !apiHash.trim() || !phone.trim()) { setSaveState("error"); setSaveMessage("api_id, api_hash ve telefon numarası zorunludur."); return; }
    setSaveState("saving"); setSaveMessage("");
    try {
      const response = await fetch("/api/telegram/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiId, apiHash, phone }) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Kayıt tamamlanamadı.");
      setApiHash(""); setSaveState("saved"); setSaveMessage(payload.message || "Bilgileriniz şifreli olarak kaydedildi."); setStep(3);
    } catch (error) { setSaveState("error"); setSaveMessage(error instanceof Error ? error.message : "Kayıt tamamlanamadı."); }
  }
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">T</div><div><strong>Teleflow</strong><span>Telegram komut akışları</span></div></div><div className="top-actions"><div className="connection-pill"><i /> Telegram bağlı değil</div><button className="avatar">FD</button></div></header>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-label">ÇALIŞMA ALANI</div><button className={`nav-item ${activeTab === "flow" ? "active" : ""}`} onClick={() => setActiveTab("flow")}><span>⌁</span> Akışlar <b>2</b></button><button className={`nav-item ${activeTab === "templates" ? "active" : ""}`} onClick={() => setActiveTab("templates")}><span>▤</span> Şablonlar <b>4</b></button><button className={`nav-item ${activeTab === "settings" ? "active" : ""}`} onClick={() => setActiveTab("settings")}><span>⚙</span> Ayarlar</button><div className="sidebar-bottom"><div className="mini-card"><span className="shield">✓</span><div><strong>Güvenli alan</strong><small>Sırlar sunucuda şifreli</small></div></div><button className="help-link">? Nasıl çalışır?</button></div></aside>
      <section className="content"><div className="content-head"><div><div className="eyebrow">AKIŞLAR / SON HALKA ARZLAR</div><h1>Son halka arzlar</h1><p>Komutlarınızı sırayla gönderin, bot cevaplarını tek yerde takip edin.</p></div><button className="soft-button">＋ Yeni akış</button></div>
        <div className="flow-card"><div className="flow-card-head"><div className="flow-title"><span className="status-dot" /><div><strong>Son halka arzlar</strong><span>@BOT_KULLANICI_ADI · {commands.length} komut</span></div></div><span className={`run-status ${status}`}>{statusLabel}</span></div><div className="progress-line"><span style={{ width: `${status === "done" ? 100 : messages.length ? 66 : 0}%` }} /></div><div className="command-list">{commands.map((command, index) => <div className="command-row" key={command.id}><span className="drag">⠿</span><span className={`command-number ${index < messages.length ? "complete" : ""}`}>{index < messages.length ? "✓" : index + 1}</span><code>{command.text}</code><span className="wait-label">{interval} sn sonra</span><button aria-label="Komutu sil" className="delete-command" onClick={() => setCommands(commands.filter((item) => item.id !== command.id))}>×</button></div>)}</div><div className="add-command"><input value={newCommand} onChange={(event) => setNewCommand(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCommand()} placeholder="Komut ekle, ör. /teorik halka_arz" /><button onClick={addCommand}>Ekle</button></div><div className="flow-actions"><button className="primary-button" onClick={runFlow}>{status === "paused" ? "Devam et" : "▶  Akışı başlat"}</button><button className="control-button" onClick={() => setStatus("paused")}>Ⅱ</button><button className="control-button danger" onClick={() => setStatus("idle")}>■</button><span className="action-note">Komutlar {interval} saniye arayla gönderilir</span></div></div>
        <div className="section-head"><div><h2>Son yanıtlar</h2><span>Bu akışın Telegram cevapları</span></div><button className="text-button">Tüm geçmişi gör →</button></div><div className="message-stack">{messages.map((message) => <article className="message-card" key={message.id}><div className="message-meta"><span className="telegram-icon">T</span><div><strong>Telegram botu</strong><span>{message.time} · {message.command}</span></div><span className="reply-badge">Yanıt</span></div><p>{message.text}</p></article>)}</div>
      </section>
      <aside className="setup-panel"><div className="panel-kicker"><span className="sparkle">✦</span> İLK KURULUM</div><h2>Telegram hesabını bağla</h2><p>Bot API tokenına ihtiyacınız yok. Kişisel hesabınızla güvenli bir kullanıcı bağlantısı kurun.</p><div className="secure-note"><span>⌘</span><div><strong>Uçtan uca güvenlik</strong><small>Oturum bilgileriniz yalnızca sunucuda, şifreli olarak saklanır.</small></div></div><div className="setup-steps"><div className={step >= 1 ? "step active" : "step"}><b>1</b><div><strong>API bilgilerini al</strong><small>my.telegram.org üzerinden ücretsiz alın.</small></div></div><div className={step >= 2 ? "step active" : "step"}><b>2</b><div><strong>Telefonunu doğrula</strong><small>SMS veya Telegram kodu.</small></div></div><div className={step >= 3 ? "step active" : "step"}><b>3</b><div><strong>Bağlantıyı tamamla</strong><small>2 aşamalı şifre gerekiyorsa burada.</small></div></div></div><button className="setup-button" onClick={() => setSetupOpen(true)}>Kurulumu başlat <span>→</span></button><button className="learn-button" onClick={() => setStep(step === 3 ? 1 : step + 1)}>API bilgileri nasıl alınır?</button></aside>
    </div>
    <footer><span>Teleflow · Kullanıcı API’si ile çalışır</span><span><a>Gizlilik</a><a>Güvenlik</a><a>Yardım</a></span></footer>
    {setupOpen && <div className="modal-backdrop" onClick={() => setSetupOpen(false)}><div className="setup-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSetupOpen(false)}>×</button><div className="modal-icon">T</div><div className="eyebrow">GÜVENLİ KURULUM · ADIM {step}/3</div><h2>{step === 1 ? "Telegram API bilgilerinizi ekleyin" : step === 2 ? "Telefon numaranızı doğrulayın" : "Bilgileriniz kaydedildi"}</h2><p>{step === 1 ? "my.telegram.org → API development tools sayfasından api_id ve api_hash alın. Bu bilgiler bot tokenı değildir; kullanıcı hesabınızın güvenli erişim anahtarıdır." : step === 2 ? "Telefon numaranızı ülke koduyla yazın. Bilgileriniz kaydedildikten sonra Telegram doğrulama adımına geçilecektir." : "API bilgileriniz ve telefon numaranız sunucuda şifreli olarak saklandı. Sonraki sürümde Telegram doğrulama kodu ve iki aşamalı şifre adımı aktif olacaktır."}</p>{step === 1 && <div className="form-grid"><label>api_id<input value={apiId} onChange={(event) => setApiId(event.target.value)} placeholder="Örn. 12345678" /></label><label>api_hash<input value={apiHash} onChange={(event) => setApiHash(event.target.value)} placeholder="32 karakterlik değer" type="password" /></label></div>}{step === 2 && <label>Telefon numarası<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" /></label>}{saveMessage && <p className={`save-message ${saveState}`}>{saveMessage}</p>}<div className="modal-actions"><button className="secondary-button" onClick={() => setSetupOpen(false)}>İptal</button><button className="primary-button" disabled={saveState === "saving"} onClick={() => step === 1 ? setStep(2) : step === 2 ? saveSetup() : setSetupOpen(false)}>{step === 3 ? "Panele dön" : step === 2 ? saveState === "saving" ? "Kaydediliyor…" : "Güvenle kaydet" : "Devam et →"}</button></div><small className="modal-foot">🔒 Gizli bilgiler hiçbir zaman bu tarayıcıya geri gönderilmez.</small></div></div>}
  </main>;
}
