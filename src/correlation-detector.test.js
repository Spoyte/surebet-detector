/**
 * Correlation Detector Test Suite
 */

const CorrelationDetector = require('./correlation-detector');

describe('CorrelationDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new CorrelationDetector({
      correlationThreshold: 0.7,
      maxExposurePerEvent: 1000,
      maxExposurePerTeam: 2000,
      maxExposurePerLeague: 5000
    });
  });

  describe('market correlations', () => {
    test('should return 1.0 for same market', () => {
      expect(detector.getMarketCorrelation('1X2', '1X2')).toBe(1.0);
    });

    test('should return high correlation for related markets', () => {
      expect(detector.getMarketCorrelation('1X2', 'double_chance_1x')).toBe(0.95);
      expect(detector.getMarketCorrelation('asian_handicap', 'european_handicap')).toBe(0.95);
    });

    test('should return low correlation for unrelated markets', () => {
      const correlation = detector.getMarketCorrelation('1X2', 'over_under');
      expect(correlation).toBe(0.3);
    });

    test('should return default low correlation for unknown pairs', () => {
      expect(detector.getMarketCorrelation('unknown1', 'unknown2')).toBe(0.1);
    });
  });

  describe('bet correlation calculation', () => {
    test('should detect high correlation for same event', () => {
      const bet1 = {
        eventId: 'evt1',
        market: '1X2',
        homeTeam: 'Team A',
        awayTeam: 'Team B'
      };
      const bet2 = {
        eventId: 'evt1',
        market: 'double_chance_1x',
        homeTeam: 'Team A',
        awayTeam: 'Team B'
      };

      const correlation = detector.calculateBetCorrelation(bet1, bet2);
      expect(correlation).toBe(0.95);
    });

    test('should detect correlation for shared teams', () => {
      const bet1 = {
        eventId: 'evt1',
        market: '1X2',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        league: 'Premier League'
      };
      const bet2 = {
        eventId: 'evt2',
        market: '1X2',
        homeTeam: 'Team A',
        awayTeam: 'Team C',
        league: 'Premier League'
      };

      const correlation = detector.calculateBetCorrelation(bet1, bet2);
      expect(correlation).toBeGreaterThan(0);
    });

    test('should return 0 for completely unrelated bets', () => {
      const bet1 = {
        eventId: 'evt1',
        market: '1X2',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        league: 'League 1',
        sport: 'soccer'
      };
      const bet2 = {
        eventId: 'evt2',
        market: '1X2',
        homeTeam: 'Team C',
        awayTeam: 'Team D',
        league: 'League 2',
        sport: 'tennis'
      };

      const correlation = detector.calculateBetCorrelation(bet1, bet2);
      expect(correlation).toBe(0);
    });
  });

  describe('bet registration', () => {
    test('should register a bet successfully', () => {
      const bet = {
        eventId: 'evt1',
        eventName: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        team: 'Team A',
        league: 'Premier League',
        sport: 'soccer',
        market: '1X2',
        outcome: 'home',
        odds: 2.0,
        stake: 100,
        bookmaker: 'Unibet'
      };

      const result = detector.registerBet(bet);

      expect(result.betId).toBeDefined();
      expect(result.correlatedBets).toEqual([]);
      expect(result.canPlace).toBe(true);
      expect(detector.activeBets.size).toBe(1);
    });

    test('should detect correlated bets', () => {
      // Register first bet
      detector.registerBet({
        id: 'bet1',
        eventId: 'evt1',
        eventName: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        league: 'Premier League',
        sport: 'soccer',
        market: '1X2',
        outcome: 'home',
        stake: 100,
        odds: 2.0
      });

      // Register correlated bet
      const result = detector.registerBet({
        id: 'bet2',
        eventId: 'evt1',
        eventName: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        league: 'Premier League',
        sport: 'soccer',
        market: 'double_chance_1x',
        outcome: '1x',
        stake: 100,
        odds: 1.4
      });

      expect(result.correlatedBets.length).toBe(1);
      expect(result.correlatedBets[0].id).toBe('bet1');
      expect(result.aggregateCorrelation).toBeGreaterThan(0.7);
    });

    test('should detect exposure limit violations', () => {
      // Register bet at limit
      detector.registerBet({
        id: 'bet1',
        eventId: 'evt1',
        eventName: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        team: 'Team A',
        league: 'Premier League',
        sport: 'soccer',
        market: '1X2',
        stake: 1000,
        odds: 2.0
      });

      // Try to add more to same event
      const result = detector.registerBet({
        id: 'bet2',
        eventId: 'evt1',
        eventName: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        team: 'Team A',
        league: 'Premier League',
        sport: 'soccer',
        market: 'over_under',
        stake: 100,
        odds: 1.9
      });

      expect(result.exposureCheck.wouldExceed).toBe(true);
      expect(result.exposureCheck.exceeded).toContain('event');
      expect(result.canPlace).toBe(false);
    });
  });

  describe('exposure tracking', () => {
    test('should track event exposures', () => {
      detector.registerBet({
        eventId: 'evt1',
        stake: 100
      });
      detector.registerBet({
        eventId: 'evt1',
        stake: 150
      });
      detector.registerBet({
        eventId: 'evt2',
        stake: 200
      });

      const summary = detector.getExposureSummary();
      expect(summary.events.evt1).toBe(250);
      expect(summary.events.evt2).toBe(200);
    });

    test('should reduce exposure on settlement', () => {
      const result = detector.registerBet({
        id: 'bet1',
        eventId: 'evt1',
        team: 'Team A',
        league: 'Premier League',
        stake: 100
      });

      expect(detector.eventExposures.get('evt1')).toBe(100);

      detector.settleBet(result.betId, { profit: 50 });

      expect(detector.eventExposures.get('evt1')).toBe(0);
      expect(detector.activeBets.size).toBe(0);
      expect(detector.betHistory.length).toBe(1);
    });
  });

  describe('correlation groups', () => {
    test('should create correlation groups', () => {
      detector.registerBet({
        id: 'bet1',
        eventId: 'evt1',
        market: '1X2',
        stake: 100
      });

      detector.registerBet({
        id: 'bet2',
        eventId: 'evt1',
        market: 'double_chance_1x',
        stake: 100
      });

      detector.registerBet({
        id: 'bet3',
        eventId: 'evt1',
        market: 'asian_handicap',
        stake: 100
      });

      const groups = detector.getCorrelationGroups();
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0].bets.length).toBe(3);
    });
  });

  describe('opportunity analysis', () => {
    test('should analyze opportunity for risks', () => {
      // Setup existing bet
      detector.registerBet({
        id: 'bet1',
        eventId: 'evt1',
        eventName: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        league: 'Premier League',
        sport: 'soccer',
        market: '1X2',
        stake: 500
      });

      const opportunity = {
        eventId: 'evt1',
        event: 'Team A vs Team B',
        homeTeam: 'Team A',
        awayTeam: 'Team B',
        league: 'Premier League',
        sport: 'soccer',
        legs: [{
          market: 'double_chance_1x',
          outcome: '1x',
          bookmaker: 'Unibet',
          odds: 1.4,
          stake: 200
        }]
      };

      const analysis = detector.analyzeOpportunity(opportunity);

      expect(analysis.riskLevel).toBe('high');
      expect(analysis.risks.length).toBeGreaterThan(0);
      expect(analysis.canProceed).toBe(false);
    });

    test('should allow low-risk opportunities', () => {
      const opportunity = {
        eventId: 'evt2',
        event: 'Team C vs Team D',
        homeTeam: 'Team C',
        awayTeam: 'Team D',
        league: 'La Liga',
        sport: 'soccer',
        legs: [{
          market: '1X2',
          outcome: 'home',
          bookmaker: 'Unibet',
          odds: 2.0,
          stake: 100
        }]
      };

      const analysis = detector.analyzeOpportunity(opportunity);

      expect(analysis.riskLevel).toBe('low');
      expect(analysis.canProceed).toBe(true);
    });
  });

  describe('diversification score', () => {
    test('should return 100 for empty portfolio', () => {
      expect(detector.getDiversificationScore()).toBe(100);
    });

    test('should calculate diversification score', () => {
      // Add bets across different events and leagues
      detector.registerBet({
        eventId: 'evt1',
        league: 'Premier League',
        market: '1X2',
        stake: 100
      });
      detector.registerBet({
        eventId: 'evt2',
        league: 'La Liga',
        market: 'over_under',
        stake: 100
      });
      detector.registerBet({
        eventId: 'evt3',
        league: 'Bundesliga',
        market: 'btts',
        stake: 100
      });

      const score = detector.getDiversificationScore();
      expect(score).toBeGreaterThan(50);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('recommendations', () => {
    test('should provide recommendations', () => {
      // Add multiple correlated bets
      for (let i = 0; i < 5; i++) {
        detector.registerBet({
          id: `bet${i}`,
          eventId: 'evt1',
          league: 'Premier League',
          market: '1X2',
          stake: 200
        });
      }

      const recommendations = detector.getRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.type === 'diversify')).toBe(true);
    });
  });

  describe('events', () => {
    test('should emit betRegistered event', (done) => {
      detector.on('betRegistered', (data) => {
        expect(data.bet).toBeDefined();
        expect(data.exposureCheck).toBeDefined();
        done();
      });

      detector.registerBet({
        eventId: 'evt1',
        stake: 100
      });
    });

    test('should emit exposureWarning event', (done) => {
      detector.on('exposureWarning', (data) => {
        expect(data.exposureCheck.wouldExceed).toBe(true);
        done();
      });

      detector.registerBet({
        eventId: 'evt1',
        stake: 1000
      });

      detector.registerBet({
        eventId: 'evt1',
        stake: 100
      });
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  const { execSync } = require('child_process');
  try {
    execSync('npx jest correlation-detector.test.js --colors', {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (e) {
    process.exit(1);
  }
}
