# Odds API Key Renewal - Status Report

## Current Status: ⚠️ API QUOTA EXHAUSTED

**Date:** 2026-02-25  
**Project:** surebet-detector  
**Config File:** `/root/.openclaw/workspace/surebet-detector/config/.env`

---

## Issue Summary

The current Odds API key (`7b37cfee9f3c1f4d360a673782722890`) has reached its usage quota limit.

### Error Details:
```json
{
  "message": "Usage quota has been reached. See usage plans at https://the-odds-api.com",
  "error_code": "OUT_OF_USAGE_CREDITS",
  "details_url": "https://the-odds-api.com/liveapi/guides/v4/api-error-codes.html#out-of-usage-credits"
}
```

---

## Impact on surebet-detector

Without a valid API key:
- ❌ Cannot fetch live odds from The Odds API (Unibet, Betclic, Pinnacle, etc.)
- ⚠️ System falls back to cached data (stale odds)
- ⚠️ Only Polymarket data remains functional
- ❌ No new arbitrage/+EV opportunities can be detected

---

## Action Required: Obtain New API Key

Since I cannot browse the web or create accounts, **you need to obtain a new API key manually**.

### Steps to Get a New API Key:

1. **Visit:** https://the-odds-api.com/

2. **Sign up or Log in** to your account
   - If you already have an account, log in at: https://the-odds-api.com/account/
   - If not, create a new account

3. **Choose a Plan:**
   - **Free Plan:** 500 requests/month (what was previously used)
   - **Paid Plans:** Start at $29/month for higher limits
   - View all plans at: https://the-odds-api.com/#get-access

4. **Generate/Copy your API Key** from the account dashboard

5. **Update the configuration file** (see below)

---

## Configuration Update Instructions

### File to Update:
```
/root/.openclaw/workspace/surebet-detector/config/.env
```

### Current Configuration:
```env
ODDS_API_KEY=7b37cfee9f3c1f4d360a673782722890
```

### Update To:
```env
ODDS_API_KEY=YOUR_NEW_API_KEY_HERE
```

Replace `YOUR_NEW_API_KEY_HERE` with the new API key from your The Odds API account.

---

## Testing the New API Key

After updating the config, test the API key with:

```bash
curl "https://api.the-odds-api.com/v4/sports/tennis/odds?apiKey=YOUR_NEW_API_KEY&regions=eu&markets=h2h&oddsFormat=decimal"
```

Expected successful response: JSON array of tennis events with odds data.

---

## Additional Notes

### API Usage Monitoring:
The API returns usage headers with every request:
- `x-requests-remaining`: Credits remaining until quota reset
- `x-requests-used`: Credits used since last reset
- `x-requests-last`: Cost of the last API call

### Quota Reset:
Usage quotas reset monthly based on your subscription billing cycle.

### Troubleshooting High Usage:
If you hit the quota quickly, check:
- The hourly cron job may be running too frequently
- Multiple instances of the app running simultaneously
- API key accidentally committed to public repository (regenerate if suspected)

---

## Files That Reference ODDS_API_KEY

1. `/root/.openclaw/workspace/surebet-detector/config/.env` - **Main config file (UPDATE THIS)**
2. `/root/.openclaw/workspace/surebet-detector/config/.env.example` - Example template
3. `/root/.openclaw/workspace/surebet-detector/src/fetcher.js` - Uses the key for API calls
4. `/root/.openclaw/workspace/surebet-detector/src/index.js` - Validates key on startup
5. `/root/.openclaw/workspace/surebet-detector/run-hourly.js` - Loads key from environment

---

## Summary

| Item | Status |
|------|--------|
| Current API Key | ❌ EXHAUSTED (OUT_OF_USAGE_CREDITS) |
| Config File Location | `/root/.openclaw/workspace/surebet-detector/config/.env` |
| Action Required | User must obtain new API key from https://the-odds-api.com/ |
| Estimated Time | 5-10 minutes to sign up and get new key |
| Cost | Free tier available (500 req/month) |

---

**Next Step:** Visit https://the-odds-api.com/ to obtain a new API key and update `config/.env`.
