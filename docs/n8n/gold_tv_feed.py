#!/usr/bin/env python3
"""Gold OHLC/spot feed from TradingView (OANDA:XAUUSD) for n8n gold alerts."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json, time, threading, urllib.request, urllib.parse
from datetime import datetime, timezone
import websocket

SYMBOL = 'OANDA:XAUUSD'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
CACHE_TTL = 20
_lock = threading.Lock()
_cache = {'bars': [], 'at': 0.0, 'err': None}

def wrap(obj):
    s = json.dumps(obj, separators=(',', ':'))
    return f'~m~{len(s)}~m~{s}'

def unwrap(msg):
    out = []; i = 0
    while i < len(msg):
        if not msg.startswith('~m~', i):
            break
        i += 3
        j = msg.find('~m~', i)
        if j < 0:
            break
        n = int(msg[i:j]); i = j + 3
        out.append(msg[i:i + n]); i += n
    return out

def fetch_tv_bars(count=400):
    ws = websocket.create_connection(
        'wss://data.tradingview.com/socket.io/websocket',
        header=[f'User-Agent: {UA}', 'Origin: https://www.tradingview.com'],
        timeout=25,
    )
    try:
        ws.recv()
        ws.send(wrap({'m': 'set_auth_token', 'p': ['unauthorized_user_token']}))
        ws.send(wrap({'m': 'chart_create_session', 'p': ['cs_xau', '']}))
        ws.send(wrap({'m': 'resolve_symbol', 'p': ['cs_xau', 'sds_sym_1', '=' + json.dumps({'symbol': SYMBOL, 'adjustment': 'splits'})]}))
        ws.send(wrap({'m': 'create_series', 'p': ['cs_xau', 'sds_1', 's1', 'sds_sym_1', '1', int(count)]}))
        bars = None
        deadline = time.time() + 25
        while time.time() < deadline:
            msg = ws.recv()
            if isinstance(msg, bytes):
                msg = msg.decode('utf-8', 'ignore')
            if msg.startswith('~h~'):
                ws.send(msg); continue
            for part in unwrap(msg):
                if part.startswith('~h~'):
                    ws.send(f'~m~{len(part)}~m~{part}'); continue
                try:
                    obj = json.loads(part)
                except Exception:
                    continue
                m = obj.get('m'); p = obj.get('p')
                if m == 'series_error':
                    raise RuntimeError('TradingView series_error: ' + str(p))
                if m in ('timescale_update', 'du') and isinstance(p, list) and len(p) > 1 and isinstance(p[1], dict):
                    for v in p[1].values():
                        if isinstance(v, dict) and isinstance(v.get('s'), list) and v['s']:
                            bars = v['s']
            if bars and len(bars) >= 50:
                break
        if not bars:
            raise RuntimeError('TradingView returned no bars for ' + SYMBOL)
        points = []
        for row in bars:
            v = row.get('v') if isinstance(row, dict) else None
            if not v or len(v) < 5:
                continue
            points.append({
                't': int(v[0]),
                'o': float(v[1]), 'h': float(v[2]), 'l': float(v[3]), 'c': float(v[4]),
                'v': float(v[5] if len(v) > 5 else 0),
            })
        if len(points) < 50:
            raise RuntimeError('Not enough parsed bars')
        return points
    finally:
        try: ws.close()
        except Exception: pass

def fetch_tv_quote():
    url = 'https://scanner.tradingview.com/symbol?symbol=' + urllib.parse.quote(SYMBOL) + '&fields=open%2Chigh%2Clow%2Cclose%2Cdescription%2Cexchange%2Cpricescale'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())

def get_bars(force=False):
    with _lock:
        if not force and _cache['bars'] and time.time() - _cache['at'] < CACHE_TTL:
            return _cache['bars']
    bars = fetch_tv_bars()
    with _lock:
        _cache['bars'] = bars
        _cache['at'] = time.time()
        _cache['err'] = None
    return bars

def iso_now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

def chart_payload():
    points = get_bars()
    as_of = iso_now()
    return {
        'symbol': 'XAUUSD',
        'label': 'Gold (XAU/USD)',
        'range': '1d',
        'interval': '1m',
        'currency': 'USD',
        'points': points,
        'data_state': {
            'status': 'fresh',
            'as_of': as_of,
            'source': 'tradingview:OANDA',
            'broker': 'OANDA',
            'tv_symbol': SYMBOL,
            'age_seconds': 0,
        },
    }

def spot_payload():
    points = get_bars()
    last = points[-1]
    price = float(last['c'])
    quote = None
    try:
        quote = fetch_tv_quote()
        qclose = quote.get('close') if isinstance(quote, dict) else None
        if qclose is not None and float(qclose) > 0:
            price = float(qclose)
    except Exception:
        pass
    as_of = iso_now()
    return {
        'xau': {'price': price, 'currency': 'USD', 'unit': 'troy_oz'},
        'spot_usd_oz': price,
        'updated_at': as_of,
        'price_as_of': as_of,
        'stale': False,
        'data_state': {
            'status': 'fresh',
            'as_of': as_of,
            'source': 'tradingview:OANDA',
            'broker': 'OANDA',
            'tv_symbol': SYMBOL,
            'age_seconds': 0,
        },
        'quote': quote,
    }

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print('[%s] %s' % (self.log_date_time_string(), fmt % args), flush=True)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            if path == '/health':
                self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.end_headers(); self.wfile.write(b'ok'); return
            if path in ('/spot', '/api/v1/spot'):
                self._json(200, spot_payload()); return
            if path in ('/chart', '/api/v1/chart'):
                self._json(200, chart_payload()); return
            self.send_response(404); self.end_headers()
        except Exception as e:
            with _lock:
                _cache['err'] = str(e)
            self._json(502, {'ok': False, 'error': str(e), 'source': 'tradingview:OANDA'})

if __name__ == '__main__':
    print('gold-tv-feed OANDA:XAUUSD on 0.0.0.0:18766', flush=True)
    ThreadingHTTPServer(('0.0.0.0', 18766), H).serve_forever()
