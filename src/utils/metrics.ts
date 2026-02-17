import { Registry, Counter, Gauge, Histogram } from 'prom-client';

/**
 * Prometheus metrics for monitoring the odds aggregation engine
 */

export const register = new Registry();

// Bookmaker connection metrics
export const bookmakerConnections = new Gauge({
  name: 'surebet_bookmaker_connections',
  help: 'Number of active bookmaker connections',
  labelNames: ['bookmaker', 'type'],
  registers: [register]
});

// Odds update metrics
export const oddsUpdatesTotal = new Counter({
  name: 'surebet_odds_updates_total',
  help: 'Total number of odds updates received',
  labelNames: ['bookmaker'],
  registers: [register]
});

export const oddsAggregationDuration = new Histogram({
  name: 'surebet_odds_aggregation_duration_seconds',
  help: 'Duration of odds aggregation in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Cache metrics
export const cacheSize = new Gauge({
  name: 'surebet_cache_size',
  help: 'Number of items in the odds cache',
  registers: [register]
});

// Error metrics
export const errorsTotal = new Counter({
  name: 'surebet_errors_total',
  help: 'Total number of errors',
  labelNames: ['source', 'bookmaker'],
  registers: [register]
});

// Active events
export const activeEvents = new Gauge({
  name: 'surebet_active_events',
  help: 'Number of active events being tracked',
  registers: [register]
});

// Arbitrage opportunities found
export const arbitrageOpportunities = new Counter({
  name: 'surebet_arbitrage_opportunities_total',
  help: 'Total number of arbitrage opportunities detected',
  labelNames: ['sport', 'market'],
  registers: [register]
});

// Express middleware for metrics endpoint
export function metricsMiddleware(req: any, res: any, next: any) {
  if (req.path === '/metrics') {
    res.set('Content-Type', register.contentType);
    register.metrics().then((metrics) => res.end(metrics));
  } else {
    next();
  }
}
