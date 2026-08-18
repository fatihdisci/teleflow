import asyncio
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, SessionPasswordNeededError
from telethon.sessions import StringSession

DATA_DIR = Path(os.environ.get("TELEFLOW_DATA_DIR", Path(__file__).parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(exist_ok=True)
CONFIG_FILE = DATA_DIR / "telegram.enc"
MEDIA_INDEX_FILE = DATA_DIR / "media-index.json"
AGENT_TOKEN = os.environ.get("TELEFLOW_AGENT_TOKEN", "")
MASTER_KEY = os.environ.get("TELEFLOW_MASTER_KEY", "")

if not AGENT_TOKEN or not MASTER_KEY:
    raise RuntimeError("TELEFLOW_AGENT_TOKEN and TELEFLOW_MASTER_KEY must be set before starting Teleflow Agent.")

fernet = Fernet(MASTER_KEY.encode())
app = FastAPI(title="Teleflow Mac Agent", docs_url=None, redoc_url=None)
jobs: dict[str, dict[str, Any]] = {}


class SetupRequest(BaseModel):
    api_id: int
    api_hash: str
    phone: str


class CodeRequest(BaseModel):
    code: str


class PasswordRequest(BaseModel):
    password: str


class RunRequest(BaseModel):
    bot_username: str
    commands: list[str]
    interval_seconds: int = 4


async def require_token(authorization: str | None = Header(default=None)):
    if authorization != f"Bearer {AGENT_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized agent request")


def load_config() -> dict[str, Any]:
    if not CONFIG_FILE.exists():
        raise HTTPException(status_code=409, detail="Telegram kurulumu yapılmadı.")
    return json.loads(fernet.decrypt(CONFIG_FILE.read_bytes()).decode())


def save_config(config: dict[str, Any]) -> None:
    CONFIG_FILE.write_bytes(fernet.encrypt(json.dumps(config).encode()))


def load_media_index() -> dict[str, str]:
    return json.loads(MEDIA_INDEX_FILE.read_text()) if MEDIA_INDEX_FILE.exists() else {}


def register_media(path: Path) -> str:
    index = load_media_index()
    token = secrets.token_urlsafe(32)
    index[token] = path.name
    MEDIA_INDEX_FILE.write_text(json.dumps(index))
    return token


def client_for(config: dict[str, Any]) -> TelegramClient:
    return TelegramClient(StringSession(config.get("session", "")), config["api_id"], config["api_hash"])


@app.get("/v1/health")
async def health(_: None = Depends(require_token)):
    configured = CONFIG_FILE.exists()
    authorized = False
    if configured:
        config = load_config()
        client = client_for(config)
        await client.connect()
        authorized = await client.is_user_authorized()
        await client.disconnect()
    return {"ok": True, "configured": configured, "authorized": authorized}


@app.post("/v1/setup")
async def setup(payload: SetupRequest, _: None = Depends(require_token)):
    if len(payload.api_hash) != 32 or not payload.api_hash.isalnum():
        raise HTTPException(status_code=400, detail="api_hash geçersiz.")
    if CONFIG_FILE.exists():
        existing = load_config()
        if (
            existing.get("api_id") == payload.api_id
            and existing.get("api_hash") == payload.api_hash
            and existing.get("phone") == payload.phone
            and existing.get("session")
            and existing.get("phase") == "authorized"
        ):
            return {"status": "authorized"}
    config = {"api_id": payload.api_id, "api_hash": payload.api_hash, "phone": payload.phone, "session": "", "phase": "new"}
    save_config(config)
    return {"status": "saved"}


@app.post("/v1/auth/send-code")
async def send_code(_: None = Depends(require_token)):
    config = load_config()
    client = client_for(config)
    await client.connect()
    sent = await client.send_code_request(config["phone"])
    config["session"] = StringSession.save(client.session)
    config["phone_code_hash"] = sent.phone_code_hash
    config["phase"] = "code_required"
    save_config(config)
    await client.disconnect()
    return {"status": "code_required"}


@app.post("/v1/auth/verify-code")
async def verify_code(payload: CodeRequest, _: None = Depends(require_token)):
    config = load_config()
    client = client_for(config)
    await client.connect()
    try:
        await client.sign_in(config["phone"], payload.code, phone_code_hash=config["phone_code_hash"])
    except SessionPasswordNeededError:
        config["session"] = StringSession.save(client.session)
        config["phase"] = "password_required"
        save_config(config)
        await client.disconnect()
        return {"status": "password_required"}
    config["session"] = StringSession.save(client.session)
    config["phase"] = "authorized"
    config.pop("phone_code_hash", None)
    save_config(config)
    await client.disconnect()
    return {"status": "authorized"}


@app.post("/v1/auth/verify-password")
async def verify_password(payload: PasswordRequest, _: None = Depends(require_token)):
    config = load_config()
    client = client_for(config)
    await client.connect()
    await client.sign_in(password=payload.password)
    config["session"] = StringSession.save(client.session)
    config["phase"] = "authorized"
    save_config(config)
    await client.disconnect()
    return {"status": "authorized"}


@app.post("/v1/runs")
async def create_run(payload: RunRequest, _: None = Depends(require_token)):
    config = load_config()
    if config.get("phase") != "authorized":
        raise HTTPException(status_code=409, detail="Telegram doğrulaması tamamlanmadı.")
    if not payload.commands:
        raise HTTPException(status_code=400, detail="Komut listesi boş.")
    job_id = secrets.token_urlsafe(18)
    jobs[job_id] = {"status": "queued", "responses": [], "error": None, "created_at": time.time()}
    asyncio.create_task(execute_run(job_id, payload, config))
    return {"id": job_id, "status": "queued"}


@app.get("/v1/runs/{job_id}")
async def get_run(job_id: str, _: None = Depends(require_token)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Akış bulunamadı veya Mac mini yeniden başladı.")
    return job


@app.get("/v1/media/{token}")
async def get_media(token: str):
    filename = load_media_index().get(token)
    path = MEDIA_DIR / filename if filename else None
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="Medya bulunamadı.")
    return FileResponse(path)


async def execute_run(job_id: str, payload: RunRequest, config: dict[str, Any]) -> None:
    job = jobs[job_id]
    job["status"] = "running"
    client = client_for(config)
    try:
        await client.connect()
        async with client.conversation(payload.bot_username, timeout=90) as conversation:
            for position, command in enumerate(payload.commands):
                while True:
                    try:
                        await conversation.send_message(command)
                        message = await conversation.get_response()
                        message = await wait_for_edited_result(client, message)
                        job["responses"].append(await serialize_message(client, message, command))
                        break
                    except FloodWaitError as error:
                        job["status"] = "waiting_flood"
                        job["wait_seconds"] = error.seconds
                        await asyncio.sleep(error.seconds)
                        job["status"] = "running"
                if position < len(payload.commands) - 1:
                    await asyncio.sleep(max(1, min(payload.interval_seconds, 120)))
        job["status"] = "completed"
    except Exception as error:
        job["status"] = "failed"
        job["error"] = str(error)
    finally:
        await client.disconnect()


async def serialize_message(client: TelegramClient, message: Any, command: str) -> dict[str, Any]:
    result = {"command": command, "text": message.raw_text or "", "kind": "text", "media_url": None, "file_name": None}
    if message.media:
        path = await client.download_media(message, file=MEDIA_DIR)
        if path:
            media_path = Path(path)
            result["kind"] = "image" if message.photo else "file"
            result["file_name"] = media_path.name
            result["media_url"] = f"/v1/media/{register_media(media_path)}"
    return result


async def wait_for_edited_result(client: TelegramClient, message: Any) -> Any:
    """Wait for bots that turn a progress message into the final media reply."""
    progress_markers = (
        "veri alınıyor",
        "veri aliniyor",
        "hazırlanıyor",
        "hazirlaniyor",
        "işleniyor",
        "isleniyor",
        "yükleniyor",
        "yukleniyor",
        "bekleyin",
    )
    if message.media or not any(marker in (message.raw_text or "").lower() for marker in progress_markers):
        return message

    loop = asyncio.get_running_loop()
    updated = loop.create_future()

    async def on_edited(event: Any) -> None:
        edited = event.message
        if edited.id == message.id and not updated.done():
            updated.set_result(edited)

    builder = events.MessageEdited(chats=message.chat_id)
    client.add_event_handler(on_edited, builder)
    try:
        return await asyncio.wait_for(updated, timeout=90)
    except asyncio.TimeoutError:
        return message
    finally:
        client.remove_event_handler(on_edited, builder)
