# Sentry Performance Monitoring Setup for Surebet Mobile

This document describes the Sentry integration for error tracking, performance monitoring, and crash analytics.

## Features

- **Error Tracking**: Automatic capture of JavaScript and native crashes
- **Performance Monitoring**: Track app startup, navigation, and API call performance
- **Crash Analytics**: Real-time crash reporting with stack traces and device info
- **Breadcrumbs**: Automatic breadcrumb collection for debugging
- **User Feedback**: In-app error reporting
- **Release Health**: Track crash-free users and sessions

## Installation

```bash
# Using expo
npx expo install @sentry/react-native

# Or with npm
npm install @sentry/react-native
```

## Configuration

### 1. Initialize Sentry

Create `src/utils/sentry.js`:

```javascript
import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '@env';

export const initSentry = () => {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    
    // Performance monitoring
    tracesSampleRate: 1.0,
    
    // Session replay for errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Enable native crash reporting
    enableNativeCrashHandling: true,
    enableNative: true,
    
    // Attach stack traces
    attachStacktrace: true,
    
    // Before send hook for filtering
    beforeSend: (event) => {
      // Filter out known non-critical errors
      if (shouldFilterError(event)) {
        return null;
      }
      return event;
    },
    
    // Release information
    release: `${Constants.expoConfig?.version || '1.0.0'}`,
    dist: `${Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1'}`,
  });
};

const shouldFilterError = (event) => {
  const errorMessage = event.exception?.values?.[0]?.value || '';
  
  // Filter network errors during offline mode
  if (errorMessage.includes('Network request failed') && !navigator.onLine) {
    return true;
  }
  
  return false;
};
```

### 2. Wrap App Component

Update `App.js`:

```javascript
import * as Sentry from '@sentry/react-native';
import { initSentry } from './src/utils/sentry';

// Initialize Sentry before app renders
initSentry();

function App() {
  return (
    <NavigationContainer>
      {/* App content */}
    </NavigationContainer>
  );
}

// Wrap with Sentry error boundary
export default Sentry.wrap(App);
```

### 3. Navigation Instrumentation

```javascript
import * as Sentry from '@sentry/react-native';
import { NavigationContainer } from '@react-navigation/native';

const routingInstrumentation = new Sentry.ReactNavigationInstrumentation();

Sentry.init({
  // ... other config
  integrations: [
    new Sentry.ReactNativeTracing({
      routingInstrumentation,
      tracePropagationTargets: ['localhost', /https:\/\/api\.surebet\.com/],
    }),
  ],
});

// In your NavigationContainer
<NavigationContainer
  ref={navigationRef}
  onReady={() => {
    routingInstrumentation.registerNavigationContainer(navigationRef);
  }}
>
```

### 4. Custom Performance Spans

```javascript
import * as Sentry from '@sentry/react-native';

// Track API calls
export const trackApiCall = async (operation, apiCall) => {
  const transaction = Sentry.startTransaction({
    name: `api.${operation}`,
    op: 'http.client',
  });
  
  Sentry.getCurrentHub().configureScope(scope => {
    scope.setSpan(transaction);
  });
  
  try {
    const result = await apiCall();
    transaction.setStatus('ok');
    return result;
  } catch (error) {
    transaction.setStatus('error');
    Sentry.captureException(error);
    throw error;
  } finally {
    transaction.finish();
  }
};

// Track screen load time
export const trackScreenLoad = (screenName, loadFunction) => {
  const transaction = Sentry.startTransaction({
    name: `screen.${screenName}`,
    op: 'navigation',
  });
  
  return loadFunction().finally(() => {
    transaction.finish();
  });
};
```

### 5. User Context

```javascript
import * as Sentry from '@sentry/react-native';

export const setUserContext = (user) => {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
  
  Sentry.setContext('subscription', {
    tier: user.subscriptionTier,
    expiryDate: user.subscriptionExpiry,
  });
  
  Sentry.setContext('preferences', {
    currency: user.preferences?.currency,
    notifications: user.preferences?.notifications,
  });
};

export const clearUserContext = () => {
  Sentry.setUser(null);
};
```

### 6. Breadcrumb Logging

```javascript
import * as Sentry from '@sentry/react-native';

export const logBreadcrumb = (category, message, data = {}) => {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: Sentry.Severity.Info,
  });
};

// Usage examples
logBreadcrumb('auth', 'User logged in', { method: 'biometric' });
logBreadcrumb('bet', 'Bet placed', { stake: 100, odds: 2.5 });
logBreadcrumb('api', 'Odds updated', { bookmaker: 'bet365', sport: 'tennis' });
```

## Environment Variables

Add to `.env`:

```
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=your_auth_token
```

## Source Maps

### Upload during build

Add to `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "@sentry/react-native/expo",
        {
          "organization": "your-org",
          "project": "surebet-mobile",
          "authToken": "${SENTRY_AUTH_TOKEN}"
        }
      ]
    ]
  }
}
```

## Dashboard Metrics

Monitor these key metrics in Sentry:

1. **Crash-Free Session Rate**: Target > 99%
2. **Crash-Free User Rate**: Target > 99%
3. **App Startup Time**: Target < 2 seconds
4. **API Response Time**: Track p50, p95, p99
5. **Cold Start Count**: Monitor for ANR issues

## Alerting

Configure alerts for:

- New issues introduced in release
- Crash-free rate drops below 99%
- Error count spike (> 100% increase)
- Performance regression (> 20% slower)

## Privacy

- PII is automatically scrubbed
- User IDs are hashed
- Financial data is excluded from reports
- IP addresses are anonymized