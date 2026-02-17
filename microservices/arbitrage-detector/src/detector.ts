/**
 * Arbitrage Detection Core
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from './utils/logger.js';
import { MessageQueue } from './queue.js';
import { metrics } from './utils/metrics.js';

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
}

export interface ArbitrageOpportunity {
  id: string;
  eventId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  market: string;
  profitPercent: number;
  stakes: Array<{
    bookmaker: string;
    outcome: string;
    odds: number;
    stake: number;
    stakePercent: number;
  }>;
  totalStake: number;
  guaranteedProfit: number;
  detectedAt: Date;
  expiresAt: Date;
}

export class ArbitrageDetector extends EventEmitter {
  private redis: Redis;
  private queue: MessageQueue;
  private metrics: typeof metrics;
  private minProfitPercent: number;
  private isRunning = false;

  constructor(options: {
    redisUrl: string;
    queue: MessageQueue;
    metrics: typeof metrics;
    minProfitPercent: number;
  }) {
    super();
    this.redis = new Redis(options.redisUrl);
    this.queue = options.queue;
    this.metrics = options.metrics;
    this.minProfitPercent = options.minProfitPercent;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.emit('detector:started');

    // Subscribe to odds updates
    await this.queue.subscribe('arbitrage-odds-queue', 'odds.updates', async (odds: OddsData) => {
      await this.processOddsUpdate(odds);
    });

    logger.info('Arbitrage detector subscribed to odds updates');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.redis.quit();
    this.emit('detector:stopped');
  }

  private async processOddsUpdate(odds: OddsData): Promise<void> {
    try {
      // Store odds in Redis for comparison
      const key = `odds:${odds.eventId}:${odds.market}`;
      await this.redis.hset(key, odds.bookmaker, JSON.stringify(odds));
      await this.redis.expire(key, 300);

      // Get all bookmaker odds for this event/market
      const allOdds = await this.redis.hgetall(key);
      const bookmakerOdds = Object.entries(allOdds).map(([bookmaker, data]) => ({
        bookmaker,
        ...JSON.parse(data)
      }));

      // Check for arbitrage opportunities
      const opportunity = this.detectArbitrage(odds.eventId, odds.market, bookmakerOdds);

      if (opportunity && opportunity.profitPercent >= this.minProfitPercent) {
        // Store opportunity
        const oppKey = `opportunity:${opportunity.id}`;
        await this.redis.setex(oppKey, 300, JSON.stringify(opportunity));

        // Publish to notification service
        await this.queue.publish('arbitrage.opportunities', opportunity);

        this.metrics.opportunitiesDetected.inc({
          sport: opportunity.sport,
          market: opportunity.market
        });

        this.emit('opportunity:detected', opportunity);
        logger.info(`Arbitrage opportunity detected: ${opportunity.profitPercent.toFixed(2)}% profit`);
      }

      this.metrics.oddsProcessed.inc({ bookmaker: odds.bookmaker });
    } catch (error) {
      logger.error('Error processing odds update:', error);
      this.metrics.processingErrors.inc();
    }
  }

  private detectArbitrage(
    eventId: string,
    market: string,
    bookmakerOdds: any[]
  ): ArbitrageOpportunity | null {
    // Find best odds for each outcome
    const bestHome = this.findBestOdds(bookmakerOdds, 'home');
    const bestAway = this.findBestOdds(bookmakerOdds, 'away');
    const bestDraw = this.findBestOdds(bookmakerOdds, 'draw');

    // Calculate arbitrage for 2-way markets (home/away or over/under)
    if (market === 'h2h' && !bestDraw) {
      return this.calculateTwoWayArbitrage(eventId, market, bookmakerOdds[0], bestHome, bestAway);
    }

    // Calculate arbitrage for 3-way markets (1X2)
    if (market === 'h2h' && bestDraw) {
      return this.calculateThreeWayArbitrage(eventId, market, bookmakerOdds[0], bestHome, bestAway, bestDraw);
    }

    return null;
  }

  private findBestOdds(bookmakerOdds: any[], outcome: string): { bookmaker: string; odds: number } | null {
    let best = null;
    let bestOdds = 0;

    for (const bo of bookmakerOdds) {
      const odds = bo.odds[outcome];
      if (odds && odds > bestOdds) {
        bestOdds = odds;
        best = { bookmaker: bo.bookmaker, odds };
      }
    }

    return best;
  }

  private calculateTwoWayArbitrage(
    eventId: string,
    market: string,
    reference: any,
    home: { bookmaker: string; odds: number } | null,
    away: { bookmaker: string; odds: number } | null
  ): ArbitrageOpportunity | null {
    if (!home || !away) return null;

    // Calculate implied probabilities
    const homeProb = 1 / home.odds;
    const awayProb = 1 / away.odds;
    const totalProb = homeProb + awayProb;

    // Arbitrage exists if total probability < 1
    if (totalProb >= 1) return null;

    const profitPercent = (1 - totalProb) * 100;

    // Calculate stakes for €100 total stake
    const totalStake = 100;
    const homeStake = (totalStake * homeProb) / totalProb;
    const awayStake = (totalStake * awayProb) / totalProb;

    const guaranteedProfit = totalStake * (profitPercent / 100);

    return {
      id: `${eventId}-${market}-${Date.now()}`,
      eventId,
      sport: reference.sport,
      league: reference.league,
      homeTeam: reference.homeTeam,
      awayTeam: reference.awayTeam,
      startTime: new Date(reference.startTime),
      market,
      profitPercent,
      stakes: [
        {
          bookmaker: home.bookmaker,
          outcome: 'home',
          odds: home.odds,
          stake: Math.round(homeStake * 100) / 100,
          stakePercent: Math.round((homeStake / totalStake) * 10000) / 100
        },
        {
          bookmaker: away.bookmaker,
          outcome: 'away',
          odds: away.odds,
          stake: Math.round(awayStake * 100) / 100,
          stakePercent: Math.round((awayStake / totalStake) * 10000) / 100
        }
      ],
      totalStake,
      guaranteedProfit: Math.round(guaranteedProfit * 100) / 100,
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    };
  }

  private calculateThreeWayArbitrage(
    eventId: string,
    market: string,
    reference: any,
    home: { bookmaker: string; odds: number } | null,
    away: { bookmaker: string; odds: number } | null,
    draw: { bookmaker: string; odds: number } | null
  ): ArbitrageOpportunity | null {
    if (!home || !away || !draw) return null;

    const homeProb = 1 / home.odds;
    const awayProb = 1 / away.odds;
    const drawProb = 1 / draw.odds;
    const totalProb = homeProb + awayProb + drawProb;

    if (totalProb >= 1) return null;

    const profitPercent = (1 - totalProb) * 100;
    const totalStake = 100;

    const homeStake = (totalStake * homeProb) / totalProb;
    const awayStake = (totalStake * awayProb) / totalProb;
    const drawStake = (totalStake * drawProb) / totalProb;

    const guaranteedProfit = totalStake * (profitPercent / 100);

    return {
      id: `${eventId}-${market}-${Date.now()}`,
      eventId,
      sport: reference.sport,
      league: reference.league,
      homeTeam: reference.homeTeam,
      awayTeam: reference.awayTeam,
      startTime: new Date(reference.startTime),
      market,
      profitPercent,
      stakes: [
        {
          bookmaker: home.bookmaker,
          outcome: 'home',
          odds: home.odds,
          stake: Math.round(homeStake * 100) / 100,
          stakePercent: Math.round((homeStake / totalStake) * 10000) / 100
        },
        {
          bookmaker: away.bookmaker,
          outcome: 'away',
          odds: away.odds,
          stake: Math.round(awayStake * 100) / 100,
          stakePercent: Math.round((awayStake / totalStake) * 10000) / 100
        },
        {
          bookmaker: draw.bookmaker,
          outcome: 'draw',
          odds: draw.odds,
          stake: Math.round(drawStake * 100) / 100,
          stakePercent: Math.round((drawStake / totalStake) * 10000) / 100
        }
      ],
      totalStake,
      guaranteedProfit: Math.round(guaranteedProfit * 100) / 100,
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    };
  }

  async getActiveOpportunities(): Promise<ArbitrageOpportunity[]> {
    const keys = await this.redis.keys('opportunity:*');
    const opportunities: ArbitrageOpportunity[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        opportunities.push(JSON.parse(data));
      }
    }

    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  }

  getStats(): object {
    return {
      isRunning: this.isRunning,
      minProfitPercent: this.minProfitPercent
    };
  }
}