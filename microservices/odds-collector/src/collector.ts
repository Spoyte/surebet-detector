/**
 * Odds Collector Core
 * 
 * Manages connections to bookmakers and collects odds data
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import WebSocket from 'ws';
import { logger } from './utils/logger.js';
import { MessageQueue } from './queue.js';
import { metrics } from './utils/metrics.js';

export interface BookmakerConfig {
  id: string;
  name: string;
  type: 'rest' | 'websocket';
  endpoint?: string;
  wsEndpoint?: string;
  restEndpoint?: string;
  rateLimitMs: number;
  apiKey?: string;
  weight: number;
  enabled: boolean;
}

export interface OddsData {
  eventId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  bookmaker: string;
  market: string;
  odds: {
    home?: number;
    away?: number;
    draw?: number;
    over?: number;
    under?: number;
    handicap?: number;
    lay?: number;
    back?: number;
  };
  timestamp: Date;
  volume?: number;
}

export class OddsCollector extends EventEmitter {
  private redis: Redis;
  private queue: MessageQueue;
  private bookmakers: Map<string, BookmakerConfig> = new Map();
  private connections: Map<string, WebSocket | null> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private metrics: typeof metrics;

  constructor(options: { redisUrl: string; queue: MessageQueue; metrics: typeof metrics }) {
    super();
    this.redis = new Redis(options.redisUrl);
    this.queue = options.queue;
    this.metrics = options.metrics;
  }

  async registerBookmaker(config: BookmakerConfig): Promise<void> {
    this.bookmakers.set(config.id, config);
    this.emit('bookmaker:registered', config);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.emit('collector:started');

    for (const [id, config] of this.bookmakers) {
      await this.connectBookmaker(id, config);
    }

    logger.info(`Started collecting from ${this.bookmakers.size} bookmakers`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Clear all intervals
    for (const [id, interval] of this.intervals) {
      clearInterval(interval);
      logger.debug(`Cleared interval for ${id}`);
    }
    this.intervals.clear();

    // Close all WebSocket connections
    for (const [id, ws] of this.connections) {
      if (ws) {
        ws.close();
        logger.debug(`Closed WebSocket for ${id}`);
      }
    }
    this.connections.clear();

    await this.redis.quit();
    this.emit('collector:stopped');
  }

  private async connectBookmaker(id: string, config: BookmakerConfig): Promise<void> {
    try {
      if (config.type === 'websocket' && config.wsEndpoint) {
        await this.connectWebSocket(id, config);
      } else if (config.endpoint) {
        await this.connectREST(id, config);
      }
      
      this.metrics.bookmakerConnections.inc({ bookmaker: id, status: 'connected' });
      this.emit('bookmaker:connected', { id, type: config.type });
    } catch (error) {
      logger.error(`Failed to connect to ${id}:`, error);
      this.metrics.bookmakerConnections.inc({ bookmaker: id, status: 'failed' });
      this.emit('bookmaker:error', { id, error });
    }
  }

  private async connectWebSocket(id: string, config: BookmakerConfig): Promise<void> {
    if (!config.wsEndpoint) return;

    const ws = new WebSocket(config.wsEndpoint, {
      headers: config.apiKey ? { 'X-API-Key': config.apiKey } : undefined
    });

    ws.on('open', () => {
      logger.info(`WebSocket connected: ${id}`);
      this.emit('bookmaker:ws:open', { id });
      
      // Subscribe to odds streams
      ws.send(JSON.stringify({
        action: 'subscribe',
        channels: ['odds', 'events']
      }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleOddsMessage(id, message);
      } catch (error) {
        logger.error(`Failed to parse message from ${id}:`, error);
      }
    });

    ws.on('close', () => {
      logger.warn(`WebSocket closed: ${id}`);
      this.emit('bookmaker:ws:close', { id });
      
      // Reconnect after delay
      if (this.isRunning) {
        setTimeout(() => this.connectBookmaker(id, config), 5000);
      }
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${id}:`, error);
      this.emit('bookmaker:ws:error', { id, error });
    });

    this.connections.set(id, ws);
  }

  private async connectREST(id: string, config: BookmakerConfig): Promise<void> {
    const poll = async () => {
      try {
        const startTime = Date.now();
        
        const response = await fetch(config.endpoint!, {
          headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : undefined
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;
        
        this.metrics.apiLatency.observe({ bookmaker: id }, latency / 1000);
        this.metrics.apiRequests.inc({ bookmaker: id, status: 'success' });
        
        await this.handleRESTResponse(id, data);
      } catch (error) {
        logger.error(`REST API error for ${id}:`, error);
        this.metrics.apiRequests.inc({ bookmaker: id, status: 'error' });
      }
    };

    // Initial poll
    await poll();

    // Set up polling interval
    const interval = setInterval(poll, config.rateLimitMs);
    this.intervals.set(id, interval);
  }

  private async handleOddsMessage(bookmakerId: string, message: any): Promise<void> {
    const normalized = this.normalizeOdds(bookmakerId, message);
    
    if (normalized) {
      // Cache in Redis
      const key = `odds:${normalized.eventId}:${normalized.bookmaker}:${normalized.market}`;
      await this.redis.setex(key, 300, JSON.stringify(normalized));

      // Publish to queue for processing
      await this.queue.publish('odds.updates', normalized);

      this.metrics.oddsReceived.inc({ bookmaker: bookmakerId });
      this.emit('odds:received', { bookmaker: bookmakerId, data: normalized });
    }
  }

  private async handleRESTResponse(bookmakerId: string, data: any): Promise<void> {
    // Handle different API formats
    const events = Array.isArray(data) ? data : data.events || data.data || [];

    for (const event of events) {
      const normalized = this.normalizeOdds(bookmakerId, event);
      
      if (normalized) {
        const key = `odds:${normalized.eventId}:${normalized.bookmaker}:${normalized.market}`;
        await this.redis.setex(key, 300, JSON.stringify(normalized));
        await this.queue.publish('odds.updates', normalized);
        
        this.metrics.oddsReceived.inc({ bookmaker: bookmakerId });
      }
    }

    this.emit('odds:batch', { bookmaker: bookmakerId, count: events.length });
  }

  private normalizeOdds(bookmakerId: string, data: any): OddsData | null {
    try {
      // This is a simplified normalization - real implementation would handle
      // different bookmaker formats more comprehensively
      return {
        eventId: data.event_id || data.eventId || data.id,
        sport: data.sport || data.category || 'unknown',
        league: data.league || data.competition || 'unknown',
        homeTeam: data.home_team || data.homeTeam || data.home,
        awayTeam: data.away_team || data.awayTeam || data.away,
        startTime: new Date(data.start_time || data.startTime || Date.now()),
        bookmaker: bookmakerId,
        market: data.market || 'h2h',
        odds: {
          home: data.odds?.home || data.home_odds,
          away: data.odds?.away || data.away_odds,
          draw: data.odds?.draw || data.draw_odds,
          over: data.odds?.over,
          under: data.odds?.under,
          handicap: data.odds?.handicap,
          lay: data.odds?.lay,
          back: data.odds?.back
        },
        timestamp: new Date(),
        volume: data.volume || data.liquidity
      };
    } catch (error) {
      logger.error(`Failed to normalize odds from ${bookmakerId}:`, error);
      return null;
    }
  }

  getStats(): object {
    return {
      bookmakers: this.bookmakers.size,
      connections: this.connections.size,
      isRunning: this.isRunning
    };
  }

  getBookmakers(): BookmakerConfig[] {
    return Array.from(this.bookmakers.values());
  }
}