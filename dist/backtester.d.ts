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
    recentResults: boolean[];
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
export declare const STRATEGIES: Record<string, BettingStrategy>;
export declare class BettingStrategyBacktester extends EventEmitter {
    private historicalData;
    constructor();
    /**
     * Load historical opportunity data
     */
    loadHistoricalData(data: any[]): void;
    /**
     * Run a backtest with the given configuration
     */
    runBacktest(config: BacktestConfig): Promise<BacktestResult>;
    /**
     * Compare multiple strategies
     */
    compareStrategies(strategies: BettingStrategy[], baseConfig: Omit<BacktestConfig, 'strategy'>): Promise<BacktestResult[]>;
    /**
     * Generate a backtest report
     */
    generateReport(result: BacktestResult): string;
    /**
     * Get available strategies
     */
    getAvailableStrategies(): BettingStrategy[];
}
export default BettingStrategyBacktester;
//# sourceMappingURL=backtester.d.ts.map