/**
 * Synthetic Arbitrage Detector
 * 
 * Creates arbitrage opportunities by combining multiple bets to create synthetic positions.
 * This allows generating arbitrage where none exists in standard markets.
 * 
 * Examples:
 * - Create "Over 2.5" from "Exactly 3" + "Over 3.5"
 * - Create Asian Handicap from European Handicap combinations
 * - Create Double Chance from 1X2 combinations
 * - Create alternative totals from correct score combinations
 */

import { EventEmitter } from 'events';
import logger from './utils/logger.js';

export interface SyntheticMarket {
  id: string;
  name: string;
  description: string;
  targetMarket: string;
  components: SyntheticComponent[];
  calculateSyntheticOdds: (componentOdds: number[]) => number | null;
  validateComponents: (components: any[]) => boolean;
}

export interface SyntheticComponent {
  market: string;
  selection: string;
  weight: number; // How much this component contributes
  required: boolean;
}

export interface SyntheticArbitrageOpportunity {
  id: string;
  type: 'synthetic_arbitrage';
  eventId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: number;
  syntheticMarket: {
    id: string;
    name: string;
    targetSelection: string;
    syntheticOdds: number;
    bookmaker: string;
  };
  components: {
    market: string;
    selection: string;
    odds: number;
    bookmaker: string;
    stake: number;
    impliedProbability: number;
  }[];
  directComparison?: {
    market: string;
    selection: string;
    odds: number;
    bookmaker: string;
  };
  profitPercent: number;
  totalStake: number;
  expectedProfit: number;
  confidence: number;
  complexity: number; // 1-5, higher = more complex
  executionRisk: 'low' | 'medium' | 'high';
  timestamp: number;
  expiresAt: number;
}

export interface MarketOdds {
  bookmaker: string;
  market: string;
  selection: string;
  odds: number;
  timestamp: number;
  liquidity?: number;
}

export interface EventMarkets {
  eventId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: number;
  markets: Record<string, Record<string, MarketOdds[]>>; // market -> selection -> odds[]
}

export class SyntheticArbitrageDetector extends EventEmitter {
  private syntheticMarkets: Map<string, SyntheticMarket[]> = new Map();
  private readonly MIN_PROFIT_PERCENT = 0.3;
  private readonly MAX_PROFIT_PERCENT = 20;
  private readonly MIN_CONFIDENCE = 0.5;

  constructor() {
    super();
    this.initializeSyntheticMarkets();
  }

  /**
   * Initialize synthetic market definitions
   */
  private initializeSyntheticMarkets(): void {
    // Soccer synthetic markets
    this.syntheticMarkets.set('soccer', [
      // Over 2.5 from Exactly 3 + Over 3.5
      {
        id: 'over_2_5_from_exactly_3',
        name: 'Over 2.5 Goals (Synthetic)',
        description: 'Create Over 2.5 from Exactly 3 Goals + Over 3.5 Goals',
        targetMarket: 'over_under',
        components: [
          { market: 'correct_score', selection: 'exactly_3_goals', weight: 1, required: true },
          { market: 'over_under', selection: 'over_3_5', weight: 1, required: true }
        ],
        calculateSyntheticOdds: (odds) => {
          if (odds.length !== 2) return null;
          // P(Over 2.5) = P(Exactly 3) + P(Over 3.5)
          const prob1 = 1 / odds[0];
          const prob2 = 1 / odds[1];
          const totalProb = prob1 + prob2;
          return 1 / totalProb;
        },
        validateComponents: (comps) => comps.length === 2
      },

      // Double Chance from 1X2
      {
        id: 'double_chance_1x_from_1x2',
        name: 'Double Chance 1X (Synthetic)',
        description: 'Create 1X from 1 + X',
        targetMarket: 'double_chance',
        components: [
          { market: '1x2', selection: '1', weight: 1, required: true },
          { market: '1x2', selection: 'X', weight: 1, required: true }
        ],
        calculateSyntheticOdds: (odds) => {
          if (odds.length !== 2) return null;
          // P(1X) = P(1) + P(X)
          const prob1 = 1 / odds[0];
          const prob2 = 1 / odds[1];
          return 1 / (prob1 + prob2);
        },
        validateComponents: (comps) => comps.length === 2
      },

      // Asian Handicap 0 from 1X2
      {
        id: 'ah_0_from_1x2',
        name: 'Asian Handicap 0 (Synthetic)',
        description: 'Create AH 0 (Draw No Bet) from 1X2',
        targetMarket: 'asian_handicap',
        components: [
          { market: '1x2', selection: '1', weight: 1, required: true },
          { market: '1x2', selection: 'X', weight: 0.5, required: true }
        ],
        calculateSyntheticOdds: (odds) => {
          if (odds.length !== 2) return null;
          // AH 0 pays back stake on draw
          const prob1 = 1 / odds[0];
          const probX = 1 / odds[1];
          return 1 / (prob1 + probX * 0.5);
        },
        validateComponents: (comps) => comps.length === 2
      },

      // Over 1.5 from BTTS + Over 2.5
      {
        id: 'over_1_5_from_btts',
        name: 'Over 1.5 Goals (Synthetic from BTTS)',
        description: 'Create Over 1.5 from Both Teams To Score',
        targetMarket: 'over_under',
        components: [
          { market: 'btts', selection: 'yes', weight: 1, required: true }
        ],
        calculateSyntheticOdds: (odds) => {
          if (odds.length !== 1) return null;
          // BTTS implies at least 2 goals
          // Synthetic odds slightly worse than BTTS due to 2-0 and 0-2 possibilities
          return odds[0] * 0.95;
        },
        validateComponents: (comps) => comps.length === 1
      }
    ]);

    // Tennis synthetic markets
    this.syntheticMarkets.set('tennis', [
      // Match winner from set betting
      {
        id: 'match_winner_from_set_betting',
        name: 'Match Winner (Synthetic from Sets)',
        description: 'Create match winner odds from set betting combinations',
        targetMarket: 'match_winner',
        components: [
          { market: 'set_betting', selection: '2_0', weight: 1, required: true },
          { market: 'set_betting', selection: '2_1', weight: 1, required: true }
        ],
        calculateSyntheticOdds: (odds) => {
          if (odds.length !== 2) return null;
          const prob1 = 1 / odds[0];
          const prob2 = 1 / odds[1];
          return 1 / (prob1 + prob2);
        },
        validateComponents: (comps) => comps.length === 2
      }
    ]);

    // Basketball synthetic markets
    this.syntheticMarkets.set('basketball', [
      // Moneyline from spreads
      {
        id: 'moneyline_from_spreads',
        name: 'Moneyline (Synthetic from Spreads)',
        description: 'Create moneyline from spread + totals combination',
        targetMarket: 'moneyline',
        components: [
          { market: 'spreads', selection: 'home_-3_5', weight: 1, required: true },
          { market: 'totals', selection: 'over_220_5', weight: 1, required: false }
        ],
        calculateSyntheticOdds: (odds) => {
          if (odds.length < 1) return null;
          // Simplified - real implementation would use more sophisticated model
          return odds[0] * 0.9;
        },
        validateComponents: (comps) => comps.length >= 1
      }
    ]);
  }

  /**
   * Detect synthetic arbitrage opportunities
   */
  public detectSyntheticArbitrage(eventMarkets: EventMarkets): SyntheticArbitrageOpportunity[] {
    const opportunities: SyntheticArbitrageOpportunity[] = [];
    const syntheticMarkets = this.syntheticMarkets.get(eventMarkets.sport) || [];

    for (const syntheticMarket of syntheticMarkets) {
      const marketOpportunities = this.checkSyntheticMarket(
        eventMarkets,
        syntheticMarket
      );
      opportunities.push(...marketOpportunities);
    }

    return opportunities
      .filter(opp => opp.profitPercent >= this.MIN_PROFIT_PERCENT)
      .sort((a, b) => b.profitPercent - a.profitPercent);
  }

  /**
   * Check a specific synthetic market for arbitrage
   */
  private checkSyntheticMarket(
    eventMarkets: EventMarkets,
    syntheticMarket: SyntheticMarket
  ): SyntheticArbitrageOpportunity[] {
    const opportunities: SyntheticArbitrageOpportunity[] = [];

    // Get all possible component combinations
    const componentCombinations = this.getComponentCombinations(
      eventMarkets,
      syntheticMarket.components
    );

    for (const combination of componentCombinations) {
      // Calculate synthetic odds
      const componentOdds = combination.map(c => c.odds);
      const syntheticOdds = syntheticMarket.calculateSyntheticOdds(componentOdds);

      if (!syntheticOdds) continue;

      // Find direct market comparison
      const directComparison = this.findDirectComparison(
        eventMarkets,
        syntheticMarket.targetMarket,
        combination[0].selection
      );

      if (directComparison) {
        // Check if synthetic offers better odds than direct
        if (syntheticOdds > directComparison.odds * 1.005) { // 0.5% threshold
          const profitPercent = ((syntheticOdds / directComparison.odds) - 1) * 100;

          if (profitPercent >= this.MIN_PROFIT_PERCENT) {
            const opportunity = this.createOpportunity(
              eventMarkets,
              syntheticMarket,
              combination,
              syntheticOdds,
              directComparison,
              profitPercent
            );
            opportunities.push(opportunity);
          }
        }
      }

      // Also check for arbitrage between components
      const componentArbitrage = this.checkComponentArbitrage(
        eventMarkets,
        syntheticMarket,
        combination
      );
      
      if (componentArbitrage) {
        opportunities.push(componentArbitrage);
      }
    }

    return opportunities;
  }

  /**
   * Get all possible component combinations
   */
  private getComponentCombinations(
    eventMarkets: EventMarkets,
    components: SyntheticComponent[]
  ): Array<Array<{ market: string; selection: string; odds: number; bookmaker: string }>> {
    const combinations: Array<Array<{ market: string; selection: string; odds: number; bookmaker: string }>> = [];

    // Get available odds for each component
    const componentOptions: Array<Array<{ market: string; selection: string; odds: number; bookmaker: string }>> = [];

    for (const component of components) {
      const market = eventMarkets.markets[component.market];
      if (!market) continue;

      const selectionOdds = market[component.selection];
      if (!selectionOdds || selectionOdds.length === 0) continue;

      componentOptions.push(
        selectionOdds.map(o => ({
          market: component.market,
          selection: component.selection,
          odds: o.odds,
          bookmaker: o.bookmaker
        }))
      );
    }

    // Generate all combinations using Cartesian product
    if (componentOptions.length === components.length) {
      this.cartesianProduct(componentOptions, [], combinations);
    }

    return combinations;
  }

  /**
   * Calculate Cartesian product of arrays
   */
  private cartesianProduct(
    arrays: Array<Array<any>>,
    current: any[],
    result: any[][]
  ): void {
    if (arrays.length === 0) {
      result.push([...current]);
      return;
    }

    const [first, ...rest] = arrays;
    for (const item of first) {
      this.cartesianProduct(rest, [...current, item], result);
    }
  }

  /**
   * Find direct market comparison
   */
  private findDirectComparison(
    eventMarkets: EventMarkets,
    targetMarket: string,
    selection: string
  ): { market: string; selection: string; odds: number; bookmaker: string } | null {
    const market = eventMarkets.markets[targetMarket];
    if (!market) return null;

    const selectionOdds = market[selection];
    if (!selectionOdds || selectionOdds.length === 0) return null;

    // Get best odds
    const best = selectionOdds.reduce((max, current) => 
      current.odds > max.odds ? current : max
    );

    return {
      market: targetMarket,
      selection,
      odds: best.odds,
      bookmaker: best.bookmaker
    };
  }

  /**
   * Check for arbitrage between components
   */
  private checkComponentArbitrage(
    eventMarkets: EventMarkets,
    syntheticMarket: SyntheticMarket,
    combination: Array<{ market: string; selection: string; odds: number; bookmaker: string }>
  ): SyntheticArbitrageOpportunity | null {
    // Check if components create arbitrage with other markets
    // This is a simplified check - full implementation would be more complex
    return null;
  }

  /**
   * Create a synthetic arbitrage opportunity
   */
  private createOpportunity(
    eventMarkets: EventMarkets,
    syntheticMarket: SyntheticMarket,
    combination: Array<{ market: string; selection: string; odds: number; bookmaker: string }>,
    syntheticOdds: number,
    directComparison: { market: string; selection: string; odds: number; bookmaker: string },
    profitPercent: number
  ): SyntheticArbitrageOpportunity {
    // Calculate stakes for $100 total
    const totalStake = 100;
    const componentStakes = this.calculateComponentStakes(combination, totalStake);

    const components = combination.map((c, i) => ({
      market: c.market,
      selection: c.selection,
      odds: c.odds,
      bookmaker: c.bookmaker,
      stake: componentStakes[i],
      impliedProbability: 1 / c.odds
    }));

    const id = `synthetic-${eventMarkets.eventId}-${syntheticMarket.id}-${Date.now()}`;

    return {
      id,
      type: 'synthetic_arbitrage',
      eventId: eventMarkets.eventId,
      sport: eventMarkets.sport,
      league: eventMarkets.league,
      homeTeam: eventMarkets.homeTeam,
      awayTeam: eventMarkets.awayTeam,
      startTime: eventMarkets.startTime,
      syntheticMarket: {
        id: syntheticMarket.id,
        name: syntheticMarket.name,
        targetSelection: combination[0].selection,
        syntheticOdds,
        bookmaker: 'synthetic'
      },
      components,
      directComparison,
      profitPercent,
      totalStake,
      expectedProfit: totalStake * (profitPercent / 100),
      confidence: this.calculateConfidence(combination, profitPercent),
      complexity: combination.length,
      executionRisk: this.assessExecutionRisk(combination),
      timestamp: Date.now(),
      expiresAt: eventMarkets.startTime
    };
  }

  /**
   * Calculate stake distribution for components
   */
  private calculateComponentStakes(
    combination: Array<{ odds: number }>,
    totalStake: number
  ): number[] {
    const impliedProbs = combination.map(c => 1 / c.odds);
    const totalProb = impliedProbs.reduce((a, b) => a + b, 0);
    
    return impliedProbs.map(prob => (totalStake * prob) / totalProb);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    combination: Array<{ bookmaker: string; odds: number }>,
    profitPercent: number
  ): number {
    let confidence = 0.8;

    // Reduce confidence for multiple bookmakers (execution risk)
    const uniqueBookmakers = new Set(combination.map(c => c.bookmaker)).size;
    if (uniqueBookmakers > 2) {
      confidence *= 0.9;
    }

    // Adjust based on profit (very high profit = likely error)
    if (profitPercent > 10) {
      confidence *= 0.7;
    } else if (profitPercent > 5) {
      confidence *= 0.85;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Assess execution risk
   */
  private assessExecutionRisk(
    combination: Array<{ bookmaker: string }>
  ): 'low' | 'medium' | 'high' {
    const uniqueBookmakers = new Set(combination.map(c => c.bookmaker)).size;
    
    if (uniqueBookmakers === 1) return 'low';
    if (uniqueBookmakers === 2) return 'medium';
    return 'high';
  }

  /**
   * Add custom synthetic market
   */
  public addSyntheticMarket(sport: string, market: SyntheticMarket): void {
    const existing = this.syntheticMarkets.get(sport) || [];
    existing.push(market);
    this.syntheticMarkets.set(sport, existing);
    
    logger.info('Added synthetic market', { sport, marketId: market.id });
    this.emit('market:added', { sport, market });
  }

  /**
   * Get available synthetic markets for a sport
   */
  public getSyntheticMarkets(sport?: string): SyntheticMarket[] {
    if (sport) {
      return this.syntheticMarkets.get(sport) || [];
    }
    
    const all: SyntheticMarket[] = [];
    for (const markets of this.syntheticMarkets.values()) {
      all.push(...markets);
    }
    return all;
  }

  /**
   * Filter opportunities based on criteria
   */
  public filterOpportunities(
    opportunities: SyntheticArbitrageOpportunity[],
    filters: {
      minProfit?: number;
      maxProfit?: number;
      minConfidence?: number;
      maxComplexity?: number;
      sports?: string[];
      excludeExecutionRisk?: ('low' | 'medium' | 'high')[];
    }
  ): SyntheticArbitrageOpportunity[] {
    return opportunities.filter(opp => {
      if (filters.minProfit && opp.profitPercent < filters.minProfit) return false;
      if (filters.maxProfit && opp.profitPercent > filters.maxProfit) return false;
      if (filters.minConfidence && opp.confidence < filters.minConfidence) return false;
      if (filters.maxComplexity && opp.complexity > filters.maxComplexity) return false;
      if (filters.sports && !filters.sports.includes(opp.sport)) return false;
      if (filters.excludeExecutionRisk?.includes(opp.executionRisk)) return false;
      return true;
    });
  }
}

export default SyntheticArbitrageDetector;
