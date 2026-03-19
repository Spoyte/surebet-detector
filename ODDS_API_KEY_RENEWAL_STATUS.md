# Odds API Key Renewal - Status Report

## Current Status: 🚨 CRITICAL - QUOTA NEARLY EXHAUSTED

**Date:** 2026-03-19
**Project:** surebet-detector
**Config File:** `/root/.openclaw/workspace/surebet-detector/config/.env`

---

## Latest Update (2026-03-19 14:05 CST)

### API Usage:
- **Requests Used:** 491 / 500
- **Requests Remaining:** 9
- **Events Fetched:** 16
- **Polymarket Markets:** 50

### Opportunities Detected:
- **Arbitrage:** 0
- **+EV Opportunities:** 5
  1. AEK Larnaca @ Unibet (+10.29% EV) - Crystal Palace vs AEK Larnaca
  2. Aliaksandra Sasnovich @ Winamax (+8.46% EV) - vs Paula Badosa
  3. Celta Vigo @ Unibet (+6.56% EV) - Celta Vigo vs Lyon
  4. Sigma Olomouc @ Betclic (+5.6% EV) - Sigma Olomouc vs FSV Mainz 05
  5. Draw @ Betclic (+5.26% EV) - Sigma Olomouc vs FSV Mainz 05

### System Health:
- ⚠️ Odds API: CRITICAL (9 requests remaining - ~4 hours left)
- ✅ Polymarket: Healthy
- ✅ Forex API: Healthy

---

## Status Summary

The Odds API key is currently **ACTIVE** but **CRITICALLY LOW** on quota.

### Latest API Usage (2026-03-19 14:05 CST):
- **Requests Used:** 491 / 500
- **Requests Remaining:** 9
- **Events Fetched:** 16
- **Status:** 🚨 CRITICAL - ~4 hours of requests remaining at current rate

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
- 🚨 2026-03-19 14:05 - API responding normally, 16 events fetched, 491 requests used, 9 remaining, 5 +EV opportunities detected
- ⚠️ 2026-03-19 13:32 - API responding normally, 16 events fetched, 490 requests used, 10 remaining, 4 +EV opportunities detected
- ⚠️ 2026-03-19 12:04 - API responding normally, 17 events fetched, 483 requests used, 17 remaining, 5 +EV opportunities detected
- 🚨 2026-03-19 09:36 - API responding normally, 18 events fetched, 479 requests used, 21 remaining, 3 +EV opportunities detected
- ⚠️ 2026-03-19 01:40 - API responding normally, 20 events fetched, 453 requests used, 47 remaining, 3 +EV opportunities detected
- ⚠️ 2026-03-18 21:05 - API responding normally, 17 events fetched, 441 requests used, 59 remaining, 2 +EV opportunities detected
- ⚠️ 2026-03-18 20:32 - API responding normally, 22 events fetched, 440 requests used, 60 remaining, 1 +EV opportunity detected
- ⚠️ 2026-03-18 16:38 - API responding normally, 16 events fetched, 427 requests used, 73 remaining, 0 opportunities detected
- ⚠️ 2026-03-18 12:32 - API responding normally, 16 events fetched, 426 requests used, 74 remaining, 0 opportunities detected
- ⚠️ 2026-03-18 06:33 - API responding normally, 24 events fetched, 425 requests used, 75 remaining, 2 +EV opportunities detected
- ✅ 2026-03-15 23:36 - API responding normally, 41 events fetched, 319 requests used, 179 remaining
- ✅ 2026-03-15 21:36 - API responding normally, 35 events fetched, 319 requests used, 181 remaining

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
| Current API Key | 🚨 CRITICAL (9 remaining) |
| Config File Location | `/root/.openclaw/workspace/surebet-detector/config/.env` |
| Last Check | 2026-03-19 14:05 CST |
| Next Check | Automatic (hourly cron) |
| Action Needed | **RENEW API KEY IMMEDIATELY** - only ~4 hours remaining |

---

*Last updated: 2026-03-19 14:05 by automated hourly check*
