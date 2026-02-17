# Surebet Mobile - E2E Testing Suite

This directory contains end-to-end tests for the Surebet Mobile application using Detox.

## Test Coverage

### Authentication (`auth.test.js`)
- Login screen display and validation
- Valid/invalid credential handling
- Biometric authentication (Face ID/Touch ID)
- App resume biometric prompts
- Password fallback

### Opportunities (`opportunities.test.js`)
- Opportunities list display
- Pull-to-refresh functionality
- Sport and profit filtering
- Navigation to opportunity details
- Empty state handling
- Opportunity detail view
- Stake calculation
- Bookmarking and sharing

### Bet Placement (`bet-placement.test.js`)
- Quick bet screen
- One-tap stake entry
- Swipe-to-confirm
- Bet placement loading states
- Success/failure handling
- Dutching calculator
- Kelly Criterion integration

### Offline Mode (`offline.test.js`)
- Offline indicator display
- Cached data persistence
- Action queuing for sync
- Data sync on reconnection
- App state persistence
- Screen restoration after background

### Navigation (`navigation.test.js`)
- Dashboard display
- Tab navigation
- Profit charts
- Recent activity
- Bets history
- Bet filtering
- Bet details

## Running Tests

### Prerequisites
```bash
# Install Detox CLI globally
npm install -g detox-cli

# Install dependencies
npm install

# For iOS - install pods
cd ios && pod install && cd ..
```

### Build the App
```bash
# iOS Debug
detox build --configuration ios

# iOS Release
detox build --configuration ios.release

# Android Debug
detox build --configuration android

# Android Release
detox build --configuration android.release
```

### Run Tests
```bash
# Run all tests on iOS
detox test --configuration ios

# Run specific test file
detox test --configuration ios e2e/auth.test.js

# Run with artifacts (screenshots/videos on failure)
detox test --configuration ios --artifacts-location ./artifacts

# Run with headless emulator/simulator
detox test --configuration ios --headless

# Run with verbose logging
detox test --configuration ios --loglevel verbose
```

## Test IDs

The following test IDs are used in the app for E2E testing:

### Screens
- `login-screen`
- `dashboard-screen`
- `opportunities-screen`
- `opportunity-detail-screen`
- `quick-bet-screen`
- `bets-screen`
- `bet-detail-screen`
- `profile-screen`

### Authentication
- `email-input`
- `password-input`
- `login-button`
- `biometric-button`
- `biometric-guard`
- `use-password-button`
- `password-confirm-input`

### Navigation
- `dashboard-tab`
- `opportunities-tab`
- `bets-tab`
- `quick-bet-tab`
- `profile-tab`

### Opportunities
- `opportunities-list`
- `opportunity-item-{index}`
- `filter-button`
- `sport-filter-{sport}`
- `min-profit-slider`
- `min-profit-input`
- `apply-filters`
- `empty-state`

### Bet Placement
- `opportunity-card`
- `preset-stake-{amount}`
- `stake-display`
- `confirm-slider`
- `bet-confirmation`
- `placing-bet-indicator`
- `bet-success`
- `bet-error`
- `retry-button`

### Calculator
- `total-stake-input`
- `calculate-button`
- `stake-bookmaker-{n}`
- `guaranteed-profit`
- `kelly-toggle`
- `bankroll-input`
- `kelly-stake`
- `kelly-fraction`

### Offline
- `offline-indicator`
- `offline-badge`
- `queued-indicator`
- `syncing-indicator`
- `sync-success`
- `sync-complete`

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Run E2E Tests
  run: |
    detox build --configuration ios.release
    detox test --configuration ios.release --headless
```

## Troubleshooting

### Tests failing on startup
- Ensure the app builds successfully first
- Check that test IDs match between app and tests
- Verify simulator/emulator is available

### Biometric tests failing
- Biometric tests require simulator with enrolled Face ID/Touch ID
- Use `device.matchFace()` or `device.matchFinger()` appropriately

### Network-related tests
- Use `device.setWiFi(false)` to simulate offline
- Use `device.setURLBlacklist()` to block specific endpoints