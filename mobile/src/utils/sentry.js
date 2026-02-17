import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = process.env.SENTRY_DSN || Constants.expoConfig?.extra?.sentryDsn;

export const initSentry = () => {
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    
    // Performance monitoring - sample all transactions in dev, 10% in prod
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    
    // Session replay
    replaysSessionSampleRate: __DEV__ ? 1.0 : 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Enable native crash handling
    enableNativeCrashHandling: true,
    enableNative: true,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    
    // Attach stack traces
    attachStacktrace: true,
    attachThreads: true,
    
    // Debug mode in development
    debug: __DEV__,
    
    // Release information
    release: `${Constants.expoConfig?.version || '1.0.0'}`,
    dist: `${Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1'}`,
    
    // Before send hook for filtering
    beforeSend: (event) => {
      return filterEvent(event);
    },
    
    // Integrations
    integrations: (integrations) => {
      return integrations.filter(integration => {
        // Disable console breadcrumb in production to reduce noise
        if (integration.name === 'Console' && !__DEV__) {
          return false;
        }
        return true;
      });
    },
  });

  // Set initial tags
  Sentry.setTag('app.version', Constants.expoConfig?.version || '1.0.0');
  Sentry.setTag('app.platform', Constants.platform?.ios ? 'ios' : 'android');
};

const filterEvent = (event) => {
  const errorMessage = event.exception?.values?.[0]?.value || '';
  const errorType = event.exception?.values?.[0]?.type || '';
  
  // Filter out known non-critical errors
  const filteredPatterns = [
    // Network errors during offline mode
    { pattern: /Network request failed/i, condition: () => !navigator?.onLine },
    // Aborted requests
    { pattern: /AbortError|Cancelled/i },
    // Timeout errors (handled gracefully)
    { pattern: /timeout|ETIMEDOUT/i },
    // Expected auth errors
    { pattern: /Unauthorized|401/i, condition: () => event.tags?.endpoint === '/auth/refresh' },
  ];
  
  for (const { pattern, condition } of filteredPatterns) {
    if (pattern.test(errorMessage) || pattern.test(errorType)) {
      if (!condition || condition()) {
        return null;
      }
    }
  }
  
  // Scrub sensitive data
  if (event.request?.headers) {
    delete event.request.headers['Authorization'];
    delete event.request.headers['X-API-Key'];
  }
  
  if (event.request?.data) {
    try {
      const data = JSON.parse(event.request.data);
      if (data.password) data.password = '[REDACTED]';
      if (data.token) data.token = '[REDACTED]';
      if (data.apiKey) data.apiKey = '[REDACTED]';
      event.request.data = JSON.stringify(data);
    } catch {
      // Not JSON, leave as is
    }
  }
  
  return event;
};

// Performance monitoring helpers
export const startTransaction = (name, op) => {
  return Sentry.startTransaction({ name, op });
};

export const startSpan = (context) => {
  return Sentry.startSpan(context);
};

export const withSpan = async (name, operation, fn) => {
  return Sentry.withSpan({ name, op: operation }, fn);
};

// User context
export const setUser = (user) => {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username || user.email,
  });
  
  // Set additional context
  Sentry.setContext('user_preferences', {
    currency: user.preferences?.currency,
    notifications: user.preferences?.notifications,
    language: user.preferences?.language,
  });
  
  Sentry.setContext('subscription', {
    tier: user.subscription?.tier,
    status: user.subscription?.status,
    expiryDate: user.subscription?.expiryDate,
  });
};

// Breadcrumbs
export const addBreadcrumb = (category, message, data = {}, level = 'info') => {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: Sentry.Severity[level.toUpperCase()] || Sentry.Severity.Info,
  });
};

// Error capture
export const captureError = (error, context = {}) => {
  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    
    if (context.level) {
      scope.setLevel(Sentry.Severity[context.level.toUpperCase()]);
    }
    
    Sentry.captureException(error);
  });
};

export const captureMessage = (message, level = 'info', context = {}) => {
  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    
    scope.setLevel(Sentry.Severity[level.toUpperCase()]);
    Sentry.captureMessage(message);
  });
};

// Navigation tracking
export const createNavigationInstrumentation = () => {
  return new Sentry.ReactNavigationInstrumentation({
    routeChangeTimeoutMs: 1000,
  });
};

// Export Sentry for direct access if needed
export { Sentry };