/**
 * Metrics Utility
 */

import promClient from 'prom-client';

const { Registry, Counter, Histogram } = promClient;

export const register = new Registry();

promClient.collectDefaultMetrics({ register });

export const httpRequests = new Counter({
  name: 'bookmaker_reviews_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

export const httpDuration = new Histogram({
  name: 'bookmaker_reviews_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

export const reviewSubmissions = new Counter({
  name: 'bookmaker_reviews_submissions_total',
  help: 'Total number of review submissions',
  labelNames: ['status'],
  registers: [register]
});

export const metrics = {
  register,
  httpRequests,
  httpDuration,
  reviewSubmissions
};
