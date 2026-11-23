# joorinja_app

ربات تلگرام تأیید و انتشار خبر جوراینجا.

## مسیر پیشنهادی روی سرور

```text
/opt/joorinja_app
```

یا هر مسیری که نام فولدر دقیقاً `joorinja_app` باشد (هم‌نام یوزرنیم ربات).

## اجرا

```bash
cd /opt/joorinja_app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# مقادیر .env را پر کن
python bot.py
```

سرویس systemd نمونه: `joorinja_app.service`
