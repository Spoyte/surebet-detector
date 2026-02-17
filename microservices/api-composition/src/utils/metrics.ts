/**
 * Metrics Utility
 */

import promClient from 'prom-client';

const { Registry, Counter, Histogram } = promClient;

export const register = new Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// HTTP request counter
export const httpRequests = new Counter({
  name: 'api_composition_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

// HTTP request duration
export const httpDuration = new Histogram({
  name: 'api_composition_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Cache metrics
export const cacheHits = new Counter({
  name: 'api_composition_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['key'],
  registers: [register]
});

export const cacheSets = new Counter({
  name: 'api_composition_cache_sets_total',
  help: 'Total number of cache sets',
  labelNames: ['key'],
  registers: [register]
});

// Service call metrics
export const serviceCalls = new Counter({
  name: 'api_composition_service_calls_total',
  help: 'Total number of service calls',
  labelNames: ['service', 'endpoint', 'status'],
  registers: [register]
});

export const serviceCallDuration = new Histogram({
  name: 'api_composition_service_call_duration_seconds',
  help: 'Service call duration in seconds',
  labelNames: ['service', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

export const metrics = {
  register,
  httpRequests,
  httpDuration,
  cacheHits,
  cacheSets,
  serviceCalls,
  serviceCallDuration
};
