/**
 * Prometheus Metrics
 */

import promClient from 'prom-client';

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

const oddsProcessed = new promClient.Counter({
  name: 'arbitrage_odds_processed_total',
  help: 'Total number of odds updates processed',
  labelNames: ['bookmaker'],
  registers: [register]
});

const opportunitiesDetected = new promClient.Counter({
  name: 'arbitrage_opportunities_detected_total',
  help: 'Total number of arbitrage opportunities detected',
  labelNames: ['sport', 'market'],
  registers: [register]
});

const processingErrors = new promClient.Counter({
  name: 'arbitrage_processing_errors_total',
  help: 'Total number of processing errors',
  registers: [register]
});

export const metrics = {
  register,
  oddsProcessed,
  opportunitiesDetected,
  processingErrors
};