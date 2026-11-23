# Gold sudden-move alerts (TradingView · OANDA)

Workflow: `Gold | Sudden XAU/USD Movement Alerts` (`KxDygF0Nma3QDI1q`)

## Candle / spot source
Live OHLC and spot come from **TradingView WebSocket** for `OANDA:XAUUSD` via host service:

- Script: `gold_tv_feed.py` (systemd: `gold-tv-feed.service`)
- Listen: `0.0.0.0:18766`
- Endpoints: `/spot`, `/chart`, `/health` (XAUS-shaped JSON)
- Broker: **OANDA** (major FX broker feed on TradingView)

n8n reaches the feed at `http://172.18.0.1:18766/...` (Docker bridge gateway).

## Pipeline
1. Every minute: spot from `http://172.18.0.1:18766/spot`
2. Detect sharp 3-minute move from in-memory samples
3. Fetch 1m OHLC: `http://172.18.0.1:18766/chart`
4. Build HTML with **TradingView Lightweight Charts™** (60–120 × 1m candles, price/time scales, measure/ruler in USD)
5. Browserless screenshot → Telegram photo

## Ruler (TradingView measure)
Box format matches TV: `Δprice (Δ%) points` + `N bars, Nm`.
- 1 pip = `$0.01` (= TV measure third number / points)
- 1 pipette = `$0.001` (OANDA `pricescale=1000`)
Label is placed in empty chart space beside the measure band.

## Caption
Includes XAUUSD **pips** (1 pip = $0.01), dollar move, and attribution:
`منبع: TradingView · OANDA`.

## Scripts
- `gold_tv_feed.py` — TradingView OANDA feed proxy
- `gold_alert_detect.js`
- `gold_alert_build_candles.js`
