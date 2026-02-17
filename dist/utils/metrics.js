"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arbitrageOpportunities = exports.activeEvents = exports.errorsTotal = exports.cacheSize = exports.oddsAggregationDuration = exports.oddsUpdatesTotal = exports.bookmakerConnections = exports.register = void 0;
exports.metricsMiddleware = metricsMiddleware;
const prom_client_1 = require("prom-client");
/**
 * Prometheus metrics for monitoring the odds aggregation engine
 */
exports.register = new prom_client_1.Registry();
// Bookmaker connection metrics
exports.bookmakerConnections = new prom_client_1.Gauge({
    name: 'surebet_bookmaker_connections',
    help: 'Number of active bookmaker connections',
    labelNames: ['bookmaker', 'type'],
    registers: [exports.register]
});
// Odds update metrics
exports.oddsUpdatesTotal = new prom_client_1.Counter({
    name: 'surebet_odds_updates_total',
    help: 'Total number of odds updates received',
    labelNames: ['bookmaker'],
    registers: [exports.register]
});
exports.oddsAggregationDuration = new prom_client_1.Histogram({
    name: 'surebet_odds_aggregation_duration_seconds',
    help: 'Duration of odds aggregation in seconds',
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [exports.register]
});
// Cache metrics
exports.cacheSize = new prom_client_1.Gauge({
    name: 'surebet_cache_size',
    help: 'Number of items in the odds cache',
    registers: [exports.register]
});
// Error metrics
exports.errorsTotal = new prom_client_1.Counter({
    name: 'surebet_errors_total',
    help: 'Total number of errors',
    labelNames: ['source', 'bookmaker'],
    registers: [exports.register]
});
// Active events
exports.activeEvents = new prom_client_1.Gauge({
    name: 'surebet_active_events',
    help: 'Number of active events being tracked',
    registers: [exports.register]
});
// Arbitrage opportunities found
exports.arbitrageOpportunities = new prom_client_1.Counter({
    name: 'surebet_arbitrage_opportunities_total',
    help: 'Total number of arbitrage opportunities detected',
    labelNames: ['sport', 'market'],
    registers: [exports.register]
});
// Express middleware for metrics endpoint
function metricsMiddleware(req, res, next) {
    if (req.path === '/metrics') {
        res.set('Content-Type', exports.register.contentType);
        exports.register.metrics().then((metrics) => res.end(metrics));
    }
    else {
        next();
    }
}
//# sourceMappingURL=metrics.js.map