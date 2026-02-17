import * as Sentry from '@sentry/react-native';
import { apiMonitor, screenMonitor } from './performance';

/**
 * Axios interceptor for automatic API performance tracking
 */
export const createSentryAxiosInterceptor = (axiosInstance) => {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config) => {
      const requestId = `${Date.now()}-${Math.random()}`;
      config.metadata = { requestId, startTime: Date.now() };
      
      apiMonitor.startRequest(requestId, {
        url: config.url,
        method: config.method,
      });
      
      return config;
    },
    (error) => {
      Sentry.captureError(error, {
        tags: { type: 'request_interceptor' },
      });
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response) => {
      const { requestId } = response.config.metadata || {};
      if (requestId) {
        apiMonitor.endRequest(requestId, response, null);
      }
      return response;
    },
    (error) => {
      const { requestId } = error.config?.metadata || {};
      if (requestId) {
        apiMonitor.endRequest(requestId, null, error);
      }
      
      // Capture API errors
      if (error.response) {
        Sentry.captureError(error, {
          tags: {
            type: 'api_error',
            status: error.response.status,
            endpoint: error.config?.url,
          },
          extra: {
            response_data: error.response.data,
            request_data: error.config?.data,
          },
        });
      }
      
      return Promise.reject(error);
    }
  );

  return axiosInstance;
};

/**
 * React Navigation instrumentation with performance tracking
 */
export const createNavigationInstrumentation = () => {
  const instrumentation = new Sentry.ReactNavigationInstrumentation({
    routeChangeTimeoutMs: 1000,
  });

  // Wrap the original onRouteChange
  const originalOnRouteChange = instrumentation.onRouteChange?.bind(instrumentation);
  
  instrumentation.onRouteChange = (route) => {
    // Track screen performance
    screenMonitor.startScreenLoad(route.name, route.params);
    
    // Add breadcrumb
    Sentry.addBreadcrumb({
      category: 'navigation',
      message: `Navigated to ${route.name}`,
      data: {
        screen: route.name,
        params: route.params,
      },
      level: Sentry.Severity.Info,
    });
    
    if (originalOnRouteChange) {
      originalOnRouteChange(route);
    }
  };

  return instrumentation;
};

/**
 * Redux middleware for state change tracking
 */
export const sentryReduxMiddleware = (store) => (next) => (action) => {
  const startTime = Date.now();
  
  // Track specific action types
  const trackActions = [
    'auth/loginSuccess',
    'auth/logout',
    'bets/placeBet',
    'opportunities/fetchSuccess',
  ];
  
  const result = next(action);
  
  if (trackActions.includes(action.type)) {
    const duration = Date.now() - startTime;
    
    Sentry.addBreadcrumb({
      category: 'redux',
      message: `Action: ${action.type}`,
      data: {
        action: action.type,
        duration,
        timestamp: new Date().toISOString(),
      },
      level: Sentry.Severity.Info,
    });
    
    // Track slow actions
    if (duration > 100) {
      Sentry.captureMessage(
        `Slow Redux action: ${action.type}`,
        'warning',
        {
          extra: {
            action: action.type,
            duration,
          },
        }
      );
    }
  }
  
  return result;
};

/**
 * AsyncStorage wrapper with error tracking
 */
export const createSentryAsyncStorage = (AsyncStorage) => {
  return {
    getItem: async (key) => {
      try {
        const value = await AsyncStorage.getItem(key);
        return value;
      } catch (error) {
        Sentry.captureError(error, {
          tags: { operation: 'AsyncStorage.getItem', key },
        });
        throw error;
      }
    },
    
    setItem: async (key, value) => {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (error) {
        Sentry.captureError(error, {
          tags: { operation: 'AsyncStorage.setItem', key },
        });
        throw error;
      }
    },
    
    removeItem: async (key) => {
      try {
        await AsyncStorage.removeItem(key);
      } catch (error) {
        Sentry.captureError(error, {
          tags: { operation: 'AsyncStorage.removeItem', key },
        });
        throw error;
      }
    },
  };
};

/**
 * WebSocket connection monitor
 */
export class WebSocketMonitor {
  constructor(url) {
    this.url = url;
    this.connectionSpan = null;
  }

  connect() {
    this.connectionSpan = Sentry.startSpan({
      name: 'websocket.connect',
      op: 'websocket',
      description: `Connecting to ${this.url}`,
    });
    
    Sentry.addBreadcrumb({
      category: 'websocket',
      message: 'Connecting',
      data: { url: this.url },
      level: Sentry.Severity.Info,
    });
  }

  connected() {
    if (this.connectionSpan) {
      this.connectionSpan.setStatus('ok');
      this.connectionSpan.finish();
      this.connectionSpan = null;
    }
    
    Sentry.addBreadcrumb({
      category: 'websocket',
      message: 'Connected',
      data: { url: this.url },
      level: Sentry.Severity.Info,
    });
  }

  disconnected(reason) {
    Sentry.addBreadcrumb({
      category: 'websocket',
      message: 'Disconnected',
      data: { url: this.url, reason },
      level: Sentry.Severity.Warning,
    });
  }

  error(error) {
    Sentry.captureError(error, {
      tags: { type: 'websocket_error', url: this.url },
    });
  }

  messageReceived(type, size) {
    Sentry.addBreadcrumb({
      category: 'websocket',
      message: `Message received: ${type}`,
      data: { type, size },
      level: Sentry.Severity.Debug,
    });
  }
}