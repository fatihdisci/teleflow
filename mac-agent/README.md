# Teleflow Mac Agent

This private service runs Telegram's user API connection on your Mac mini.
It receives signed requests only from the Teleflow web app, stores the Telegram
session encrypted in `mac-agent/data/`, and downloads bot media locally.

## Prepare once

1. In Terminal, change into this `mac-agent` directory.
2. Create the agent secrets:

   ```zsh
   openssl rand -base64 32
   python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
   ```

3. Create `mac-agent/.env` with the two generated values:

   ```dotenv
   TELEFLOW_AGENT_TOKEN=first-value
   TELEFLOW_MASTER_KEY=second-value
   ```

4. Start the agent:

   ```zsh
   chmod +x start.sh
   ./start.sh
   ```

5. For automatic startup after creating `.env`:

   ```zsh
   chmod +x install-launch-agent.sh
   ./install-launch-agent.sh
   ```

6. Install `cloudflared`, create a named Cloudflare Tunnel, and map its public
   HTTPS hostname to `http://127.0.0.1:8787`. Keep the agent token private.

7. In Sites, set `MAC_AGENT_URL` to that HTTPS hostname and set
   `MAC_AGENT_TOKEN` to the same agent token as a secret. Do not add either to
   the browser or repository.

## Operational notes

- First setup: enter the Telegram API values in Teleflow, then request a code
  and complete code/2FA verification through the agent endpoints.
- The agent retries a command after Telegram's `FLOOD_WAIT` delay.
- Image and document replies are stored locally in `data/media/`; opaque URLs
  are supplied to the web application for display, copying, downloading, or
  combining.
