/**
 * Prometheus Metrics
 */

import promClient from 'prom-client';

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const bookmakerConnections = new promClient.Counter({
  name: 'odds_collector_bookmaker_connections_total',
  help: 'Total number of bookmaker connection attempts',
  labelNames: ['bookmaker', 'status'],
  registers: [register]
});

const oddsReceived = new promClient.Counter({
  name: 'odds_collector_odds_received_total',
  help: 'Total number of odds updates received',
  labelNames: ['bookmaker'],
  registers: [register]
});

const apiLatency = new promClient.Histogram({
  name: 'odds_collector_api_latency_seconds',
  help: 'API request latency in seconds',
  labelNames: ['bookmaker'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const apiRequests = new promClient.Counter({
  name: 'odds_collector_api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['bookmaker', 'status'],
  registers: [register]
});

export const metrics = {
  register,
  bookmakerConnections,
  oddsReceived,
  apiLatency,
  apiRequests
};