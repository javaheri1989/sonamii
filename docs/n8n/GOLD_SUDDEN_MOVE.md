# Gold sudden-move alerts (candlestick)

Workflow: `Gold | Sudden XAU/USD Movement Alerts` (`KxDygF0Nma3QDI1q`)

## Pipeline
1. Every minute: spot from `https://xaus.com/api/v1/spot?compact=1`
2. Detect sharp 3-minute move from in-memory samples
3. Fetch 1m OHLC: `https://xaus.com/api/v1/chart?range=1d&interval=1m`
4. Build SVG candlestick HTML (~20 minutes)
5. Browserless screenshot → Telegram photo

## Caption
Includes XAUUSD **pips** (1 pip = $0.01) and dollar move, e.g. حرکت صعودی/نزولی: N پیپ (X دلار).

## Scripts
- `gold_alert_detect.js`
- `gold_alert_build_candles.js`
