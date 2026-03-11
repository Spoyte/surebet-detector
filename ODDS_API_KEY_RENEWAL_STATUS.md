# Odds API Key Renewal - Status Report

## Current Status: ✅ OPERATIONAL

**Date:** 2026-03-11
**Project:** surebet-detector
**Config File:** `/root/.openclaw/workspace/surebet-detector/config/.env`

---

## Status Summary

The Odds API key is currently **ACTIVE** and functioning normally.

### Latest API Usage (2026-03-11 19:18 CST):
- **Requests Used:** 161
- **Requests Remaining:** 339
- **Events Fetched:** 16
- **Status:** ✅ Healthy

---

## Recent Improvements

### 2026-03-02: Expanded Bookmaker Coverage
**Issue:** Tennis events only had Pinnacle odds because the fetcher was filtering for French bookmakers only (Unibet, Betclic, Winamax). Tennis events from the API primarily have bookmakers like 888sport, NordicBet, Betsson, MarathonBet, and WilliamHill.

**Fix:** Expanded the bookmaker whitelist in `src/fetcher.js` to include:
- Betsson, NordicBet, 888sport (commonly available for tennis)
- MarathonBet, WilliamHill (additional coverage)
- Betfair, Bet365 (major exchanges/bookmakers)

**Result:** Tennis events now have 2-6 bookmakers each (up from 1), enabling arbitrage detection across all tracked sports.

---

## API Health Monitoring

The system automatically tracks API status and will alert if:
- Quota is exhausted (401 OUT_OF_USAGE_CREDITS)
- Rate limits are exceeded (429)
- Invalid API key errors occur (401)

### Recent Activity:
- ✅ 2026-03-11 19:18 - API responding normally, 16 events fetched, 161 requests used, 339 remaining, 2 +EV opportunities detected
- ✅ 2026-03-04 07:00 - API responding normally, 25 events fetched, 151 requests used, 349 remaining
- ✅ 2026-03-04 06:00 - API responding normally, 31 events fetched, 147 requests used, 353 remaining
- ✅ 2026-03-04 05:30 - API responding normally, 41 events fetched, 146 requests used, 354 remaining
- ✅ 2026-03-04 05:00 - API responding normally, 46 events fetched, 143 requests used, 357 remaining
- ✅ 2026-03-04 04:30 - API responding normally, 44 events fetched, 142 requests used, 358 remaining
- ✅ 2026-03-04 02:00 - API responding normally, 24 events fetched, 131 requests used, 369 remaining
- ✅ 2026-03-04 01:30 - API responding normally, 16 events fetched, 129 requests used, 371 remaining
- ✅ 2026-03-04 01:00 - API responding normally, 16 events fetched, 127 requests used, 373 remaining
- ✅ 2026-03-02 08:30 - API responding normally, 23 events fetched, 55 requests used, 445 remaining
- ✅ 2026-03-02 03:32 - API responding normally, 30 events fetched (after bookmaker expansion fix)
- ✅ 2026-03-02 03:30 - API responding normally, 29 events fetched
- ✅ 2026-03-01 21:30 - API responding normally, 30 events fetched
- ✅ 2026-03-01 21:06 - API responding normally, 29 events fetched
- ✅ 2026-03-01 20:30 - API responding normally

---

## Historical Note

**Previous Issue (2026-02-25):**
The API key previously encountered quota exhaustion with error:
```json
{
  "message": "Usage quota has been reached.",
  "error_code": "OUT_OF_USAGE_CREDITS"
}
```

This was resolved - the quota appears to have reset or the API key was renewed.

---

## Configuration

### Current API Key:
```env
ODDS_API_KEY=7b37cfee9f3c1f4d360a673782722890
```

### Usage Monitoring:
The API returns usage headers with every request:
- `x-requests-remaining`: Credits remaining until quota reset
- `x-requests-used`: Credits used since last reset
- `x-requests-last`: Cost of the last API call

---

## Files That Reference ODDS_API_KEY

1. `/root/.openclaw/workspace/surebet-detector/config/.env` - Main config file
2. `/root/.openclaw/workspace/surebet-detector/config/.env.example` - Example template
3. `/root/.openclaw/workspace/surebet-detector/src/fetcher.js` - Uses the key for API calls
4. `/root/.openclaw/workspace/surebet-detector/src/index.js` - Validates key on startup
5. `/root/.openclaw/workspace/surebet-detector/run-hourly.js` - Loads key from environment

---

## Summary

| Item | Status |
|------|--------|
| Current API Key | ✅ ACTIVE |
| Config File Location | `/root/.openclaw/workspace/surebet-detector/config/.env` |
| Last Check | 2026-03-11 19:18 CST |
| Next Check | Automatic (hourly cron) |

---

*Last updated: 2026-03-11 19:18 by automated hourly check*
