import { EventEmitter } from 'events';

/**
 * Betting Strategy Backtester
 * 
 * Backtest different betting strategies using historical data to evaluate performance
 */
export interface BacktestConfig {
  strategy: BettingStrategy;
  startDate: Date;
  endDate: Date;
  initialBankroll: number;
  maxStakePerBet: number;
  minOdds: number;
  maxOdds: number;
  minProfitPercent: number;
  sports: string[];
  bookmakers: string[];
}

export interface BettingStrategy {
  name: string;
  description: string;
  parameters: Record<string, number>;
  execute: (opportunity: any, context: StrategyContext) => BetDecision | null;
}

export interface StrategyContext {
  currentBankroll: number;
  totalBetsPlaced: number;
  totalProfit: number;
  recentResults: boolean[]; // true = win, false = loss
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
}

export interface BetDecision {
  stake: number;
  confidence: number;
  reason: string;
}

export interface BacktestResult {
  config: BacktestConfig;
  totalBets: number;
  winningBets: number;
  losingBets: number;
  winRate: number;
  totalStake: number;
  totalProfit: number;
  roi: number;
  finalBankroll: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
  dailyPnL: DailyPnL[];
}

export interface BacktestTrade {
  timestamp: Date;
  match: string;
  sport: string;
  stake: number;
  odds: number;
  profit: number;
  bankrollAfter: number;
  strategy: string;
}

export interface DailyPnL {
  date: string;
  profit: number;
  cumulativeProfit: number;
  numBets: number;
}

/**
 * Pre-defined betting strategies
 */
export const STRATEGIES: Record<string, BettingStrategy> = {
  fixedStake: {
    name: 'Fixed Stake',
    description: 'Bet the same fixed amount on every opportunity',
    parameters: { stakeAmount: 100 },
    execute: (opportunity, context, params = STRATEGIES.fixedStake.parameters) => {
      const stake = Math.min(params.stakeAmount, context.currentBankroll * 0.05);
      return {
        stake,
        confidence: 0.5,
        reason: `Fixed stake of $${stake}`,
      };
    },
  },

  kellyCriterion: {
    name: 'Kelly Criterion',
    description: 'Optimal stake sizing based on edge and bankroll',
    parameters: { kellyFraction: 0.25 },
    execute: (opportunity, context, params = STRATEGIES.kellyCriterion.parameters) => {
      const edge = opportunity.profitPercent / 100;
      const winProb = 1 / opportunity.bets[0].odds; // Simplified
      const kellyPercent = (winProb * (opportunity.bets[0].odds - 1) - (1 - winProb)) / (opportunity.bets[0].odds - 1);
      const stake = context.currentBankroll * kellyPercent * params.kellyFraction;
      
      if (kellyPercent <= 0) return null; // Negative edge
      
      return {
        stake: Math.min(stake, context.currentBankroll * 0.05),
        confidence: kellyPercent,
        reason: `Kelly Criterion: ${(kellyPercent * 100).toFixed(2)}% of bankroll`,
      };
    },
  },

  percentageOfBankroll: {
    name: 'Percentage of Bankroll',
    description: 'Bet a fixed percentage of current bankroll',
    parameters: { percent: 0.02 },
    execute: (opportunity, context, params = STRATEGIES.percentageOfBankroll.parameters) => {
      const stake = context.currentBankroll * params.percent;
      return {
        stake,
        confidence: 0.5,
        reason: `${(params.percent * 100).toFixed(1)}% of bankroll ($${stake.toFixed(2)})`,
      };
    },
  },

  martingale: {
    name: 'Martingale',
    description: 'Double stake after each loss (dangerous!)',
    parameters: { baseStake: 50, maxMultiplier: 8 },
    execute: (opportunity, context, params = STRATEGIES.martingale.parameters) => {
      const multiplier = Math.min(
        Math.pow(2, context.consecutiveLosses),
        params.maxMultiplier
      );
      const stake = params.baseStake * multiplier;
      
      if (stake > context.currentBankroll * 0.25) return null; // Safety limit
      
      return {
        stake,
        confidence: 0.3,
        reason: `Martingale: ${multiplier}x base stake after ${context.consecutiveLosses} losses`,
      };
    },
  },

  valueBased: {
    name: 'Value-Based',
    description: 'Only bet when profit % exceeds threshold',
    parameters: { minProfitPercent: 2.0, maxStake: 200 },
    execute: (opportunity, context, params = STRATEGIES.valueBased.parameters) => {
      if (opportunity.profitPercent < params.minProfitPercent) return null;
      
      const stake = Math.min(
        context.currentBankroll * 0.03,
        params.maxStake
      );
      
      return {
        stake,
        confidence: opportunity.profitPercent / 5, // Higher profit = higher confidence
        reason: `Value bet: ${opportunity.profitPercent.toFixed(2)}% profit`,
      };
    },
  },

  confidenceWeighted: {
    name: 'Confidence Weighted',
    description: 'Scale stake based on confidence score',
    parameters: { maxStake: 300, minConfidence: 0.6 },
    execute: (opportunity, context, params = STRATEGIES.confidenceWeighted.parameters) => {
      const confidence = opportunity.confidence || 0.7;
      if (confidence < params.minConfidence) return null;
      
      const stake = params.maxStake * confidence;
      
      return {
        stake,
        confidence,
        reason: `Confidence weighted: ${(confidence * 100).toFixed(0)}% = $${stake.toFixed(2)}`,
      };
    },
  },
};

export class BettingStrategyBacktester extends EventEmitter {
  private historicalData: any[] = [];

  constructor() {
    super();
  }

  /**
   * Load historical opportunity data
   */
  loadHistoricalData(data: any[]): void {
    this.historicalData = data.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Run a backtest with the given configuration
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const trades: BacktestTrade[] = [];
    const dailyPnL: Map<string, DailyPnL> = new Map();
    
    let bankroll = config.initialBankroll;
    let maxBankroll = bankroll;
    let maxDrawdown = 0;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let winningBets = 0;
    let losingBets = 0;
    let totalStake = 0;
    const recentResults: boolean[] = [];

    // Filter data by date range and criteria
    const filteredData = this.historicalData.filter(d => {
      const date = new Date(d.timestamp);
      return (
        date >= config.startDate &&
        date <= config.endDate &&
        d.profitPercent >= config.minProfitPercent &&
        d.bets.some((b: any) => b.odds >= config.minOdds && b.odds <= config.maxOdds) &&
        (config.sports.length === 0 || config.sports.includes(d.sport)) &&
        (config.bookmakers.length === 0 || d.bets.some((b: any) => config.bookmakers.includes(b.bookmaker)))
      );
    });

    this.emit('backtest:start', { totalOpportunities: filteredData.length });

    for (let i = 0; i < filteredData.length; i++) {
      const opportunity = filteredData[i];
      
      const context: StrategyContext = {
        currentBankroll: bankroll,
        totalBetsPlaced: trades.length,
        totalProfit: trades.reduce((sum, t) => sum + t.profit, 0),
        recentResults: recentResults.slice(-10),
        consecutiveLosses,
        maxConsecutiveLosses,
      };

      const decision = config.strategy.execute(opportunity, context);
      
      if (!decision || decision.stake <= 0) continue;
      if (decision.stake > config.maxStakePerBet) continue;
      if (decision.stake > bankroll) continue; // Can't bet more than we have

      // Simulate the bet outcome (in real arbitrage, this should always win)
      // For backtesting, we assume the arbitrage math holds
      const profit = decision.stake * (opportunity.profitPercent / 100);
      
      totalStake += decision.stake;
      bankroll += profit;
      
      if (profit > 0) {
        winningBets++;
        consecutiveLosses = 0;
        recentResults.push(true);
      } else {
        losingBets++;
        consecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
        recentResults.push(false);
      }

      // Track max drawdown
      if (bankroll > maxBankroll) {
        maxBankroll = bankroll;
      }
      const drawdown = (maxBankroll - bankroll) / maxBankroll;
      maxDrawdown = Math.max(maxDrawdown, drawdown);

      // Record trade
      const trade: BacktestTrade = {
        timestamp: new Date(opportunity.timestamp),
        match: `${opportunity.homeTeam} vs ${opportunity.awayTeam}`,
        sport: opportunity.sport,
        stake: decision.stake,
        odds: opportunity.bets[0].odds,
        profit,
        bankrollAfter: bankroll,
        strategy: config.strategy.name,
      };
      trades.push(trade);

      // Track daily P&L
      const dateKey = opportunity.timestamp.split('T')[0];
      const existing = dailyPnL.get(dateKey);
      if (existing) {
        existing.profit += profit;
        existing.numBets++;
      } else {
        dailyPnL.set(dateKey, {
          date: dateKey,
          profit,
          cumulativeProfit: 0,
          numBets: 1,
        });
      }

      this.emit('backtest:progress', {
        current: i + 1,
        total: filteredData.length,
        bankroll,
      });
    }

    // Calculate cumulative P&L
    let cumulativeProfit = 0;
    const sortedDailyPnL = Array.from(dailyPnL.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );
    sortedDailyPnL.forEach(d => {
      cumulativeProfit += d.profit;
      d.cumulativeProfit = cumulativeProfit;
    });

    // Calculate Sharpe ratio (simplified)
    const dailyReturns = sortedDailyPnL.map(d => d.profit / config.initialBankroll);
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length || 0;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length || 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;

    const result: BacktestResult = {
      config,
      totalBets: trades.length,
      winningBets,
      losingBets,
      winRate: trades.length > 0 ? winningBets / trades.length : 0,
      totalStake,
      totalProfit: bankroll - config.initialBankroll,
      roi: totalStake > 0 ? ((bankroll - config.initialBankroll) / totalStake) * 100 : 0,
      finalBankroll: bankroll,
      maxDrawdown: maxDrawdown * 100,
      maxConsecutiveLosses,
      sharpeRatio,
      trades,
      dailyPnL: sortedDailyPnL,
    };

    this.emit('backtest:complete', result);
    return result;
  }

  /**
   * Compare multiple strategies
   */
  async compareStrategies(
    strategies: BettingStrategy[],
    baseConfig: Omit<BacktestConfig, 'strategy'>
  ): Promise<BacktestResult[]> {
    const results: BacktestResult[] = [];
    
    for (const strategy of strategies) {
      const config: BacktestConfig = { ...baseConfig, strategy };
      const result = await this.runBacktest(config);
      results.push(result);
    }

    // Sort by total profit
    return results.sort((a, b) => b.totalProfit - a.totalProfit);
  }

  /**
   * Generate a backtest report
   */
  generateReport(result: BacktestResult): string {
    const lines = [
      '# Backtest Report',
      '',
      `## Strategy: ${result.config.strategy.name}`,
      '',
      '### Configuration',
      `- Initial Bankroll: $${result.config.initialBankroll.toFixed(2)}`,
      `- Date Range: ${result.config.startDate.toISOString().split('T')[0]} to ${result.config.endDate.toISOString().split('T')[0]}`,
      `- Max Stake per Bet: $${result.config.maxStakePerBet}`,
      `- Min Profit %: ${result.config.minProfitPercent}%`,
      '',
      '### Performance Summary',
      `- Total Bets: ${result.totalBets}`,
      `- Win Rate: ${(result.winRate * 100).toFixed(2)}%`,
      `- Total Stake: $${result.totalStake.toFixed(2)}`,
      `- Total Profit: $${result.totalProfit.toFixed(2)}`,
      `- ROI: ${result.roi.toFixed(2)}%`,
      `- Final Bankroll: $${result.finalBankroll.toFixed(2)}`,
      '',
      '### Risk Metrics',
      `- Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`,
      `- Max Consecutive Losses: ${result.maxConsecutiveLosses}`,
      `- Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`,
      '',
      '### Recent Trades',
      ...result.trades.slice(-5).map(t => 
        `- ${t.timestamp.toISOString().split('T')[0]}: ${t.match} - $${t.stake.toFixed(2)} stake, $${t.profit.toFixed(2)} profit`
      ),
    ];

    return lines.join('\n');
  }

  /**
   * Get available strategies
   */
  getAvailableStrategies(): BettingStrategy[] {
    return Object.values(STRATEGIES);
  }
}

export default BettingStrategyBacktester;
