# Odds API Key Renewal - Status Report

## Current Status: ⚠️ LOW QUOTA

**Date:** 2026-03-18
**Project:** surebet-detector
**Config File:** `/root/.openclaw/workspace/surebet-detector/config/.env`

---

## Status Summary

The Odds API key is currently **ACTIVE** but running low on quota.

### Latest API Usage (2026-03-18 16:38 CST):
- **Requests Used:** 427
- **Requests Remaining:** 73
- **Events Fetched:** 16
- **Status:** ⚠️ Low Quota (73 requests remaining)

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
- ⚠️ 2026-03-18 16:38 - API responding normally, 16 events fetched, 427 requests used, 73 remaining, 0 opportunities detected
- ⚠️ 2026-03-18 12:32 - API responding normally, 16 events fetched, 426 requests used, 74 remaining, 0 opportunities detected
- ⚠️ 2026-03-18 06:33 - API responding normally, 24 events fetched, 425 requests used, 75 remaining, 2 +EV opportunities detected (Tirante @ Unibet +5.58%, Tirante @ Winamax +6.6%)
- ✅ 2026-03-15 23:36 - API responding normally, 41 events fetched, 321 requests used, 179 remaining, 1 +EV opportunity detected (Aalesund @ Unibet +7.37% EV)
- ✅ 2026-03-15 21:36 - API responding normally, 35 events fetched, 319 requests used, 181 remaining, 1 +EV opportunity detected (Bologna vs Sassuolo Draw @ Unibet +5.02% EV)
- ✅ 2026-03-15 13:38 - API responding normally, 12 events fetched, 293 requests used, 207 remaining, 2 +EV opportunities detected (Macarthur FC +5.91% EV, SGS Essen +30.62% EV)
- ✅ 2026-03-15 11:31 - API responding normally, 14 events fetched, 283 requests used, 217 remaining, 1 +EV opportunity detected (Macarthur FC @ Unibet +5.91% EV)
- ✅ 2026-03-14 15:32 - API responding normally, 18 events fetched, 233 requests used, 267 remaining, 1 +EV opportunity detected (Draw @ Unibet +6.06% EV)
- ✅ 2026-03-12 03:21 - API responding normally, 19 events fetched, 165 requests used, 335 remaining, 1 +EV opportunity detected (Bradford City +6.44% EV)
- ✅ 2026-03-11 20:48 - API responding normally, 16 events fetched, 163 requests used, 337 remaining, 2 +EV opportunities detected (Bayer Leverkusen +14.5% EV)
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
| Current API Key | ⚠️ LOW QUOTA (73 remaining) |
| Config File Location | `/root/.openclaw/workspace/surebet-detector/config/.env` |
| Last Check | 2026-03-18 16:38 CST |
| Next Check | Automatic (hourly cron) |
| Action Needed | Consider API key renewal soon |

---

*Last updated: 2026-03-18 16:38 by automated hourly check*
