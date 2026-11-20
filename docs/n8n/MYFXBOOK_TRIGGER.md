# Myfxbook sentiment trigger (n8n)

Applied on server workflow `00 - Forex Factory | Daily High-Impact Events` (id `MJAh6P1RKwRBDygw`).

## Behavior

- Poll every minute (`Myfxbook - Every Minute`).
- Skip Saturday/Sunday in `America/New_York`.
- Skip the whole day if FF calendar has a USD or EUR **Bank Holiday** on that NY day.
- If the NY day has any High-impact timed **USD/EUR** news: publish once, exactly **5 minutes before the first** such event. No NY-session fallback that day.
- Otherwise: publish **5 minutes before** New York forex open (`08:00 America/New_York`).
- Still tagged `#تست`. Deduped with data-table `event_id`.
- Calendar source: shared `ffCalendarCacheV1` (filled by Calendar Alert branch).

## Node chain

`Every Minute` → `Decide Trigger` → `Only Unsent Trigger` → Login → Outlook → Format → Telegram → Record message → Record trigger

## Reference copies

- `myfxbook_decide_trigger.js`
- `myfxbook_format.js`
- `myfxbook_note.md`

Server backups: `/opt/n8n/backups/myfxbook/`
