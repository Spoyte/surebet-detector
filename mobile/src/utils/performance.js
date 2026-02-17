import * as Sentry from './sentry';

/**
 * API Performance Monitor
 * Tracks API call performance and errors
 */
export class ApiMonitor {
  constructor() {
    this.pendingRequests = new Map();
  }

  startRequest(requestId, config) {
    const span = Sentry.startSpan({
      name: `http.${config.method?.toLowerCase() || 'get'}`,
      op: 'http.client',
      description: `${config.method?.toUpperCase() || 'GET'} ${config.url}`,
    });
    
    span.setData('url', config.url);
    span.setData('method', config.method || 'GET');
    
    this.pendingRequests.set(requestId, {
      span,
      startTime: Date.now(),
    });
    
    return span;
  }

  endRequest(requestId, response, error) {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;
    
    const { span, startTime } = request;
    const duration = Date.now() - startTime;
    
    if (error) {
      span.setStatus('error');
      span.setData('error', error.message);
      
      // Log slow failed requests
      if (duration > 5000) {
        Sentry.addBreadcrumb('api', 'Slow failed request', {
          url: span.data?.url,
          duration,
          error: error.message,
        }, 'warning');
      }
    } else {
      span.setStatus('ok');
      span.setData('status_code', response.status);
      span.setData('response_size', JSON.stringify(response.data).length);
      
      // Log slow successful requests
      if (duration > 3000) {
        Sentry.addBreadcrumb('api', 'Slow request', {
          url: span.data?.url,
          duration,
          status: response.status,
        }, 'warning');
      }
    }
    
    span.finish();
    this.pendingRequests.delete(requestId);
  }
}

/**
 * Screen Performance Monitor
 * Tracks screen load times
 */
export class ScreenMonitor {
  constructor() {
    this.screenSpans = new Map();
  }

  startScreenLoad(screenName, params = {}) {
    const span = Sentry.startSpan({
      name: `screen.${screenName}`,
      op: 'navigation',
      description: `Loading ${screenName}`,
    });
    
    span.setData('screen', screenName);
    span.setData('params', params);
    
    this.screenSpans.set(screenName, {
      span,
      startTime: Date.now(),
    });
    
    return span;
  }

  endScreenLoad(screenName, data = {}) {
    const screen = this.screenSpans.get(screenName);
    if (!screen) return;
    
    const { span, startTime } = screen;
    const duration = Date.now() - startTime;
    
    span.setStatus('ok');
    span.setData('load_duration', duration);
    span.setData('render_data', data);
    
    // Alert on slow screen loads
    if (duration > 2000) {
      Sentry.addBreadcrumb('performance', 'Slow screen load', {
        screen: screenName,
        duration,
      }, 'warning');
    }
    
    span.finish();
    this.screenSpans.delete(screenName);
  }

  failScreenLoad(screenName, error) {
    const screen = this.screenSpans.get(screenName);
    if (!screen) return;
    
    const { span } = screen;
    
    span.setStatus('error');
    span.setData('error', error.message);
    span.finish();
    
    this.screenSpans.delete(screenName);
  }
}

/**
 * Custom Performance Metrics
 */
export class PerformanceMetrics {
  static trackAppStartup() {
    const span = Sentry.startSpan({
      name: 'app.startup',
      op: 'app.lifecycle',
      description: 'App cold start',
    });
    
    return {
      finish: (data = {}) => {
        span.setData('startup_data', data);
        span.finish();
      },
    };
  }

  static trackTimeToInteractive() {
    const startTime = Date.now();
    
    return {
      markInteractive: () => {
        const tti = Date.now() - startTime;
        
        Sentry.addBreadcrumb('performance', 'Time to Interactive', {
          tti,
        }, 'info');
        
        // Set as measurement
        Sentry.setMeasurement('tti', tti, 'millisecond');
        
        return tti;
      },
    };
  }

  static trackCustomMetric(name, value, unit = 'millisecond') {
    Sentry.setMeasurement(name, value, unit);
  }
}

/**
 * Error Boundary for React Components
 */
import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    Sentry.captureError(error, {
      extra: {
        componentStack: errorInfo.componentStack,
        component: this.props.componentName || 'Unknown',
      },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return null;
    }

    return this.props.children;
  }
}

// Singleton instances
export const apiMonitor = new ApiMonitor();
export const screenMonitor = new ScreenMonitor();