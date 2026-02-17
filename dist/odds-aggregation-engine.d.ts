/**
 * Real-time Odds Aggregation Engine
 *
 * High-performance service that collects and normalizes odds from 50+ bookmakers
 * in real-time using WebSocket connections and efficient caching.
 */
import { EventEmitter } from 'events';
export interface BookmakerConfig {
    id: string;
    name: string;
    wsEndpoint?: string;
    restEndpoint: string;
    apiKey?: string;
    rateLimitMs: number;
    weight: number;
    supportedSports: string[];
    supportedMarkets: string[];
}
export interface OddsData {
    bookmakerId: string;
    eventId: string;
    sport: string;
    league: string;
    homeTeam: string;
    awayTeam: string;
    market: string;
    selection: string;
    odds: number;
    timestamp: number;
    volume?: number;
    lastUpdated: number;
}
export interface AggregatedOdds {
    eventId: string;
    sport: string;
    league: string;
    homeTeam: string;
    awayTeam: string;
    startTime: number;
    markets: {
        [market: string]: {
            [selection: string]: {
                [bookmakerId: string]: {
                    odds: number;
                    timestamp: number;
                    volume?: number;
                };
            };
        };
    };
    bestOdds: {
        [market: string]: {
            [selection: string]: {
                bookmaker: string;
                odds: number;
            };
        };
    };
    lastUpdated: number;
}
export declare class OddsAggregationEngine extends EventEmitter {
    private redis;
    private bookmakers;
    private wsConnections;
    private restPollingIntervals;
    private oddsCache;
    private readonly CACHE_TTL_SECONDS;
    private readonly AGGREGATION_KEY_PREFIX;
    private readonly RAW_ODDS_PREFIX;
    private isRunning;
    constructor(redisUrl?: string);
    private setupRedisHandlers;
    /**
     * Register a bookmaker for odds aggregation
     */
    registerBookmaker(config: BookmakerConfig): void;
    /**
     * Start the aggregation engine
     */
    start(): Promise<void>;
    /**
     * Stop the aggregation engine
     */
    stop(): Promise<void>;
    /**
     * Connect to a bookmaker's WebSocket feed
     */
    private connectWebSocket;
    /**
     * Start REST API polling for bookmakers without WebSocket
     */
    private startRestPolling;
    /**
     * Handle incoming odds update from any source
     */
    private handleOddsUpdate;
    /**
     * Normalize odds data from different bookmaker formats
     */
    private normalizeOddsData;
    /**
     * Start the aggregation loop that builds consolidated views
     */
    private startAggregationLoop;
    /**
     * Build aggregated odds view across all bookmakers
     */
    private buildAggregatedOdds;
    /**
     * Create aggregated view for a single event
     */
    private createAggregatedView;
    /**
     * Get aggregated odds for a specific event
     */
    getEventOdds(eventId: string): Promise<AggregatedOdds | null>;
    /**
     * Get all active events with aggregated odds
     */
    getAllEvents(): Promise<AggregatedOdds[]>;
    /**
     * Get bookmaker health status
     */
    getBookmakerHealth(): Array<{
        id: string;
        connected: boolean;
        connectionType: 'websocket' | 'rest_polling' | 'disconnected';
        lastUpdate: number | null;
    }>;
    /**
     * Get engine statistics
     */
    getStats(): {
        bookmakers: number;
        wsConnections: number;
        pollingConnections: number;
        cachedOdds: number;
        isRunning: boolean;
    };
}
export default OddsAggregationEngine;
//# sourceMappingURL=odds-aggregation-engine.d.ts.map