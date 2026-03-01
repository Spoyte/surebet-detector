# Odds API Key Renewal - Status Report

## Current Status: ✅ OPERATIONAL

**Date:** 2026-03-02  
**Project:** surebet-detector  
**Config File:** `/root/.openclaw/workspace/surebet-detector/config/.env`

---

## Status Summary

The Odds API key is currently **ACTIVE** and functioning normally.

### Latest API Usage (2026-03-02 03:30 CST):
- **Requests Used:** 45
- **Requests Remaining:** 455
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
| Last Check | 2026-03-01 21:30 CST |
| Next Check | Automatic (hourly cron) |

---

*Last updated: 2026-03-01 by automated hourly check*
