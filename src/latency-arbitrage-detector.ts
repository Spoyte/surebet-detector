/**
 * Latency Arbitrage Detection for Live Betting
 * 
 * Detects arbitrage opportunities caused by latency differences between bookmakers
 * during live events. This occurs when:
 * - A goal is scored and visible on the live stream
 * - Some bookmakers have updated their odds (reflecting the goal)
 * - Other bookmakers haven't updated yet (still showing pre-goal odds)
 * - Arbitrage exists between the "slow" and "fast" bookmakers
 * 
 * WARNING: This is a high-risk, high-reward strategy that requires:
 * - Low-latency live stream access
 * - Fast execution capabilities
 * - Acceptance of potential account restrictions
 */

import { EventEmitter } from 'events';
import logger from './utils/logger.js';

export interface LiveEvent {
  eventId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: number;
  currentScore: { home: number; away: number };
  matchStatus: 'not_started' | 'first_half' | 'halftime' | 'second_half' | 'finished';
  currentMinute: number;
}

export interface BookmakerOdds {
  bookmaker: string;
  eventId: string;
  timestamp: number;
  latencyMs: number; // Estimated latency from event source
  odds: {
    homeWin: number;
    draw: number;
    awayWin: number;
    overUnder?: Record<string, number>;
    asianHandicap?: Record<string, number>;
  };
  lastUpdated: number;
  isSuspended: boolean;
  suspensionReason?: string;
}

export interface LatencyArbitrageOpportunity {
  id: string;
  type: 'latency_arbitrage';
  event: LiveEvent;
  detectedAt: number;
  expectedDurationMs: number; // How long we expect the window to last
  fastBookmaker: {
    id: string;
    odds: BookmakerOdds;
    updateTime: number;
  };
  slowBookmaker: {
    id: string;
    odds: BookmakerOdds;
    updateTime: number;
  };
  triggerEvent: {
    type: 'goal' | 'red_card' | 'penalty_awarded' | 'injury' | 'momentum_shift';
    description: string;
    expectedImpact: 'high' | 'medium' | 'low';
  };
  arbitrageDetails: {
    profitPercent: number;
    recommendedStake: number;
    fastSide: 'home' | 'away' | 'draw';
    slowSide: 'home' | 'away' | 'draw';
    fastOdds: number;
    slowOdds: number;
  };
  riskAssessment: {
    executionTimeMs: number; // Estimated time to execute both bets
    windowClosingProbability: number; // Probability window closes before execution
    accountRiskLevel: 'low' | 'medium' | 'high';
    recommendedMaxStake: number;
  };
  confidence: number; // 0-1
}

export interface LatencyDetectorConfig {
  minProfitPercent: number;
  maxProfitPercent: number;
  minLatencyDifferenceMs: number;
  maxExecutionTimeMs: number;
  oddsChangeThreshold: number; // Minimum odds change to consider significant
  suspensionTimeoutMs: number; // How long to wait after suspension before checking
  momentumWindowMinutes: number; // Window for momentum-based detection
  enableGoalDetection: boolean;
  enableRedCardDetection: boolean;
  enableMomentumDetection: boolean;
  maxConcurrentEvents: number;
}

export class LatencyArbitrageDetector extends EventEmitter {
  private config: LatencyDetectorConfig;
  private activeEvents: Map<string, LiveEvent> = new Map();
  private bookmakerOdds: Map<string, Map<string, BookmakerOdds>> = new Map(); // eventId -> bookmaker -> odds
  private oddsHistory: Map<string, BookmakerOdds[]> = new Map(); // eventId -> history
  private detectedOpportunities: Map<string, LatencyArbitrageOpportunity> = new Map();
  private isRunning = false;

  constructor(config: Partial<LatencyDetectorConfig> = {}) {
    super();
    
    this.config = {
      minProfitPercent: 0.5,
      maxProfitPercent: 50, // High cap for latency opportunities
      minLatencyDifferenceMs: 500, // 500ms minimum latency diff
      maxExecutionTimeMs: 3000, // 3 seconds max execution
      oddsChangeThreshold: 0.15, // 15% odds change
      suspensionTimeoutMs: 2000,
      momentumWindowMinutes: 10,
      enableGoalDetection: true,
      enableRedCardDetection: true,
      enableMomentumDetection: true,
      maxConcurrentEvents: 50,
      ...config
    };
  }

  /**
   * Start the latency arbitrage detector
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('Latency arbitrage detector started', { config: this.config });
    this.emit('detector:started');
  }

  /**
   * Stop the detector
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    logger.info('Latency arbitrage detector stopped');
    this.emit('detector:stopped');
  }

  /**
   * Process live event update
   */
  public processLiveEvent(event: LiveEvent): void {
    if (!this.isRunning) return;

    const existing = this.activeEvents.get(event.eventId);
    
    // Detect score changes
    if (existing) {
      const homeScoreChanged = existing.currentScore.home !== event.currentScore.home;
      const awayScoreChanged = existing.currentScore.away !== event.currentScore.away;
      
      if (homeScoreChanged || awayScoreChanged) {
        this.handleScoreChange(event, existing, homeScoreChanged, awayScoreChanged);
      }
    }

    this.activeEvents.set(event.eventId, event);
  }

  /**
   * Process odds update from a bookmaker
   */
  public processOddsUpdate(odds: BookmakerOdds): void {
    if (!this.isRunning) return;

    const eventOdds = this.bookmakerOdds.get(odds.eventId) || new Map();
    const existingOdds = eventOdds.get(odds.bookmaker);

    // Store in history
    const history = this.oddsHistory.get(odds.eventId) || [];
    history.push(odds);
    
    // Keep only last 100 updates per event
    if (history.length > 100) {
      history.shift();
    }
    this.oddsHistory.set(odds.eventId, history);

    // Check for significant odds changes
    if (existingOdds) {
      const changes = this.analyzeOddsChanges(existingOdds, odds);
      
      if (changes.isSignificant) {
        this.handleSignificantOddsChange(odds, existingOdds, changes);
      }
    }

    eventOdds.set(odds.bookmaker, odds);
    this.bookmakerOdds.set(odds.eventId, eventOdds);
  }

  /**
   * Handle score change detection
   */
  private handleScoreChange(
    event: LiveEvent,
    previousEvent: LiveEvent,
    homeScored: boolean,
    awayScored: boolean
  ): void {
    const scoringTeam = homeScored ? event.homeTeam : event.awayTeam;
    const triggerEvent = {
      type: 'goal' as const,
      description: `Goal scored by ${scoringTeam}`,
      expectedImpact: 'high' as const
    };

    logger.info('Goal detected, checking for latency arbitrage', {
      eventId: event.eventId,
      scoringTeam,
      minute: event.currentMinute
    });

    // Check for latency opportunities immediately
    this.checkForLatencyArbitrage(event, triggerEvent);
  }

  /**
   * Handle significant odds changes
   */
  private handleSignificantOddsChange(
    newOdds: BookmakerOdds,
    oldOdds: BookmakerOdds,
    changes: { isSignificant: boolean; magnitude: number; direction: string }
  ): void {
    const event = this.activeEvents.get(newOdds.eventId);
    if (!event) return;

    // Determine trigger event type
    let triggerEvent: LatencyArbitrageOpportunity['triggerEvent'];
    
    if (changes.magnitude > 0.3) {
      triggerEvent = {
        type: 'goal',
        description: `Major odds shift detected: ${changes.direction}`,
        expectedImpact: 'high'
      };
    } else if (changes.magnitude > 0.2) {
      triggerEvent = {
        type: 'red_card',
        description: `Significant odds movement: ${changes.direction}`,
        expectedImpact: 'high'
      };
    } else {
      triggerEvent = {
        type: 'momentum_shift',
        description: `Odds movement: ${changes.direction}`,
        expectedImpact: 'medium'
      };
    }

    this.checkForLatencyArbitrage(event, triggerEvent);
  }

  /**
   * Analyze odds changes between two updates
   */
  private analyzeOddsChanges(
    oldOdds: BookmakerOdds,
    newOdds: BookmakerOdds
  ): { isSignificant: boolean; magnitude: number; direction: string } {
    const changes: number[] = [];
    
    // Compare home win odds
    if (oldOdds.odds.homeWin && newOdds.odds.homeWin) {
      changes.push(Math.abs(newOdds.odds.homeWin - oldOdds.odds.homeWin) / oldOdds.odds.homeWin);
    }
    
    // Compare away win odds
    if (oldOdds.odds.awayWin && newOdds.odds.awayWin) {
      changes.push(Math.abs(newOdds.odds.awayWin - oldOdds.odds.awayWin) / oldOdds.odds.awayWin);
    }

    const maxChange = Math.max(...changes, 0);
    const isSignificant = maxChange > this.config.oddsChangeThreshold;
    
    const direction = newOdds.odds.homeWin < oldOdds.odds.homeWin ? 'home_favorite' : 'away_favorite';

    return { isSignificant, magnitude: maxChange, direction };
  }

  /**
   * Check for latency arbitrage opportunities
   */
  private checkForLatencyArbitrage(
    event: LiveEvent,
    triggerEvent: LatencyArbitrageOpportunity['triggerEvent']
  ): void {
    const eventOdds = this.bookmakerOdds.get(event.eventId);
    if (!eventOdds || eventOdds.size < 2) return;

    const bookmakerList = Array.from(eventOdds.values());
    
    // Sort by last updated time (most recent first)
    bookmakerList.sort((a, b) => b.lastUpdated - a.lastUpdated);

    // Find pairs with significant latency differences
    for (let i = 0; i < bookmakerList.length - 1; i++) {
      for (let j = i + 1; j < bookmakerList.length; j++) {
        const fast = bookmakerList[i];
        const slow = bookmakerList[j];
        
        const latencyDiff = fast.lastUpdated - slow.lastUpdated;
        
        if (latencyDiff < this.config.minLatencyDifferenceMs) continue;
        if (fast.isSuspended || slow.isSuspended) continue;

        // Check for arbitrage between fast and slow bookmakers
        const arbitrage = this.calculateLatencyArbitrage(fast, slow, event);
        
        if (arbitrage && arbitrage.profitPercent >= this.config.minProfitPercent) {
          this.createOpportunity(event, fast, slow, arbitrage, triggerEvent, latencyDiff);
        }
      }
    }
  }

  /**
   * Calculate latency arbitrage between two bookmakers
   */
  private calculateLatencyArbitrage(
    fastOdds: BookmakerOdds,
    slowOdds: BookmakerOdds,
    event: LiveEvent
  ): { profitPercent: number; fastSide: string; slowSide: string; fastOdds: number; slowOdds: number } | null {
    // Fast bookmaker has updated odds (reflecting the event)
    // Slow bookmaker still has old odds
    
    // Scenario 1: Home team scored, fast bookmaker lowered home odds
    // Bet on away/draw at fast bookmaker (higher odds) + bet on home at slow bookmaker (still good odds)
    
    const scenarios = [
      { fast: fastOdds.odds.homeWin, slow: slowOdds.odds.homeWin, side: 'home' },
      { fast: fastOdds.odds.draw, slow: slowOdds.odds.draw, side: 'draw' },
      { fast: fastOdds.odds.awayWin, slow: slowOdds.odds.awayWin, side: 'away' }
    ];

    let bestArbitrage: { profitPercent: number; fastSide: string; slowSide: string; fastOdds: number; slowOdds: number } | null = null;

    for (const scenario of scenarios) {
      if (!scenario.fast || !scenario.slow) continue;

      // Find the opposite side for the other bookmaker
      const otherSides = scenarios.filter(s => s.side !== scenario.side);
      
      for (const other of otherSides) {
        if (!other.fast || !other.slow) continue;

        // Calculate arbitrage: bet on scenario at slow bookmaker, opposite at fast
        const impliedProb1 = 1 / scenario.slow; // Slow bookmaker hasn't updated
        const impliedProb2 = 1 / other.fast; // Fast bookmaker has updated
        const totalProb = impliedProb1 + impliedProb2;

        if (totalProb < 1) {
          const profitPercent = (1 - totalProb) * 100;
          
          if (!bestArbitrage || profitPercent > bestArbitrage.profitPercent) {
            bestArbitrage = {
              profitPercent,
              fastSide: other.side,
              slowSide: scenario.side,
              fastOdds: other.fast,
              slowOdds: scenario.slow
            };
          }
        }
      }
    }

    return bestArbitrage;
  }

  /**
   * Create a latency arbitrage opportunity
   */
  private createOpportunity(
    event: LiveEvent,
    fastOdds: BookmakerOdds,
    slowOdds: BookmakerOdds,
    arbitrage: { profitPercent: number; fastSide: string; slowSide: string; fastOdds: number; slowOdds: number },
    triggerEvent: LatencyArbitrageOpportunity['triggerEvent'],
    latencyDiff: number
  ): void {
    const opportunityId = `latency-${event.eventId}-${Date.now()}`;
    
    const executionTimeMs = this.estimateExecutionTime(fastOdds.bookmaker, slowOdds.bookmaker);
    const windowClosingProbability = this.calculateWindowClosingProbability(
      latencyDiff,
      executionTimeMs,
      triggerEvent
    );

    const opportunity: LatencyArbitrageOpportunity = {
      id: opportunityId,
      type: 'latency_arbitrage',
      event,
      detectedAt: Date.now(),
      expectedDurationMs: latencyDiff * 2, // Window typically closes when slow bookmaker updates
      fastBookmaker: {
        id: fastOdds.bookmaker,
        odds: fastOdds,
        updateTime: fastOdds.lastUpdated
      },
      slowBookmaker: {
        id: slowOdds.bookmaker,
        odds: slowOdds,
        updateTime: slowOdds.lastUpdated
      },
      triggerEvent,
      arbitrageDetails: {
        profitPercent: arbitrage.profitPercent,
        recommendedStake: this.calculateRecommendedStake(arbitrage.profitPercent, windowClosingProbability),
        fastSide: arbitrage.fastSide as 'home' | 'away' | 'draw',
        slowSide: arbitrage.slowSide as 'home' | 'away' | 'draw',
        fastOdds: arbitrage.fastOdds,
        slowOdds: arbitrage.slowOdds
      },
      riskAssessment: {
        executionTimeMs,
        windowClosingProbability,
        accountRiskLevel: this.assessAccountRisk(fastOdds.bookmaker, slowOdds.bookmaker),
        recommendedMaxStake: this.calculateRecommendedStake(arbitrage.profitPercent, windowClosingProbability)
      },
      confidence: this.calculateConfidence(latencyDiff, executionTimeMs, windowClosingProbability)
    };

    this.detectedOpportunities.set(opportunityId, opportunity);
    
    logger.info('Latency arbitrage opportunity detected', {
      opportunityId,
      event: `${event.homeTeam} vs ${event.awayTeam}`,
      profit: opportunity.arbitrageDetails.profitPercent,
      fastBookmaker: fastOdds.bookmaker,
      slowBookmaker: slowOdds.bookmaker,
      latencyDiff
    });

    this.emit('opportunity:detected', opportunity);

    // Auto-expire opportunity after expected duration
    setTimeout(() => {
      this.expireOpportunity(opportunityId);
    }, opportunity.expectedDurationMs);
  }

  /**
   * Estimate execution time for placing bets on two bookmakers
   */
  private estimateExecutionTime(bookmakerA: string, bookmakerB: string): number {
    // Base execution time
    let time = 1500; // 1.5 seconds base
    
    // Add time for each bookmaker's API latency (estimated)
    time += 200; // Bookmaker A
    time += 200; // Bookmaker B
    
    // Add human/execution buffer
    time += 500;
    
    return Math.min(time, this.config.maxExecutionTimeMs);
  }

  /**
   * Calculate probability that the window closes before execution
   */
  private calculateWindowClosingProbability(
    latencyDiff: number,
    executionTime: number,
    triggerEvent: LatencyArbitrageOpportunity['triggerEvent']
  ): number {
    // Higher latency difference = more time to execute
    const timeRatio = executionTime / (latencyDiff + executionTime);
    
    // Base probability
    let probability = timeRatio;
    
    // Adjust based on trigger event type
    if (triggerEvent.expectedImpact === 'high') {
      probability *= 1.3; // High impact events close faster
    }
    
    // Cap at 90%
    return Math.min(probability, 0.9);
  }

  /**
   * Assess account risk level
   */
  private assessAccountRisk(bookmakerA: string, bookmakerB: string): 'low' | 'medium' | 'high' {
    // Latency arbitrage is high-risk for account health
    // Bookmakers monitor for this behavior
    return 'high';
  }

  /**
   * Calculate recommended stake based on profit and risk
   */
  private calculateRecommendedStake(profitPercent: number, windowClosingProbability: number): number {
    // Kelly Criterion adaptation
    const winProbability = 1 - windowClosingProbability;
    const lossProbability = windowClosingProbability;
    const netOdds = profitPercent / 100;
    
    // Kelly fraction
    const kellyFraction = (winProbability * netOdds - lossProbability) / netOdds;
    
    // Use 25% of Kelly for safety
    const safeFraction = Math.max(0, kellyFraction * 0.25);
    
    // Base stake $100
    return Math.min(100 * safeFraction, 50); // Cap at $50 for latency arbitrage
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    latencyDiff: number,
    executionTime: number,
    windowClosingProbability: number
  ): number {
    let confidence = 1.0;
    
    // Reduce confidence if execution time is close to latency difference
    if (executionTime > latencyDiff * 0.5) {
      confidence *= 0.7;
    }
    
    // Reduce confidence based on window closing probability
    confidence *= (1 - windowClosingProbability);
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Expire an opportunity
   */
  private expireOpportunity(opportunityId: string): void {
    const opportunity = this.detectedOpportunities.get(opportunityId);
    if (opportunity) {
      this.detectedOpportunities.delete(opportunityId);
      this.emit('opportunity:expired', opportunity);
      
      logger.debug('Latency arbitrage opportunity expired', { opportunityId });
    }
  }

  /**
   * Get active opportunities
   */
  public getActiveOpportunities(
    filters?: {
      minProfit?: number;
      maxRisk?: number;
      bookmaker?: string;
    }
  ): LatencyArbitrageOpportunity[] {
    let opportunities = Array.from(this.detectedOpportunities.values());

    if (filters?.minProfit) {
      opportunities = opportunities.filter(o => 
        o.arbitrageDetails.profitPercent >= filters.minProfit!
      );
    }

    if (filters?.maxRisk) {
      opportunities = opportunities.filter(o => 
        o.riskAssessment.windowClosingProbability <= filters.maxRisk!
      );
    }

    if (filters?.bookmaker) {
      opportunities = opportunities.filter(o => 
        o.fastBookmaker.id === filters.bookmaker || o.slowBookmaker.id === filters.bookmaker
      );
    }

    return opportunities.sort((a, b) => 
      b.arbitrageDetails.profitPercent - a.arbitrageDetails.profitPercent
    );
  }

  /**
   * Get detector statistics
   */
  public getStats(): {
    isRunning: boolean;
    activeEvents: number;
    activeOpportunities: number;
    totalOddsUpdates: number;
    config: LatencyDetectorConfig;
  } {
    let totalOddsUpdates = 0;
    for (const history of this.oddsHistory.values()) {
      totalOddsUpdates += history.length;
    }

    return {
      isRunning: this.isRunning,
      activeEvents: this.activeEvents.size,
      activeOpportunities: this.detectedOpportunities.size,
      totalOddsUpdates,
      config: this.config
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<LatencyDetectorConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Latency detector config updated', { config: this.config });
    this.emit('config:updated', this.config);
  }
}

export default LatencyArbitrageDetector;
