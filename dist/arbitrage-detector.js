"use strict";
/**
 * Advanced Arbitrage Detection Algorithms
 *
 * Sophisticated algorithms to detect complex arbitrage scenarios including:
 * - Cross-market arbitrage (e.g., 1X2 vs Double Chance)
 * - Multi-leg arbitrage (accumulators/parlays)
 * - Synthetic arbitrage (creating markets from other markets)
 * - Middle opportunities (win both sides)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrageDetector = void 0;
class ArbitrageDetector {
    MIN_PROFIT_PERCENT = 0.5; // 0.5% minimum
    MAX_PROFIT_PERCENT = 20; // Cap at 20% (likely error)
    MIN_CONFIDENCE = 0.3;
    crossMarketMappings = new Map();
    constructor() {
        this.initializeCrossMarketMappings();
    }
    /**
     * Initialize cross-market arbitrage mappings
     */
    initializeCrossMarketMappings() {
        // Soccer: 1X2 to Double Chance mappings
        this.crossMarketMappings.set('soccer', [
            {
                sourceMarket: '1x2',
                targetMarket: 'double_chance',
                conversion: (selection, odds) => {
                    const mappings = {
                        '1': '1X',
                        'X': '12',
                        '2': 'X2'
                    };
                    return mappings[selection] ? { selection: mappings[selection], odds } : null;
                }
            },
            {
                sourceMarket: 'asian_handicap',
                targetMarket: 'european_handicap',
                conversion: (selection, odds) => {
                    // AH +0.5 is equivalent to 1X2 1 (home win)
                    if (selection.includes('+0.5')) {
                        return { selection: selection.includes('home') ? '1' : '2', odds };
                    }
                    return null;
                }
            }
        ]);
        // Tennis: Match winner to Set 1 winner mappings
        this.crossMarketMappings.set('tennis', [
            {
                sourceMarket: 'match_winner',
                targetMarket: 'set_1_winner',
                conversion: (selection, odds) => {
                    // Set 1 winner odds are typically higher than match winner
                    // Arbitrage exists when match winner odds are lower than set 1 winner
                    return { selection, odds: odds * 0.85 }; // Approximate adjustment
                }
            }
        ]);
        // Basketball: Spread to Moneyline mappings
        this.crossMarketMappings.set('basketball', [
            {
                sourceMarket: 'spreads',
                targetMarket: 'h2h',
                conversion: (selection, odds) => {
                    // Spread -3.5 home implies moneyline home favorite
                    return { selection, odds };
                }
            }
        ]);
    }
    /**
     * Detect all types of arbitrage opportunities from aggregated odds
     */
    detectArbitrage(odds) {
        const opportunities = [];
        // 1. Straight arbitrage (same market across bookmakers)
        opportunities.push(...this.detectStraightArbitrage(odds));
        // 2. Cross-market arbitrage
        opportunities.push(...this.detectCrossMarketArbitrage(odds));
        // 3. Synthetic arbitrage (creating equivalent markets)
        opportunities.push(...this.detectSyntheticArbitrage(odds));
        // 4. Middle opportunities
        opportunities.push(...this.detectMiddleOpportunities(odds));
        // Sort by profit potential
        return opportunities
            .filter(opp => opp.confidence >= this.MIN_CONFIDENCE)
            .sort((a, b) => b.profitPercent - a.profitPercent);
    }
    /**
     * Detect straight arbitrage within a single market
     * Classic arbitrage: bet on all outcomes across different bookmakers
     */
    detectStraightArbitrage(odds) {
        const opportunities = [];
        for (const [market, selections] of Object.entries(odds.markets)) {
            // Get all selections for this market
            const selectionNames = Object.keys(selections);
            // Need at least 2 selections for arbitrage
            if (selectionNames.length < 2)
                continue;
            // Find best odds for each selection
            const bestOdds = new Map();
            for (const [selection, bookmakers] of Object.entries(selections)) {
                let bestBookmaker = '';
                let bestOddsValue = 0;
                for (const [bookmakerId, data] of Object.entries(bookmakers)) {
                    if (data.odds > bestOddsValue) {
                        bestOddsValue = data.odds;
                        bestBookmaker = bookmakerId;
                    }
                }
                if (bestBookmaker) {
                    bestOdds.set(selection, { bookmaker: bestBookmaker, odds: bestOddsValue });
                }
            }
            // Check if we have odds for all selections
            if (bestOdds.size !== selectionNames.length)
                continue;
            // Calculate implied probabilities
            let totalImpliedProbability = 0;
            const legs = [];
            for (const [selection, data] of bestOdds.entries()) {
                const impliedProbability = 1 / data.odds;
                totalImpliedProbability += impliedProbability;
                legs.push({
                    bookmaker: data.bookmaker,
                    market,
                    selection,
                    odds: data.odds,
                    stake: 0, // Will be calculated
                    impliedProbability,
                    contribution: 0
                });
            }
            // Arbitrage exists if total implied probability < 1
            if (totalImpliedProbability < 1) {
                const profitPercent = (1 - totalImpliedProbability) * 100;
                if (profitPercent >= this.MIN_PROFIT_PERCENT && profitPercent <= this.MAX_PROFIT_PERCENT) {
                    // Calculate optimal stakes for $100 total stake
                    const totalStake = 100;
                    const calculatedLegs = legs.map(leg => ({
                        ...leg,
                        stake: (totalStake * leg.impliedProbability) / totalImpliedProbability,
                        contribution: (leg.impliedProbability / totalImpliedProbability) * 100
                    }));
                    opportunities.push({
                        id: `${odds.eventId}-${market}-${Date.now()}`,
                        type: 'straight',
                        sport: odds.sport,
                        league: odds.league,
                        eventId: odds.eventId,
                        homeTeam: odds.homeTeam,
                        awayTeam: odds.awayTeam,
                        startTime: odds.startTime,
                        profitPercent,
                        confidence: this.calculateConfidence(odds, calculatedLegs),
                        legs: calculatedLegs,
                        totalStake,
                        expectedProfit: totalStake * (profitPercent / 100),
                        timestamp: Date.now(),
                        expiresAt: Date.now() + 300000, // 5 minutes
                        metadata: {
                            marketTypes: [market],
                            bookmakerCount: new Set(calculatedLegs.map(l => l.bookmaker)).size,
                            detectionMethod: 'best_odds_aggregation',
                            riskFactors: this.identifyRiskFactors(odds, calculatedLegs)
                        }
                    });
                }
            }
        }
        return opportunities;
    }
    /**
     * Detect cross-market arbitrage opportunities
     * e.g., 1X2 vs Double Chance
     */
    detectCrossMarketArbitrage(odds) {
        const opportunities = [];
        const mappings = this.crossMarketMappings.get(odds.sport) || [];
        for (const mapping of mappings) {
            const sourceMarket = odds.markets[mapping.sourceMarket];
            const targetMarket = odds.markets[mapping.targetMarket];
            if (!sourceMarket || !targetMarket)
                continue;
            // Try to find arbitrage between these markets
            for (const [sourceSelection, sourceBookmakers] of Object.entries(sourceMarket)) {
                for (const [sourceBookmaker, sourceData] of Object.entries(sourceBookmakers)) {
                    const converted = mapping.conversion(sourceSelection, sourceData.odds);
                    if (!converted)
                        continue;
                    // Look for better odds in target market
                    const targetSelection = targetMarket[converted.selection];
                    if (!targetSelection)
                        continue;
                    for (const [targetBookmaker, targetData] of Object.entries(targetSelection)) {
                        // Check if this creates an arbitrage with other selections
                        // This is a simplified check - full implementation would be more complex
                        const arbitrageCheck = this.checkCrossMarketArbitrage(odds, mapping.sourceMarket, mapping.targetMarket, sourceSelection, converted.selection, sourceData.odds, targetData.odds);
                        if (arbitrageCheck.isArbitrage) {
                            opportunities.push({
                                id: `${odds.eventId}-cross-${Date.now()}`,
                                type: 'cross_market',
                                sport: odds.sport,
                                league: odds.league,
                                eventId: odds.eventId,
                                homeTeam: odds.homeTeam,
                                awayTeam: odds.awayTeam,
                                startTime: odds.startTime,
                                profitPercent: arbitrageCheck.profitPercent,
                                confidence: this.calculateConfidence(odds, arbitrageCheck.legs),
                                legs: arbitrageCheck.legs,
                                totalStake: 100,
                                expectedProfit: 100 * (arbitrageCheck.profitPercent / 100),
                                timestamp: Date.now(),
                                expiresAt: Date.now() + 300000,
                                metadata: {
                                    marketTypes: [mapping.sourceMarket, mapping.targetMarket],
                                    bookmakerCount: new Set(arbitrageCheck.legs.map(l => l.bookmaker)).size,
                                    detectionMethod: 'cross_market_mapping',
                                    riskFactors: this.identifyRiskFactors(odds, arbitrageCheck.legs)
                                }
                            });
                        }
                    }
                }
            }
        }
        return opportunities;
    }
    /**
     * Detect synthetic arbitrage by creating equivalent markets
     */
    detectSyntheticArbitrage(odds) {
        const opportunities = [];
        // Example: Create "Over 2.5" from "Exactly 3+" + "Over 3.5"
        // If we can get better odds synthetically, that's arbitrage
        // This is a placeholder for more complex synthetic market detection
        // Full implementation would include:
        // - Asian handicap synthesis
        // - Total goals synthesis
        // - Correct score synthesis
        return opportunities;
    }
    /**
     * Detect middle opportunities (win both sides)
     * e.g., Over 2.5 @ 2.0 and Under 3.5 @ 2.0
     * If final score is 3, both bets win
     */
    detectMiddleOpportunities(odds) {
        const opportunities = [];
        // Look for totals markets
        const totalsMarket = odds.markets['totals'] || odds.markets['over_under'];
        if (!totalsMarket)
            return opportunities;
        // Group by line
        const lines = new Map();
        for (const [selection, bookmakers] of Object.entries(totalsMarket)) {
            const match = selection.match(/(over|under)\s*([\d.]+)/i);
            if (!match)
                continue;
            const type = match[1].toLowerCase();
            const line = parseFloat(match[2]);
            // Find best odds
            let bestOdds = 0;
            let bestBookmaker = '';
            for (const [bookmakerId, data] of Object.entries(bookmakers)) {
                if (data.odds > bestOdds) {
                    bestOdds = data.odds;
                    bestBookmaker = bookmakerId;
                }
            }
            const existing = lines.get(line) || {};
            if (type === 'over') {
                existing.over = bestOdds;
                existing.overBookmaker = bestBookmaker;
            }
            else {
                existing.under = bestOdds;
                existing.underBookmaker = bestBookmaker;
            }
            lines.set(line, existing);
        }
        // Check for adjacent lines that create middle opportunities
        const sortedLines = Array.from(lines.entries()).sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < sortedLines.length - 1; i++) {
            const [line1, data1] = sortedLines[i];
            const [line2, data2] = sortedLines[i + 1];
            // Check if lines are adjacent (e.g., 2.5 and 3.5)
            if (line2 - line1 === 1) {
                // Potential middle: Over line1 and Under line2
                if (data1.over && data2.under) {
                    const impliedProb1 = 1 / data1.over;
                    const impliedProb2 = 1 / data2.under;
                    const totalProb = impliedProb1 + impliedProb2;
                    if (totalProb < 1) {
                        const profitPercent = (1 - totalProb) * 100;
                        const legs = [
                            {
                                bookmaker: data1.overBookmaker,
                                market: 'totals',
                                selection: `Over ${line1}`,
                                odds: data1.over,
                                stake: (100 * impliedProb1) / totalProb,
                                impliedProbability: impliedProb1,
                                contribution: (impliedProb1 / totalProb) * 100
                            },
                            {
                                bookmaker: data2.underBookmaker,
                                market: 'totals',
                                selection: `Under ${line2}`,
                                odds: data2.under,
                                stake: (100 * impliedProb2) / totalProb,
                                impliedProbability: impliedProb2,
                                contribution: (impliedProb2 / totalProb) * 100
                            }
                        ];
                        opportunities.push({
                            id: `${odds.eventId}-middle-${Date.now()}`,
                            type: 'middle',
                            sport: odds.sport,
                            league: odds.league,
                            eventId: odds.eventId,
                            homeTeam: odds.homeTeam,
                            awayTeam: odds.awayTeam,
                            startTime: odds.startTime,
                            profitPercent,
                            confidence: this.calculateConfidence(odds, legs) * 0.9, // Slightly lower confidence for middles
                            legs,
                            totalStake: 100,
                            expectedProfit: 100 * (profitPercent / 100),
                            timestamp: Date.now(),
                            expiresAt: Date.now() + 300000,
                            metadata: {
                                marketTypes: ['totals'],
                                bookmakerCount: new Set(legs.map(l => l.bookmaker)).size,
                                detectionMethod: 'middle_detection',
                                riskFactors: [...this.identifyRiskFactors(odds, legs), 'middle_outcome_dependent']
                            }
                        });
                    }
                }
            }
        }
        return opportunities;
    }
    /**
     * Check if cross-market combination creates arbitrage
     */
    checkCrossMarketArbitrage(odds, sourceMarket, targetMarket, sourceSelection, targetSelection, sourceOdds, targetOdds) {
        // Simplified check - full implementation would be more sophisticated
        const impliedProb1 = 1 / sourceOdds;
        const impliedProb2 = 1 / targetOdds;
        const totalProb = impliedProb1 + impliedProb2;
        if (totalProb >= 1) {
            return { isArbitrage: false, profitPercent: 0, legs: [] };
        }
        const profitPercent = (1 - totalProb) * 100;
        const legs = [
            {
                bookmaker: 'source',
                market: sourceMarket,
                selection: sourceSelection,
                odds: sourceOdds,
                stake: 0,
                impliedProbability: impliedProb1,
                contribution: 0
            },
            {
                bookmaker: 'target',
                market: targetMarket,
                selection: targetSelection,
                odds: targetOdds,
                stake: 0,
                impliedProbability: impliedProb2,
                contribution: 0
            }
        ];
        return { isArbitrage: true, profitPercent, legs };
    }
    /**
     * Calculate confidence score for an opportunity
     */
    calculateConfidence(odds, legs) {
        let confidence = 1.0;
        // Reduce confidence based on time to event (closer = lower confidence due to odds volatility)
        const hoursToEvent = (odds.startTime - Date.now()) / (1000 * 60 * 60);
        if (hoursToEvent < 1) {
            confidence *= 0.5;
        }
        else if (hoursToEvent < 24) {
            confidence *= 0.8;
        }
        // Reduce confidence if using multiple bookmakers (execution risk)
        const uniqueBookmakers = new Set(legs.map(l => l.bookmaker)).size;
        if (uniqueBookmakers > 2) {
            confidence *= 0.9;
        }
        // Reduce confidence for very high profit (likely error)
        const maxProfit = Math.max(...legs.map(l => l.odds - 1));
        if (maxProfit > 10) {
            confidence *= 0.7;
        }
        return Math.max(0, Math.min(1, confidence));
    }
    /**
     * Identify risk factors for an opportunity
     */
    identifyRiskFactors(odds, legs) {
        const risks = [];
        // Check time to event
        const hoursToEvent = (odds.startTime - Date.now()) / (1000 * 60 * 60);
        if (hoursToEvent < 1) {
            risks.push('event_starting_soon');
        }
        // Check for palpable error (suspiciously high odds)
        const maxOdds = Math.max(...legs.map(l => l.odds));
        if (maxOdds > 15) {
            risks.push('potential_palpable_error');
        }
        // Check bookmaker diversity
        const uniqueBookmakers = new Set(legs.map(l => l.bookmaker)).size;
        if (uniqueBookmakers === 1) {
            risks.push('same_bookmaker');
        }
        // Check for low liquidity markets
        const hasVolume = legs.some(l => l.odds > 0); // Placeholder
        if (!hasVolume) {
            risks.push('unknown_liquidity');
        }
        return risks;
    }
    /**
     * Detect multi-leg arbitrage (accumulators/parlays)
     * This is computationally expensive - use sparingly
     */
    detectMultiLegArbitrage(events, maxLegs = 3) {
        const opportunities = [];
        // This is a simplified placeholder
        // Full implementation would:
        // 1. Generate all combinations of events up to maxLegs
        // 2. For each combination, check if accumulator odds create arbitrage
        // 3. Consider correlation between events
        return opportunities;
    }
    /**
     * Filter opportunities based on user preferences
     */
    filterOpportunities(opportunities, filters) {
        return opportunities.filter(opp => {
            if (filters.minProfit && opp.profitPercent < filters.minProfit)
                return false;
            if (filters.maxProfit && opp.profitPercent > filters.maxProfit)
                return false;
            if (filters.minConfidence && opp.confidence < filters.minConfidence)
                return false;
            if (filters.sports && !filters.sports.includes(opp.sport))
                return false;
            if (filters.bookmakers) {
                const oppBookmakers = new Set(opp.legs.map(l => l.bookmaker));
                const hasAllowedBookmaker = filters.bookmakers.some(b => oppBookmakers.has(b));
                if (!hasAllowedBookmaker)
                    return false;
            }
            if (filters.excludeRiskFactors) {
                const hasExcludedRisk = opp.metadata.riskFactors.some(r => filters.excludeRiskFactors.includes(r));
                if (hasExcludedRisk)
                    return false;
            }
            return true;
        });
    }
}
exports.ArbitrageDetector = ArbitrageDetector;
exports.default = ArbitrageDetector;
//# sourceMappingURL=arbitrage-detector.js.map