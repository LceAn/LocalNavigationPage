# Local Navigation Page

[![Version](https://img.shields.io/badge/Version-1.46.0-blue)]()
[![License](https://img.shields.io/badge/License-Apache--2.0-green)]()
[![Tests](https://img.shields.io/badge/Tests-172-brightgreen)]()
[![Dependencies](https://img.shields.io/badge/Dependencies-0-success)]()
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker)]()

**Your AI-powered home base for the local network.** Zero dependencies, zero build steps. Websites, AI models, MCP servers, and Skills — all in one navigation page.

[中文文档](README_CN.md) | [Documentation](docs/) | [API & MCP](docs/API.md)

---

## Why This Exists

The AI era changed what a homepage needs to be. You don't just have websites anymore — you have Ollama models running locally, MCP servers for your AI assistants, Skills directories, and a dozen web services on your LAN. This page puts them all in one place, with intelligence built in.

### What Makes It Different

| Feature | Homepage / Homarr / Dashy | Local Navigation Page |
|---------|:---:|:---:|
| **AI Model Dashboard** — discover Ollama / LM Studio / vLLM models, view specs, copy SDK configs | – | ✅ |
| **MCP & Skills Catalog** — browse MCP servers and Skills as tiles, click to view details | – | ✅ |
| **Smart Multi-Route** — LAN / WAN / tunnel addresses per link, auto-failover when primary is down | – | ✅ automatic |
| **Local Service Scanner** — `npm run scan` discovers everything on the machine | – | ✅ with Docker integration |
| **REST API + MCP Server** — manage links programmatically or via AI assistant | – | ✅ |
| **Multi-Device Sync** — server-based config sharing across browsers | – | ✅ |
| **Zero Dependencies** — no npm install, no build step, single Node process | – | ✅ |
| **Fully Offline** — fonts, icons, and PWA cache all self-hosted | – | partial |

## Quick Start

```bash
git clone https://github.com/LceAn/LocalNavigationPage.git
cd LocalNavigationPage
npm run serve
```

Open `http://127.0.0.1:8080`. Done.

**First time?** Scan your entire machine in one command:

```bash
npm run scan -- --deep        # discovers services + AI models + MCP endpoints
npm run scan -- --merge       # merge results into your links
```

### One-Click Install (no Docker)

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/LceAn/LocalNavigationPage/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/LceAn/LocalNavigationPage/main/install.ps1 | iex
```

Auto-detects OS, checks Node.js, installs as a system service (systemd / launchd / startup item), configures auto-start. Supports `--port` and offline mode.

**Offline install** (air-gapped environments):
```bash
# Download on a connected machine, then:
bash install.sh   # auto-detects lnp.tar.gz in current directory
```

### Service Lifecycle Management

```bash
node scripts/manage.mjs install     # Install as system service
node scripts/manage.mjs status      # Show running state, port, PID
node scripts/manage.mjs start      # Start
node scripts/manage.mjs stop       # Stop
node scripts/manage.mjs restart    # Restart
node scripts/manage.mjs update     # git pull + restart
node scripts/manage.mjs logs       # View recent logs
node scripts/manage.mjs uninstall  # Remove service (keeps data)
```

### Docker

```bash
docker compose up -d --build
```

## AI-Era Features

### AI Model Dashboard

Point it at your local AI services and it automatically discovers what's running:

- **Ollama** — lists all pulled models with size, family, parameter count, quantization level
- **OpenAI-compatible** (LM Studio, vLLM, One API, OpenRouter) — enumerates `/v1/models`
- Click any model to see full specs and copy an OpenAI SDK config (`base_url` + `model`) or a `curl` test command

### MCP & Skills as First-Class Citizens

MCP servers and Skills aren't bookmarks — they're catalog entries with structure:

- **Unified tiles** — MCP servers, Skills, and websites appear side by side in the navigation drawer
- **Type filtering** — filter by Websites / AI / MCP / Skills with one tap
- **Detail view** — click any MCP server to see its tools, connection info, and configuration
- **Auto-discovery** — `npm run catalog` scans MCP configs and Skills directories; `POST /api/catalog/scan` does the same from the web UI
- **Searchable** — the launcher (`Ctrl+K`) searches across all types simultaneously

### Smart Multi-Route

Each link can have multiple addresses with automatic routing:

```json
{
  "name": "NAS Admin",
  "urls": [
    { "address": "http://192.168.1.100:5000", "label": "LAN", "priority": 1 },
    { "address": "https://nas.tailnet.ts.net", "label": "Tailscale", "priority": 2 }
  ]
}
```

When the primary address is unreachable, Smart Routing automatically switches to the fastest available alternative. Color-coded badges (green = LAN, blue = WAN, purple = tunnel) show which route is active.

### REST API + MCP Server

```bash
# REST API (built into npm run serve)
curl http://127.0.0.1:8080/api/links
curl -X POST http://127.0.0.1:8080/api/links \
  -H "Content-Type: application/json" \
  -d '{"name":"Grafana","url":"http://192.168.1.100:3000","category":"Monitoring"}'
```

Or connect your AI assistant via MCP:

```json
{
  "mcpServers": {
    "local-navigation-page": {
      "command": "node",
      "args": ["path/to/LocalNavigationPage/scripts/mcp-server.mjs"]
    }
  }
}
```

Then just ask: *"Add a link to Kibana on port 5601, category Monitoring"* — and it's done.

See [docs/API.md](docs/API.md) for the full reference.

## Core Features

<details>
<summary><b>Navigation & Links</b></summary>

- Compact grid tiles with icons, names, and tags
- Drag-to-reorder; groups sort by name / count / manual order
- Right-click context menu (copy address, popup window, per-route jump)
- Keyboard: `Ctrl+K` launcher, `/` focus search, arrows between tiles — every binding is customizable (record, clear, reset)
- LAN / WAN visual distinction (color-coded ring + badge)
- Online status probing with configurable interval and latency

</details>

<details>
<summary><b>Search</b></summary>

- Multi-engine, fully customizable with prefix routing (`/g term` → Google)
- Engine buttons: show all, current-only (click to expand), or hidden (Enter uses the default engine)
- Launcher searches links, categories, tags, URLs, and search history

</details>

<details>
<summary><b>Appearance</b></summary>

- Day/night, 8 theme colors, custom CSS & JS injection
- 6 clock layouts, 6 search box layouts + 5 visual styles (glass / solid / outline / underline / square), 3 density levels
- Animated weather (rain/snow/clouds, intensity-matched)
- PWA installable, fully offline (self-hosted fonts & icons)
- Blank-area gestures: single click toggles the shortcut drawer by default; single/double click actions are configurable

</details>

<details>
<summary><b>Data & Sync</b></summary>

- Browser-local storage (no server required)
- Optional multi-device sync via `npm run serve`
- Import/export backups; automatic pre-import backup download
- Bookmark HTML import/export (Chrome/Firefox/Edge)
- 9 one-click data management actions

</details>

<details>
<summary><b>Service Scanner</b></summary>

- `npm run scan` discovers all listening ports
- Docker integration (real service names from container names)
- Multi-port deduplication (one entry per service, not per port)
- AI model discovery (`--deep`) via Ollama & OpenAI endpoints
- MCP endpoint detection (`/mcp`, `/sse`, `/api/mcp`)
- System service filtering; `--merge`, `--json`, `--host` flags

</details>

## Project Structure

```
HTML/js/                    # 15 frontend modules (zero dependencies)
scripts/                    # Server, scanner, MCP server, tests, validation
docker/                     # Nginx config & data initialization
docs/                       # API, schema, deploy, changelog, polish log
```

## Development

```bash
npm test               # 172 unit tests
npm run validate       # JSON / resources / syntax / version consistency
npm run serve          # Dev server + REST API
npm run scan -- --deep # Service scanner with AI/MCP discovery
npm run catalog        # MCP/Skills catalog scanner
npm run mcp            # MCP server (stdio JSON-RPC)
```

## Documentation

| Doc | Description |
|---|---|
| [Changelog](docs/CHANGELOG.md) | Full version history |
| [API & MCP](docs/API.md) | REST endpoints + MCP server setup |
| [Schema](docs/SCHEMA.md) | Data format reference |
| [Deploy](docs/DEPLOY.md) | Auth, HTTPS, deployment hardening |
| [Security](SECURITY.md) | Private data policy |
| [中文文档](README_CN.md) | Chinese README |

## License

[Apache License 2.0](LICENSE)
