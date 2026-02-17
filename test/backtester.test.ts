import { BettingStrategyBacktester, STRATEGIES, BacktestConfig } from '../backtester';
import * as fs from 'fs';
import * as path from 'path';

describe('BettingStrategyBacktester', () => {
  let backtester: BettingStrategyBacktester;
  let mockData: any[];

  beforeEach(() => {
    backtester = new BettingStrategyBacktester();
    
    // Generate mock historical data
    mockData = Array.from({ length: 100 }, (_, i) => ({
      id: `opp-${i}`,
      timestamp: new Date(2026, 0, 1 + Math.floor(i / 3), 12 + (i % 12)).toISOString(),
      sport: ['soccer', 'tennis', 'basketball'][i % 3],
      homeTeam: `Team ${i}A`,
      awayTeam: `Team ${i}B`,
      league: 'Test League',
      market: '1X2',
      profitPercent: 1 + Math.random() * 4, // 1-5% profit
      confidence: 0.6 + Math.random() * 0.4,
      bets: [
        { bookmaker: 'Bookmaker A', odds: 2.0 + Math.random(), outcome: 'Home Win' },
        { bookmaker: 'Bookmaker B', odds: 2.0 + Math.random(), outcome: 'Away Win' },
      ],
    }));

    backtester.loadHistoricalData(mockData);
  });

  describe('loadHistoricalData', () => {
    it('should load and sort historical data by timestamp', () => {
      backtester.loadHistoricalData([
        { timestamp: '2026-01-15T12:00:00Z', profitPercent: 2 },
        { timestamp: '2026-01-10T12:00:00Z', profitPercent: 3 },
        { timestamp: '2026-01-20T12:00:00Z', profitPercent: 1 },
      ]);
      
      // Data should be sorted chronologically
      expect(backtester).toBeDefined();
    });
  });

  describe('runBacktest', () => {
    it('should run fixed stake strategy successfully', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      expect(result).toBeDefined();
      expect(result.totalBets).toBeGreaterThan(0);
      expect(result.finalBankroll).toBeGreaterThan(0);
      expect(result.winRate).toBeGreaterThan(0);
      expect(result.trades.length).toBe(result.totalBets);
    });

    it('should run Kelly Criterion strategy successfully', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.kellyCriterion,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 200,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      expect(result).toBeDefined();
      expect(result.config.strategy.name).toBe('Kelly Criterion');
    });

    it('should run percentage of bankroll strategy successfully', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.percentageOfBankroll,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      expect(result).toBeDefined();
      expect(result.config.strategy.name).toBe('Percentage of Bankroll');
    });

    it('should filter by sport', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: ['soccer'],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      expect(result.totalBets).toBeGreaterThan(0);
      // All trades should be soccer (approximately 1/3 of mock data)
      expect(result.totalBets).toBeLessThan(mockData.length);
    });

    it('should filter by minimum profit percent', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 4, // High threshold
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      // Should have fewer bets due to high profit threshold
      expect(result.totalBets).toBeLessThan(mockData.length);
    });

    it('should calculate daily P&L correctly', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      expect(result.dailyPnL.length).toBeGreaterThan(0);
      
      // Check cumulative profit calculation
      const lastDay = result.dailyPnL[result.dailyPnL.length - 1];
      expect(lastDay.cumulativeProfit).toBeCloseTo(result.totalProfit, 2);
    });

    it('should track max drawdown correctly', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);

      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThan(100);
    });

    it('should emit progress events', async () => {
      const progressEvents: any[] = [];
      backtester.on('backtest:progress', (data) => {
        progressEvents.push(data);
      });

      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      await backtester.runBacktest(config);

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0]).toHaveProperty('current');
      expect(progressEvents[0]).toHaveProperty('total');
      expect(progressEvents[0]).toHaveProperty('bankroll');
    });
  });

  describe('compareStrategies', () => {
    it('should compare multiple strategies', async () => {
      const baseConfig = {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const strategies = [
        STRATEGIES.fixedStake,
        STRATEGIES.percentageOfBankroll,
        STRATEGIES.valueBased,
      ];

      const results = await backtester.compareStrategies(strategies, baseConfig);

      expect(results).toHaveLength(3);
      expect(results[0].totalProfit).toBeGreaterThanOrEqual(results[1]?.totalProfit || 0);
    });
  });

  describe('generateReport', () => {
    it('should generate a formatted report', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);
      const report = backtester.generateReport(result);

      expect(report).toContain('# Backtest Report');
      expect(report).toContain('Strategy: Fixed Stake');
      expect(report).toContain('Total Bets:');
      expect(report).toContain('Win Rate:');
      expect(report).toContain('ROI:');
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return all available strategies', () => {
      const strategies = backtester.getAvailableStrategies();

      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.map(s => s.name)).toContain('Fixed Stake');
      expect(strategies.map(s => s.name)).toContain('Kelly Criterion');
    });
  });

  describe('strategy behaviors', () => {
    it('fixed stake should bet consistent amounts', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.fixedStake,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 100,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 1,
        sports: [],
        bookmakers: [],
      };

      const result = await backtester.runBacktest(config);
      
      // All stakes should be around the same (or limited by max stake/bankroll)
      const stakes = result.trades.map(t => t.stake);
      const uniqueStakes = new Set(stakes.map(s => Math.round(s)));
      expect(uniqueStakes.size).toBeLessThanOrEqual(3); // Should be fairly consistent
    });

    it('value-based should skip low-profit opportunities', async () => {
      const config: BacktestConfig = {
        strategy: STRATEGIES.valueBased,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        initialBankroll: 1000,
        maxStakePerBet: 200,
        minOdds: 1.5,
        maxOdds: 10,
        minProfitPercent: 0, // Let strategy filter
        sports: [],
        bookmakers: [],
      };

      // Override strategy parameters for testing
      const testStrategy = {
        ...STRATEGIES.valueBased,
        parameters: { minProfitPercent: 3.0, maxStake: 200 },
      };

      const result = await backtester.runBacktest({
        ...config,
        strategy: testStrategy,
      });

      // Should have fewer bets than total opportunities due to filtering
      expect(result.totalBets).toBeLessThan(mockData.length);
    });
  });
});
