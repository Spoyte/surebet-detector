import { Registry, Counter, Gauge, Histogram } from 'prom-client';
/**
 * Prometheus metrics for monitoring the odds aggregation engine
 */
export declare const register: Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const bookmakerConnections: Gauge<"type" | "bookmaker">;
export declare const oddsUpdatesTotal: Counter<"bookmaker">;
export declare const oddsAggregationDuration: Histogram<string>;
export declare const cacheSize: Gauge<string>;
export declare const errorsTotal: Counter<"source" | "bookmaker">;
export declare const activeEvents: Gauge<string>;
export declare const arbitrageOpportunities: Counter<"market" | "sport">;
export declare function metricsMiddleware(req: any, res: any, next: any): void;
//# sourceMappingURL=metrics.d.ts.map