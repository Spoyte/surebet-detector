/**
 * Latency Arbitrage Detector Tests
 */

import { LatencyArbitrageDetector, LiveEvent, BookmakerOdds } from '../latency-arbitrage-detector.js';

describe('LatencyArbitrageDetector', () => {
  let detector: LatencyArbitrageDetector;

  beforeEach(() => {
    detector = new LatencyArbitrageDetector({
      minProfitPercent: 0.5,
      maxExecutionTimeMs: 3000,
      minLatencyDifferenceMs: 500
    });
  });

  afterEach(async () => {
    await detector.stop();
  });

  describe('Basic Operations', () => {
    it('should start and stop correctly', async () => {
      await detector.start();
      expect(detector.getStats().isRunning).toBe(true);
      
      await detector.stop();
      expect(detector.getStats().isRunning).toBe(false);
    });

    it('should track active events', async () => {
      await detector.start();
      
      const event: LiveEvent = {
        eventId: 'match-001',
        sport: 'soccer',
        league: 'Premier League',
        homeTeam: 'Manchester United',
        awayTeam: 'Liverpool',
        startTime: Date.now() - 30 * 60 * 1000, // 30 min ago
        currentScore: { home: 0, away: 0 },
        matchStatus: 'first_half',
        currentMinute: 30
      };

      detector.processLiveEvent(event);
      
      expect(detector.getStats().activeEvents).toBe(1);
    });
  });

  describe('Goal Detection', () => {
    it('should detect score changes', async () => {
      await detector.start();
      
      const event1: LiveEvent = {
        eventId: 'match-001',
        sport: 'soccer',
        league: 'Premier League',
        homeTeam: 'Manchester United',
        awayTeam: 'Liverpool',
        startTime: Date.now() - 30 * 60 * 1000,
        currentScore: { home: 0, away: 0 },
        matchStatus: 'first_half',
        currentMinute: 30
      };

      detector.processLiveEvent(event1);

      const event2: LiveEvent = {
        ...event1,
        currentScore: { home: 1, away: 0 },
        currentMinute: 32
      };

      const opportunityPromise = new Promise((resolve) => {
        detector.on('opportunity:detected', resolve);
      });

      // Add odds from two bookmakers with latency difference
      const now = Date.now();
      
      const fastOdds: BookmakerOdds = {
        bookmaker: 'pinnacle',
        eventId: 'match-001',
        timestamp: now,
        latencyMs: 100,
        odds: {
          homeWin: 1.4, // Lowered after goal
          draw: 4.5,
          awayWin: 8.0
        },
        lastUpdated: now,
        isSuspended: false
      };

      const slowOdds: BookmakerOdds = {
        bookmaker: 'bet365',
        eventId: 'match-001',
        timestamp: now - 2000, // 2 seconds behind
        latencyMs: 2100,
        odds: {
          homeWin: 2.0, // Still showing pre-goal odds
          draw: 3.4,
          awayWin: 3.8
        },
        lastUpdated: now - 2000,
        isSuspended: false
      };

      detector.processOddsUpdate(slowOdds);
      detector.processOddsUpdate(fastOdds);
      detector.processLiveEvent(event2);

      const opportunity: any = await opportunityPromise;
      
      expect(opportunity).toBeDefined();
      expect(opportunity.type).toBe('latency_arbitrage');
      expect(opportunity.fastBookmaker.id).toBe('pinnacle');
      expect(opportunity.slowBookmaker.id).toBe('bet365');
    });
  });

  describe('Odds Change Detection', () => {
    it('should detect significant odds changes', async () => {
      await detector.start();
      
      const event: LiveEvent = {
        eventId: 'match-002',
        sport: 'soccer',
        league: 'La Liga',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        startTime: Date.now() - 45 * 60 * 1000,
        currentScore: { home: 0, away: 0 },
        matchStatus: 'first_half',
        currentMinute: 45
      };

      detector.processLiveEvent(event);

      const now = Date.now();
      
      const oldOdds: BookmakerOdds = {
        bookmaker: 'betfair',
        eventId: 'match-002',
        timestamp: now - 5000,
        latencyMs: 200,
        odds: {
          homeWin: 2.5,
          draw: 3.2,
          awayWin: 2.8
        },
        lastUpdated: now - 5000,
        isSuspended: false
      };

      const newOdds: BookmakerOdds = {
        bookmaker: 'betfair',
        eventId: 'match-002',
        timestamp: now,
        latencyMs: 200,
        odds: {
          homeWin: 1.6, // 36% drop - significant
          draw: 3.8,
          awayWin: 5.5
        },
        lastUpdated: now,
        isSuspended: false
      };

      detector.processOddsUpdate(oldOdds);
      
      const changePromise = new Promise((resolve) => {
        setTimeout(resolve, 100); // Give time for processing
      });

      detector.processOddsUpdate(newOdds);
      await changePromise;

      // Should have recorded the odds change
      const stats = detector.getStats();
      expect(stats.totalOddsUpdates).toBe(2);
    });
  });

  describe('Arbitrage Calculation', () => {
    it('should calculate correct arbitrage profit', async () => {
      await detector.start();
      
      const event: LiveEvent = {
        eventId: 'match-003',
        sport: 'soccer',
        league: 'Serie A',
        homeTeam: 'Juventus',
        awayTeam: 'AC Milan',
        startTime: Date.now() - 20 * 60 * 1000,
        currentScore: { home: 0, away: 0 },
        matchStatus: 'first_half',
        currentMinute: 20
      };

      detector.processLiveEvent(event);

      const now = Date.now();
      
      // Fast bookmaker has updated odds after home goal
      const fastOdds: BookmakerOdds = {
        bookmaker: 'pinnacle',
        eventId: 'match-003',
        timestamp: now,
        latencyMs: 100,
        odds: {
          homeWin: 1.35,
          draw: 4.8,
          awayWin: 9.0
        },
        lastUpdated: now,
        isSuspended: false
      };

      // Slow bookmaker hasn't updated yet
      const slowOdds: BookmakerOdds = {
        bookmaker: 'unibet',
        eventId: 'match-003',
        timestamp: now - 3000,
        latencyMs: 3100,
        odds: {
          homeWin: 2.1, // Still showing pre-goal odds
          draw: 3.3,
          awayWin: 3.6
        },
        lastUpdated: now - 3000,
        isSuspended: false
      };

      const opportunityPromise = new Promise((resolve) => {
        detector.on('opportunity:detected', resolve);
      });

      detector.processOddsUpdate(slowOdds);
      detector.processOddsUpdate(fastOdds);

      // Trigger with goal
      const goalEvent: LiveEvent = {
        ...event,
        currentScore: { home: 1, away: 0 },
        currentMinute: 22
      };
      detector.processLiveEvent(goalEvent);

      const opportunity: any = await opportunityPromise;
      
      expect(opportunity.arbitrageDetails.profitPercent).toBeGreaterThan(0);
      expect(opportunity.arbitrageDetails.fastSide).toBeDefined();
      expect(opportunity.arbitrageDetails.slowSide).toBeDefined();
    });
  });

  describe('Risk Assessment', () => {
    it('should assess high account risk for latency arbitrage', async () => {
      await detector.start();
      
      const event: LiveEvent = {
        eventId: 'match-004',
        sport: 'soccer',
        league: 'Bundesliga',
        homeTeam: 'Bayern Munich',
        awayTeam: 'Dortmund',
        startTime: Date.now() - 15 * 60 * 1000,
        currentScore: { home: 0, away: 0 },
        matchStatus: 'first_half',
        currentMinute: 15
      };

      detector.processLiveEvent(event);

      const now = Date.now();
      
      const fastOdds: BookmakerOdds = {
        bookmaker: 'pinnacle',
        eventId: 'match-004',
        timestamp: now,
        latencyMs: 100,
        odds: {
          homeWin: 1.5,
          draw: 4.2,
          awayWin: 6.5
        },
        lastUpdated: now,
        isSuspended: false
      };

      const slowOdds: BookmakerOdds = {
        bookmaker: 'bet365',
        eventId: 'match-004',
        timestamp: now - 1500,
        latencyMs: 1600,
        odds: {
          homeWin: 1.9,
          draw: 3.4,
          awayWin: 4.2
        },
        lastUpdated: now - 1500,
        isSuspended: false
      };

      const opportunityPromise = new Promise((resolve) => {
        detector.on('opportunity:detected', resolve);
      });

      detector.processOddsUpdate(slowOdds);
      detector.processOddsUpdate(fastOdds);

      const goalEvent: LiveEvent = {
        ...event,
        currentScore: { home: 1, away: 0 },
        currentMinute: 16
      };
      detector.processLiveEvent(goalEvent);

      const opportunity: any = await opportunityPromise;
      
      expect(opportunity.riskAssessment.accountRiskLevel).toBe('high');
      expect(opportunity.riskAssessment.windowClosingProbability).toBeGreaterThan(0);
      expect(opportunity.riskAssessment.executionTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Opportunity Filtering', () => {
    it('should filter opportunities by minimum profit', async () => {
      await detector.start();
      
      // Create multiple opportunities
      const opportunities = [
        {
          id: 'opp-1',
          type: 'latency_arbitrage' as const,
          arbitrageDetails: { profitPercent: 0.3 },
          riskAssessment: { windowClosingProbability: 0.3 }
        },
        {
          id: 'opp-2',
          type: 'latency_arbitrage' as const,
          arbitrageDetails: { profitPercent: 1.5 },
          riskAssessment: { windowClosingProbability: 0.2 }
        },
        {
          id: 'opp-3',
          type: 'latency_arbitrage' as const,
          arbitrageDetails: { profitPercent: 2.0 },
          riskAssessment: { windowClosingProbability: 0.4 }
        }
      ];

      // Manually add opportunities for testing
      for (const opp of opportunities) {
        (detector as any).detectedOpportunities.set(opp.id, opp);
      }

      const filtered = detector.getActiveOpportunities({ minProfit: 1.0 });
      
      expect(filtered).toHaveLength(2);
      expect(filtered.every(o => o.arbitrageDetails.profitPercent >= 1.0)).toBe(true);
    });

    it('should filter opportunities by maximum risk', async () => {
      await detector.start();
      
      const opportunities = [
        {
          id: 'opp-1',
          type: 'latency_arbitrage' as const,
          arbitrageDetails: { profitPercent: 1.0 },
          riskAssessment: { windowClosingProbability: 0.8 }
        },
        {
          id: 'opp-2',
          type: 'latency_arbitrage' as const,
          arbitrageDetails: { profitPercent: 1.0 },
          riskAssessment: { windowClosingProbability: 0.3 }
        }
      ];

      for (const opp of opportunities) {
        (detector as any).detectedOpportunities.set(opp.id, opp);
      }

      const filtered = detector.getActiveOpportunities({ maxRisk: 0.5 });
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('opp-2');
    });
  });

  describe('Configuration', () => {
    it('should update configuration', async () => {
      await detector.start();
      
      detector.updateConfig({
        minProfitPercent: 1.0,
        maxExecutionTimeMs: 2000
      });

      const stats = detector.getStats();
      expect(stats.config.minProfitPercent).toBe(1.0);
      expect(stats.config.maxExecutionTimeMs).toBe(2000);
    });
  });

  describe('Opportunity Expiration', () => {
    it('should expire opportunities after expected duration', async () => {
      await detector.start();
      
      const opportunity = {
        id: 'test-opp',
        type: 'latency_arbitrage' as const,
        event: { eventId: 'test' },
        expectedDurationMs: 100, // Very short for testing
        arbitrageDetails: { profitPercent: 1.0 },
        riskAssessment: { windowClosingProbability: 0.3 }
      };

      (detector as any).detectedOpportunities.set(opportunity.id, opportunity);

      const expirePromise = new Promise((resolve) => {
        detector.on('opportunity:expired', resolve);
      });

      // Manually trigger expiration
      (detector as any).expireOpportunity('test-opp');

      const expired: any = await expirePromise;
      expect(expired.id).toBe('test-opp');
      expect(detector.getActiveOpportunities()).toHaveLength(0);
    });
  });
});
