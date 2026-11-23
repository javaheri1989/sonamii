# Bot admin toggles (`@javaherin8n_bot`)

The Telegram bot is **not** a separate app repo. It runs as **n8n workflows** on the VPS:

- Host: n8n at `n8n.sonamii.com` (Docker on the Sonami VPS)
- Scripts: `/opt/n8n/scripts/`
- Local flags: `/opt/n8n/local-files/*_enabled.json`
- Helper proxy: `ff-news-proxy.service` on `:18765`

## Commands (admin only: Mohsen)
| Command | Feature |
|---------|---------|
| `اثر` | News “possible effect” reply on/off |
| `طلا` | Gold sudden-move alert on/off |

Inline buttons: `effect:on|off|status`, `gold:on|off|status`

## Flag API
- `GET/POST http://172.18.0.1:18765/flags/news-effect`
- `GET/POST http://172.18.0.1:18765/flags/gold-alert`

Body for POST: `{"enabled": true|false}`
