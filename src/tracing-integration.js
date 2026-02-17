/**
 * Distributed Tracing Integration for Surebet Microservices
 * 
 * Pre-configured tracers and middleware for each microservice.
 */

import {
  Tracer,
  JaegerExporter,
  ProbabilitySampler,
  BatchSpanProcessor,
  createTracingMiddleware,
  createTracedHttpClient,
  createTracedMessageProducer,
  createTracedMessageConsumer,
  createTracedDatabase,
  createTracedRedis,
  initGlobalTracer
} from './distributed-tracing.js';

/**
 * Create a tracer for a specific microservice
 */
export function createServiceTracer(serviceName, options = {}) {
  const sampler = options.sampler || new ProbabilitySampler(options.sampleRate || 0.1);
  
  const exporter = new JaegerExporter({
    endpoint: options.jaegerEndpoint || process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    agentHost: options.jaegerAgentHost || process.env.JAEGER_AGENT_HOST || 'localhost',
    agentPort: options.jaegerAgentPort || parseInt(process.env.JAEGER_AGENT_PORT) || 6832,
    serviceName,
    tags: {
      'deployment.environment': options.environment || process.env.NODE_ENV || 'development',
      'host.name': options.hostname || require('os').hostname(),
      ...options.tags
    }
  });

  const processor = new BatchSpanProcessor(exporter, {
    maxQueueSize: options.maxQueueSize || 2048,
    maxExportBatchSize: options.maxExportBatchSize || 512,
    scheduleDelayMillis: options.scheduleDelayMillis || 5000
  });

  return new Tracer(serviceName, {
    sampler,
    processor,
    version: options.version || '1.0.0',
    hostname: options.hostname || require('os').hostname(),
    resource: options.resource
  });
}

/**
 * Tracing configuration for API Gateway
 */
export function createGatewayTracer(options = {}) {
  return createServiceTracer('surebet-api-gateway', {
    sampleRate: 0.5, // Higher sampling for gateway
    ...options,
    tags: {
      'service.type': 'gateway',
      ...options.tags
    }
  });
}

/**
 * Tracing configuration for Odds Collector
 */
export function createOddsCollectorTracer(options = {}) {
  return createServiceTracer('surebet-odds-collector', {
    sampleRate: 0.05, // Lower sampling for high-volume collector
    ...options,
    tags: {
      'service.type': 'collector',
      ...options.tags
    }
  });
}

/**
 * Tracing configuration for Arbitrage Detector
 */
export function createArbitrageDetectorTracer(options = {}) {
  return createServiceTracer('surebet-arbitrage-detector', {
    sampleRate: 0.2,
    ...options,
    tags: {
      'service.type': 'detector',
      ...options.tags
    }
  });
}

/**
 * Tracing configuration for Notification Service
 */
export function createNotificationTracer(options = {}) {
  return createServiceTracer('surebet-notification-service', {
    sampleRate: 0.3,
    ...options,
    tags: {
      'service.type': 'notification',
      ...options.tags
    }
  });
}

/**
 * Tracing configuration for User Management Service
 */
export function createUserManagementTracer(options = {}) {
  return createServiceTracer('surebet-user-management', {
    sampleRate: 0.5,
    ...options,
    tags: {
      'service.type': 'user-management',
      ...options.tags
    }
  });
}

/**
 * Tracing configuration for Analytics Service
 */
export function createAnalyticsTracer(options = {}) {
  return createServiceTracer('surebet-analytics-service', {
    sampleRate: 0.1,
    ...options,
    tags: {
      'service.type': 'analytics',
      ...options.tags
    }
  });
}

/**
 * Express middleware factory for microservices
 */
export function createServiceTracingMiddleware(tracer, serviceName) {
  return createTracingMiddleware(tracer, {
    spanName: (req) => `${req.method} ${req.path}`,
    onSpanCreate: (span, req) => {
      span.setTag('service.name', serviceName);
      span.setTag('http.route', req.route?.path || req.path);
      
      // Add user info if available
      if (req.user) {
        span.setTag('user.id', req.user.id);
        span.setTag('user.role', req.user.role);
      }
    }
  });
}

/**
 * Wrap HTTP client for inter-service communication
 */
export function createServiceHttpClient(tracer, baseUrl) {
  const client = createTracedHttpClient(tracer, {
    request: async (options, callback) => {
      const url = new URL(options.path, baseUrl);
      
      const fetchOptions = {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body
      };

      const response = await fetch(url.toString(), fetchOptions);
      
      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text()
      };
    }
  });

  return {
    get: (path, options = {}) => client.request({ ...options, path, method: 'GET' }),
    post: (path, body, options = {}) => client.request({ ...options, path, method: 'POST', body: JSON.stringify(body) }),
    put: (path, body, options = {}) => client.request({ ...options, path, method: 'PUT', body: JSON.stringify(body) }),
    delete: (path, options = {}) => client.request({ ...options, path, method: 'DELETE' })
  };
}

/**
 * Initialize tracing for a microservice
 */
export function initializeTracing(serviceName, options = {}) {
  let tracer;
  
  switch (serviceName) {
    case 'api-gateway':
      tracer = createGatewayTracer(options);
      break;
    case 'odds-collector':
      tracer = createOddsCollectorTracer(options);
      break;
    case 'arbitrage-detector':
      tracer = createArbitrageDetectorTracer(options);
      break;
    case 'notification-service':
      tracer = createNotificationTracer(options);
      break;
    case 'user-management':
      tracer = createUserManagementTracer(options);
      break;
    case 'analytics-service':
      tracer = createAnalyticsTracer(options);
      break;
    default:
      tracer = createServiceTracer(serviceName, options);
  }

  // Initialize global tracer for convenience
  initGlobalTracer(serviceName, { processor: tracer.processor });

  return tracer;
}

/**
 * Graceful shutdown handler for tracing
 */
export async function shutdownTracing(tracer) {
  if (tracer) {
    await tracer.shutdown();
  }
}

/**
 * Health check that includes tracing status
 */
export function createTracingHealthCheck(tracer) {
  return async () => {
    return {
      status: 'healthy',
      tracer: tracer.serviceName,
      sampler: tracer.sampler?.constructor?.name || 'unknown'
    };
  };
}

export default {
  createServiceTracer,
  createGatewayTracer,
  createOddsCollectorTracer,
  createArbitrageDetectorTracer,
  createNotificationTracer,
  createUserManagementTracer,
  createAnalyticsTracer,
  createServiceTracingMiddleware,
  createServiceHttpClient,
  initializeTracing,
  shutdownTracing,
  createTracingHealthCheck
};
