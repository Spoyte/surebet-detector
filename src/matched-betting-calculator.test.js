/**
 * Tests for MatchedBettingCalculator
 */

const MatchedBettingCalculator = require('./matched-betting-calculator');

describe('MatchedBettingCalculator', () => {
  let calculator;

  beforeEach(() => {
    calculator = new MatchedBettingCalculator();
  });

  describe('Qualifying Bet Calculator', () => {
    test('calculates qualifying bet correctly', () => {
      const result = calculator.calculateQualifyingBet({
        stake: 10,
        backOdds: 2.0,
        layOdds: 2.05,
        commission: 0.05
      });

      expect(result.type).toBe('qualifying');
      expect(result.stake).toBe(10);
      expect(result.backOdds).toBe(2.0);
      expect(result.layOdds).toBe(2.05);
      expect(result.layStake).toBeCloseTo(9.76, 1);
      expect(result.qualifyingLoss).toBeGreaterThan(0);
      expect(result.lossPercentage).toBeGreaterThan(0);
    });

    test('throws error for invalid inputs', () => {
      expect(() => calculator.calculateQualifyingBet({
        stake: 0,
        backOdds: 2.0,
        layOdds: 2.05
      })).toThrow('Invalid input');

      expect(() => calculator.calculateQualifyingBet({
        stake: 10,
        backOdds: 1.0,
        layOdds: 2.05
      })).toThrow('Invalid input');
    });

    test('marks as optimal when loss is below threshold', () => {
      // Very close odds should result in minimal loss
      const result = calculator.calculateQualifyingBet({
        stake: 10,
        backOdds: 2.0,
        layOdds: 2.02,
        commission: 0.02
      });

      expect(result.isOptimal).toBeDefined();
      expect(typeof result.isOptimal).toBe('boolean');
    });
  });

  describe('Free Bet SNR Calculator', () => {
    test('calculates SNR free bet correctly', () => {
      const result = calculator.calculateFreeBetSNR({
        freeBetAmount: 10,
        backOdds: 5.0,
        layOdds: 5.2,
        commission: 0.05
      });

      expect(result.type).toBe('free-bet-snr');
      expect(result.freeBetAmount).toBe(10);
      expect(result.method).toBe('SNR');
      expect(result.layStake).toBeGreaterThan(0);
      expect(result.guaranteedProfit).toBeGreaterThan(0);
      expect(result.conversionRate).toBeGreaterThan(0);
    });

    test('higher odds give better conversion rate', () => {
      const lowOdds = calculator.calculateFreeBetSNR({
        freeBetAmount: 10,
        backOdds: 2.0,
        layOdds: 2.1,
        commission: 0.05
      });

      const highOdds = calculator.calculateFreeBetSNR({
        freeBetAmount: 10,
        backOdds: 10.0,
        layOdds: 10.5,
        commission: 0.05
      });

      expect(highOdds.conversionRate).toBeGreaterThan(lowOdds.conversionRate);
    });

    test('throws error for invalid inputs', () => {
      expect(() => calculator.calculateFreeBetSNR({
        freeBetAmount: -10,
        backOdds: 2.0,
        layOdds: 2.1
      })).toThrow('Invalid input');
    });
  });

  describe('Free Bet SR Calculator', () => {
    test('calculates SR free bet correctly', () => {
      const result = calculator.calculateFreeBetSR({
        freeBetAmount: 10,
        backOdds: 2.0,
        layOdds: 2.1,
        commission: 0.05
      });

      expect(result.type).toBe('free-bet-sr');
      expect(result.method).toBe('SR');
      expect(result.guaranteedProfit).toBeGreaterThan(0);
    });
  });

  describe('Risk-Free Bet Calculator', () => {
    test('calculates risk-free bet with cash refund', () => {
      const result = calculator.calculateRiskFreeBet({
        stake: 10,
        backOdds: 2.0,
        layOdds: 2.1,
        refundAmount: 10,
        refundType: 'cash',
        commission: 0.05
      });

      expect(result.type).toBe('risk-free');
      expect(result.refundType).toBe('cash');
      expect(result.expectedValue).toBeDefined();
      expect(result.worstCase).toBeDefined();
      expect(result.bestCase).toBeDefined();
    });

    test('calculates risk-free bet with free bet refund', () => {
      const result = calculator.calculateRiskFreeBet({
        stake: 10,
        backOdds: 2.0,
        layOdds: 2.1,
        refundAmount: 10,
        refundType: 'free-bet',
        commission: 0.05
      });

      expect(result.refundType).toBe('free-bet');
      expect(result.outcomes.layWin.refundValue).toBeLessThan(10); // 75% of refund
    });
  });

  describe('Each-Way Bet Calculator', () => {
    test('calculates each-way bet correctly', () => {
      const result = calculator.calculateEachWayBet({
        stake: 10,
        winOdds: 10.0,
        placeOdds: 2.5, // 1/4 of win odds
        layWinOdds: 10.5,
        layPlaceOdds: 2.8,
        commission: 0.05
      });

      expect(result.type).toBe('each-way');
      expect(result.winStake).toBe(5);
      expect(result.placeStake).toBe(5);
      expect(result.outcomes.win).toBeDefined();
      expect(result.outcomes.place).toBeDefined();
      expect(result.outcomes.lose).toBeDefined();
    });
  });

  describe('Optimal Odds Finder', () => {
    test('finds best conversion rate from available odds', () => {
      const availableOdds = [
        { backOdds: 2.0, layOdds: 2.1, event: 'Match A' },
        { backOdds: 5.0, layOdds: 5.2, event: 'Match B' },
        { backOdds: 10.0, layOdds: 10.5, event: 'Match C' }
      ];

      const result = calculator.findOptimalFreeBetOdds(10, availableOdds, 0.05);

      expect(result.bestOption).toBeDefined();
      expect(result.allOptions).toHaveLength(3);
      expect(result.recommendation).toContain('Best conversion');
      // Higher odds should give better conversion
      expect(result.bestOption.backOdds).toBe(10.0);
    });

    test('throws error for empty odds array', () => {
      expect(() => calculator.findOptimalFreeBetOdds(10, [])).toThrow('non-empty array');
    });
  });

  describe('Promotion Management', () => {
    test('registers a promotion', () => {
      const promo = calculator.registerPromotion({
        bookmaker: 'Bet365',
        type: 'free-bet',
        value: 10,
        minOdds: 1.5,
        expiryDate: '2026-12-31'
      });

      expect(promo.id).toBeDefined();
      expect(promo.bookmaker).toBe('Bet365');
      expect(promo.status).toBe('active');
      expect(calculator.getActivePromotions()).toHaveLength(1);
    });

    test('returns active promotions sorted by expiry', () => {
      calculator.registerPromotion({
        bookmaker: 'Bookmaker A',
        type: 'free-bet',
        value: 10,
        expiryDate: '2026-12-31'
      });

      calculator.registerPromotion({
        bookmaker: 'Bookmaker B',
        type: 'risk-free',
        value: 20,
        expiryDate: '2026-01-31'
      });

      const active = calculator.getActivePromotions();
      expect(active).toHaveLength(2);
      // Should be sorted by expiry date
      expect(new Date(active[0].expiryDate)).toBeLessThan(new Date(active[1].expiryDate));
    });
  });

  describe('Bet Tracking', () => {
    test('tracks a bet', () => {
      const betId = calculator.trackBet({
        type: 'qualifying',
        bookmaker: 'Bet365',
        exchange: 'Betfair',
        event: 'Team A vs Team B',
        selection: 'Team A',
        stake: 10,
        backOdds: 2.0,
        layOdds: 2.05,
        layStake: 9.76,
        expectedProfit: -0.24
      });

      expect(betId).toBeDefined();
      expect(calculator.getActiveBets()).toHaveLength(1);
    });

    test('settles a bet', () => {
      const betId = calculator.trackBet({
        type: 'qualifying',
        bookmaker: 'Bet365',
        exchange: 'Betfair',
        event: 'Team A vs Team B',
        selection: 'Team A',
        stake: 10,
        backOdds: 2.0,
        layOdds: 2.05,
        layStake: 9.76,
        expectedProfit: -0.24
      });

      const settled = calculator.settleBet(betId, 'lay-win', -0.25);

      expect(settled.status).toBe('settled');
      expect(settled.outcome).toBe('lay-win');
      expect(settled.actualProfit).toBe(-0.25);
      expect(calculator.getActiveBets()).toHaveLength(0);
    });

    test('throws error when settling non-existent bet', () => {
      expect(() => calculator.settleBet('non-existent', 'back-win')).toThrow('Bet not found');
    });
  });

  describe('Profit Summary', () => {
    beforeEach(() => {
      // Add some completed bets
      const bet1 = calculator.trackBet({
        type: 'qualifying',
        bookmaker: 'Bet365',
        stake: 10,
        expectedProfit: -0.20
      });
      calculator.settleBet(bet1, 'lay-win', -0.20);

      const bet2 = calculator.trackBet({
        type: 'free-bet-snr',
        bookmaker: 'Bet365',
        stake: 10,
        expectedProfit: 7.50
      });
      calculator.settleBet(bet2, 'lay-win', 7.50);
    });

    test('calculates profit summary', () => {
      const summary = calculator.getProfitSummary();

      expect(summary.totalBets).toBe(2);
      expect(summary.totalProfit).toBe(7.30); // 7.50 - 0.20
      expect(summary.byType).toBeDefined();
      expect(summary.byType['qualifying']).toBeDefined();
      expect(summary.byType['free-bet-snr']).toBeDefined();
    });

    test('filters by bookmaker', () => {
      const summary = calculator.getProfitSummary({ bookmaker: 'Bet365' });
      expect(summary.totalBets).toBe(2);

      const emptySummary = calculator.getProfitSummary({ bookmaker: 'NonExistent' });
      expect(emptySummary.totalBets).toBe(0);
    });

    test('filters by type', () => {
      const summary = calculator.getProfitSummary({ type: 'free-bet-snr' });
      expect(summary.totalBets).toBe(1);
      expect(summary.totalProfit).toBe(7.50);
    });
  });

  describe('Tax Reporting Export', () => {
    test('exports data for tax reporting', () => {
      const betId = calculator.trackBet({
        type: 'qualifying',
        bookmaker: 'Bet365',
        exchange: 'Betfair',
        event: 'Team A vs Team B',
        selection: 'Team A',
        stake: 10,
        expectedProfit: 5.0
      });
      calculator.settleBet(betId, 'back-win', 5.0);

      const export_ = calculator.exportForTaxReporting();

      expect(export_).toHaveLength(1);
      expect(export_[0]).toHaveProperty('date');
      expect(export_[0]).toHaveProperty('bookmaker');
      expect(export_[0]).toHaveProperty('profit');
      expect(export_[0]).toHaveProperty('type');
    });
  });

  describe('Report Generation', () => {
    test('generates comprehensive report', () => {
      calculator.registerPromotion({
        bookmaker: 'Bet365',
        type: 'free-bet',
        value: 10,
        expiryDate: new Date(Date.now() + 86400000).toISOString() // Tomorrow
      });

      const report = calculator.generateReport();

      expect(report.generatedAt).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.activePromotions).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    test('generates expiring promotion warning', () => {
      calculator.registerPromotion({
        bookmaker: 'Bet365',
        type: 'free-bet',
        value: 10,
        expiryDate: new Date(Date.now() + 86400000).toISOString() // Tomorrow
      });

      const recommendations = calculator.generateRecommendations();

      const urgentRec = recommendations.find(r => r.type === 'urgent');
      expect(urgentRec).toBeDefined();
      expect(urgentRec.message).toContain('expiring soon');
    });
  });

  describe('Event Emitter', () => {
    test('emits promotion:registered event', (done) => {
      calculator.on('promotion:registered', (promo) => {
        expect(promo.bookmaker).toBe('TestBook');
        done();
      });

      calculator.registerPromotion({
        bookmaker: 'TestBook',
        type: 'free-bet',
        value: 10
      });
    });

    test('emits bet:tracked event', (done) => {
      calculator.on('bet:tracked', (bet) => {
        expect(bet.bookmaker).toBe('TestBook');
        done();
      });

      calculator.trackBet({
        type: 'qualifying',
        bookmaker: 'TestBook',
        stake: 10
      });
    });

    test('emits bet:settled event', (done) => {
      const betId = calculator.trackBet({
        type: 'qualifying',
        bookmaker: 'TestBook',
        stake: 10
      });

      calculator.on('bet:settled', (bet) => {
        expect(bet.id).toBe(betId);
        expect(bet.status).toBe('settled');
        done();
      });

      calculator.settleBet(betId, 'back-win', 5.0);
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  const { execSync } = require('child_process');
  try {
    execSync('npx jest matched-betting-calculator.test.js --colors', {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (e) {
    process.exit(1);
  }
}
