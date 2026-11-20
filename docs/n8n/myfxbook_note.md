## Myfxbook Sentiment (test)
Retail long/short for XAUUSD, EURUSD, GBPUSD (#تست). Trigger every minute:
1) Skip Sat/Sun (America/New_York) and USD/EUR bank holidays.
2) If the NY day has High-impact USD/EUR timed news → publish once, exactly 5 minutes before the FIRST such event (no NY-session fallback that day).
3) Otherwise → publish 5 minutes before New York forex open (08:00 America/New_York).
Uses ffCalendarCacheV1 from Calendar Alert. Deduped via data table event_id. Login password stays in Myfxbook API credential.