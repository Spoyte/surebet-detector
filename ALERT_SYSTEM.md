# Alert Customization and Filtering System

## Overview
Implemented a comprehensive alert customization and filtering system for the Surebet Detector that allows users to configure their preferences for opportunities, notifications, and display settings.

## Features Implemented

### 1. Alert Configuration Module (`src/alert-config.js`)
- **Persistent Configuration**: Settings saved to `data/alert-config.json`
- **Default Configuration**: Sensible defaults with version tracking
- **Deep Merge**: Ensures all config fields exist even after updates

### 2. Threshold Settings
- **Minimum EV%**: Filter out low-value +EV opportunities (default: 5%)
- **Maximum EV% Cap**: Hide unrealistic values above threshold (default: 100%)
- **Minimum Arbitrage Profit**: Filter small arbitrage opportunities (default: 0.5%)

### 3. Sport Filters
- Enable/disable specific sports (tennis, soccer, basketball, baseball, hockey, american_football)
- Sport-specific odds ranges
- Tournament/league filtering support (extensible)

### 4. Bookmaker Filters
- Enable/disable specific bookmakers
- Require Pinnacle for EV calculation option
- Support for French bookmakers: Unibet, Betclic, Winamax, FDJ, ParionsSport, ZEbet

### 5. Time-based Filters
- Minimum/maximum time to event (in hours)
- Quiet hours with configurable start/end times
- Timezone support

### 6. Alert Delivery Settings
- Telegram alert thresholds (separate from display thresholds)
- Quiet hours respect for notifications
- Daily summary option

### 7. Display Preferences
- Sort by EV, time, or sport
- Group by sport option
- Show/hide suspicious odds
- Maximum results per category

### 8. Advanced Filters
- Minimum bookmaker count requirement
- Exclude live events
- Maximum odds ratio for suspicious detection
- Staleness check for Pinnacle odds

## API Endpoints

### GET `/api/config`
Returns the current alert configuration (public-safe, no sensitive data)

### POST `/api/config`
Updates the alert configuration with new settings

### POST `/api/config/reset`
Resets configuration to default values

### GET `/api/opportunities/filtered`
Returns opportunities with all configured filters applied

## Web Dashboard Updates

### Settings Modal
- Tabbed interface for organized settings:
  - **Thresholds**: EV and arbitrage profit settings
  - **Sports**: Enable/disable sports
  - **Bookmakers**: Bookmaker selection and Pinnacle requirement
  - **Timing**: Time range and quiet hours
  - **Alerts**: Telegram notification settings

### UI Components
- Settings button in navigation and hero section
- Modal with tabbed interface
- Form validation and save/reset functionality
- Real-time preview of settings

## Integration

### Analyzer Integration
- Analyzer now uses `AlertConfig` for filtering opportunities
- Filters applied automatically during analysis
- Respects all user-configured thresholds

### Telegram Integration
- Notifications respect alert thresholds
- Quiet hours are checked before sending
- Separate thresholds for alerts vs display

## Configuration File Location
```
data/alert-config.json
```

## Usage Example

```javascript
const AlertConfig = require('./src/alert-config');

const alertConfig = new AlertConfig();

// Check if a sport is enabled
if (alertConfig.isSportEnabled('tennis')) {
    // Process tennis events
}

// Filter opportunities
const filtered = alertConfig.filterOpportunities(opportunities);

// Check if Telegram alert should be sent
if (alertConfig.shouldSendTelegramAlert(opportunity, 'ev')) {
    // Send notification
}
```

## Future Enhancements
- Per-user configuration (multi-user support)
- Configuration import/export
- Preset configurations (aggressive, conservative, etc.)
- Mobile app settings sync
- Machine learning-based threshold recommendations
