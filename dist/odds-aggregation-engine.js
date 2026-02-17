"use strict";
/**
 * Real-time Odds Aggregation Engine
 *
 * High-performance service that collects and normalizes odds from 50+ bookmakers
 * in real-time using WebSocket connections and efficient caching.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OddsAggregationEngine = void 0;
const events_1 = require("events");
const ioredis_1 = __importDefault(require("ioredis"));
const ws_1 = __importDefault(require("ws"));
class OddsAggregationEngine extends events_1.EventEmitter {
    redis;
    bookmakers = new Map();
    wsConnections = new Map();
    restPollingIntervals = new Map();
    oddsCache = new Map();
    CACHE_TTL_SECONDS = 300; // 5 minutes
    AGGREGATION_KEY_PREFIX = 'odds:agg:';
    RAW_ODDS_PREFIX = 'odds:raw:';
    isRunning = false;
    constructor(redisUrl = 'redis://localhost:6379') {
        super();
        this.redis = new ioredis_1.default(redisUrl);
        this.setupRedisHandlers();
    }
    setupRedisHandlers() {
        this.redis.on('error', (err) => {
            this.emit('error', { source: 'redis', error: err });
        });
    }
    /**
     * Register a bookmaker for odds aggregation
     */
    registerBookmaker(config) {
        this.bookmakers.set(config.id, config);
        this.emit('bookmaker:registered', config);
    }
    /**
     * Start the aggregation engine
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Engine is already running');
        }
        this.isRunning = true;
        this.emit('engine:started');
        // Connect to WebSocket feeds where available
        for (const [id, config] of this.bookmakers) {
            if (config.wsEndpoint) {
                await this.connectWebSocket(id);
            }
            else {
                this.startRestPolling(id);
            }
        }
        // Start periodic aggregation
        this.startAggregationLoop();
    }
    /**
     * Stop the aggregation engine
     */
    async stop() {
        this.isRunning = false;
        // Close WebSocket connections
        for (const [id, ws] of this.wsConnections) {
            ws.close();
            this.emit('bookmaker:disconnected', { id, reason: 'engine_stop' });
        }
        this.wsConnections.clear();
        // Clear polling intervals
        for (const [id, interval] of this.restPollingIntervals) {
            clearInterval(interval);
        }
        this.restPollingIntervals.clear();
        await this.redis.quit();
        this.emit('engine:stopped');
    }
    /**
     * Connect to a bookmaker's WebSocket feed
     */
    async connectWebSocket(bookmakerId) {
        const config = this.bookmakers.get(bookmakerId);
        if (!config || !config.wsEndpoint)
            return;
        const ws = new ws_1.default(config.wsEndpoint, {
            headers: config.apiKey ? { 'X-API-Key': config.apiKey } : undefined
        });
        ws.on('open', () => {
            this.emit('bookmaker:connected', { id: bookmakerId, type: 'websocket' });
            // Subscribe to sports/markets
            ws.send(JSON.stringify({
                action: 'subscribe',
                sports: config.supportedSports,
                markets: config.supportedMarkets
            }));
        });
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleOddsUpdate(bookmakerId, message);
            }
            catch (err) {
                this.emit('error', { source: 'websocket', bookmaker: bookmakerId, error: err });
            }
        });
        ws.on('close', () => {
            this.emit('bookmaker:disconnected', { id: bookmakerId, reason: 'websocket_close' });
            this.wsConnections.delete(bookmakerId);
            // Reconnect with exponential backoff
            if (this.isRunning) {
                setTimeout(() => this.connectWebSocket(bookmakerId), 5000);
            }
        });
        ws.on('error', (err) => {
            this.emit('error', { source: 'websocket', bookmaker: bookmakerId, error: err });
        });
        this.wsConnections.set(bookmakerId, ws);
    }
    /**
     * Start REST API polling for bookmakers without WebSocket
     */
    startRestPolling(bookmakerId) {
        const config = this.bookmakers.get(bookmakerId);
        if (!config)
            return;
        const poll = async () => {
            try {
                const response = await fetch(config.restEndpoint, {
                    headers: config.apiKey ? { 'X-API-Key': config.apiKey } : undefined
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                this.handleOddsUpdate(bookmakerId, data);
                this.emit('bookmaker:poll:success', { id: bookmakerId });
            }
            catch (err) {
                this.emit('error', { source: 'rest', bookmaker: bookmakerId, error: err });
            }
        };
        // Initial poll
        poll();
        // Schedule periodic polling
        const interval = setInterval(poll, config.rateLimitMs);
        this.restPollingIntervals.set(bookmakerId, interval);
        this.emit('bookmaker:connected', { id: bookmakerId, type: 'rest_polling' });
    }
    /**
     * Handle incoming odds update from any source
     */
    async handleOddsUpdate(bookmakerId, data) {
        const normalized = this.normalizeOddsData(bookmakerId, data);
        for (const odds of normalized) {
            // Update local cache
            const cacheKey = `${odds.eventId}:${odds.market}:${odds.selection}:${bookmakerId}`;
            this.oddsCache.set(cacheKey, odds);
            // Store in Redis for distributed access
            const redisKey = `${this.RAW_ODDS_PREFIX}${cacheKey}`;
            await this.redis.setex(redisKey, this.CACHE_TTL_SECONDS, JSON.stringify(odds));
            // Publish update for real-time subscribers
            await this.redis.publish('odds:updates', JSON.stringify({
                type: 'odds_update',
                data: odds
            }));
        }
        this.emit('odds:updated', { bookmaker: bookmakerId, count: normalized.length });
    }
    /**
     * Normalize odds data from different bookmaker formats
     */
    normalizeOddsData(bookmakerId, data) {
        const config = this.bookmakers.get(bookmakerId);
        if (!config)
            return [];
        const normalized = [];
        const timestamp = Date.now();
        // Handle array of events
        const events = Array.isArray(data) ? data : [data];
        for (const event of events) {
            // Extract event info (handle different formats)
            const eventId = event.id || event.event_id || event.eventId;
            const sport = event.sport || event.sport_key || event.category;
            const league = event.league || event.competition || event.tournament;
            const homeTeam = event.home_team || event.homeTeam || event.team1;
            const awayTeam = event.away_team || event.awayTeam || event.team2;
            // Process each market
            const markets = event.markets || event.odds || event.markets || {};
            for (const [marketKey, marketData] of Object.entries(markets)) {
                const selections = Array.isArray(marketData) ? marketData : marketData.selections || marketData.outcomes || [];
                for (const selection of selections) {
                    normalized.push({
                        bookmakerId,
                        eventId: String(eventId),
                        sport: String(sport),
                        league: String(league),
                        homeTeam: String(homeTeam),
                        awayTeam: String(awayTeam),
                        market: String(marketKey),
                        selection: String(selection.name || selection.outcome || selection.selection),
                        odds: parseFloat(selection.price || selection.odds || selection.decimal),
                        timestamp,
                        volume: selection.volume ? parseFloat(selection.volume) : undefined,
                        lastUpdated: timestamp
                    });
                }
            }
        }
        return normalized;
    }
    /**
     * Start the aggregation loop that builds consolidated views
     */
    startAggregationLoop() {
        const AGGREGATION_INTERVAL = 1000; // 1 second
        const aggregate = async () => {
            if (!this.isRunning)
                return;
            try {
                await this.buildAggregatedOdds();
            }
            catch (err) {
                this.emit('error', { source: 'aggregation', error: err });
            }
            setTimeout(aggregate, AGGREGATION_INTERVAL);
        };
        aggregate();
    }
    /**
     * Build aggregated odds view across all bookmakers
     */
    async buildAggregatedOdds() {
        // Get all raw odds from Redis
        const keys = await this.redis.keys(`${this.RAW_ODDS_PREFIX}*`);
        if (keys.length === 0)
            return;
        const oddsList = [];
        // Batch fetch odds data
        const BATCH_SIZE = 100;
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);
            const values = await this.redis.mget(...batch);
            for (const value of values) {
                if (value) {
                    try {
                        oddsList.push(JSON.parse(value));
                    }
                    catch {
                        // Skip invalid data
                    }
                }
            }
        }
        // Group by event
        const byEvent = new Map();
        for (const odds of oddsList) {
            const existing = byEvent.get(odds.eventId) || [];
            existing.push(odds);
            byEvent.set(odds.eventId, existing);
        }
        // Build aggregated views
        for (const [eventId, eventOdds] of byEvent) {
            const aggregated = this.createAggregatedView(eventId, eventOdds);
            // Store in Redis
            const key = `${this.AGGREGATION_KEY_PREFIX}${eventId}`;
            await this.redis.setex(key, this.CACHE_TTL_SECONDS, JSON.stringify(aggregated));
            // Emit for real-time consumers
            this.emit('odds:aggregated', aggregated);
        }
    }
    /**
     * Create aggregated view for a single event
     */
    createAggregatedView(eventId, oddsList) {
        const first = oddsList[0];
        const aggregated = {
            eventId,
            sport: first.sport,
            league: first.league,
            homeTeam: first.homeTeam,
            awayTeam: first.awayTeam,
            startTime: 0, // Would be populated from event data
            markets: {},
            bestOdds: {},
            lastUpdated: Date.now()
        };
        // Group by market and selection
        for (const odds of oddsList) {
            if (!aggregated.markets[odds.market]) {
                aggregated.markets[odds.market] = {};
            }
            if (!aggregated.markets[odds.market][odds.selection]) {
                aggregated.markets[odds.market][odds.selection] = {};
            }
            aggregated.markets[odds.market][odds.selection][odds.bookmakerId] = {
                odds: odds.odds,
                timestamp: odds.timestamp,
                volume: odds.volume
            };
        }
        // Calculate best odds for each selection
        for (const [market, selections] of Object.entries(aggregated.markets)) {
            aggregated.bestOdds[market] = {};
            for (const [selection, bookmakers] of Object.entries(selections)) {
                let bestOdds = 0;
                let bestBookmaker = '';
                for (const [bookmakerId, data] of Object.entries(bookmakers)) {
                    if (data.odds > bestOdds) {
                        bestOdds = data.odds;
                        bestBookmaker = bookmakerId;
                    }
                }
                aggregated.bestOdds[market][selection] = {
                    bookmaker: bestBookmaker,
                    odds: bestOdds
                };
            }
        }
        return aggregated;
    }
    /**
     * Get aggregated odds for a specific event
     */
    async getEventOdds(eventId) {
        const key = `${this.AGGREGATION_KEY_PREFIX}${eventId}`;
        const data = await this.redis.get(key);
        if (!data)
            return null;
        try {
            return JSON.parse(data);
        }
        catch {
            return null;
        }
    }
    /**
     * Get all active events with aggregated odds
     */
    async getAllEvents() {
        const keys = await this.redis.keys(`${this.AGGREGATION_KEY_PREFIX}*`);
        if (keys.length === 0)
            return [];
        const events = [];
        const BATCH_SIZE = 50;
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            const batch = keys.slice(i, i + BATCH_SIZE);
            const values = await this.redis.mget(...batch);
            for (const value of values) {
                if (value) {
                    try {
                        events.push(JSON.parse(value));
                    }
                    catch {
                        // Skip invalid data
                    }
                }
            }
        }
        return events;
    }
    /**
     * Get bookmaker health status
     */
    getBookmakerHealth() {
        return Array.from(this.bookmakers.values()).map(config => {
            const wsConnected = this.wsConnections.has(config.id);
            const pollingActive = this.restPollingIntervals.has(config.id);
            return {
                id: config.id,
                connected: wsConnected || pollingActive,
                connectionType: wsConnected ? 'websocket' : pollingActive ? 'rest_polling' : 'disconnected',
                lastUpdate: null // Would track last successful update
            };
        });
    }
    /**
     * Get engine statistics
     */
    getStats() {
        return {
            bookmakers: this.bookmakers.size,
            wsConnections: this.wsConnections.size,
            pollingConnections: this.restPollingIntervals.size,
            cachedOdds: this.oddsCache.size,
            isRunning: this.isRunning
        };
    }
}
exports.OddsAggregationEngine = OddsAggregationEngine;
exports.default = OddsAggregationEngine;
//# sourceMappingURL=odds-aggregation-engine.js.map