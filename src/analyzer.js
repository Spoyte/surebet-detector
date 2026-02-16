/**
 * Enhanced analyzer with better filtering and categorization
 */
class OpportunityAnalyzer {
    constructor(config) {
        this.config = config;
        this.MIN_EV_THRESHOLD = parseFloat(config.MIN_EV_THRESHOLD) || 5;
        this.MAX_EV_DISPLAY = 100; // Cap display at 100% to avoid unrealistic values
        this.SUSPICIOUS_ODDS_RATIO = 2.5; // Flag if odds >2.5x Pinnacle
    }

    /**
     * Main analysis function
     */
    analyze(data) {
        const opportunities = {
            timestamp: data.timestamp,
            forex: data.forex,
            arbitrage: [],
            positiveEV: [],
            suspicious: [], // New: track suspicious odds for review
            promotions: []
        };

        // Analyze Odds API data
        for (const event of data.oddsData) {
            // Find pure arbitrage within bookmakers
            const arbOpps = this.findArbitrage(event);
            opportunities.arbitrage.push(...arbOpps);

            // Find +EV opportunities
            const evOpps = this.findPositiveEV(event, opportunities);
        }

        // Cross-reference with Polymarket
        const crossMarketOpps = this.findCrossMarketOpportunities(
            data.oddsData, 
            data.polymarketData,
            data.forex
        );
        opportunities.arbitrage.push(...crossMarketOpps.arbitrage);
        opportunities.positiveEV.push(...crossMarketOpps.positiveEV);

        // Sort by value
        opportunities.arbitrage.sort((a, b) => b.profitPercent - a.profitPercent);
        opportunities.positiveEV.sort((a, b) => b.evPercent - a.evPercent);

        // Filter out extreme values from main display
        opportunities.positiveEV = opportunities.positiveEV.filter(ev => ev.evPercent <= this.MAX_EV_DISPLAY);

        return opportunities;
    }

    /**
     * Find pure arbitrage opportunities within a single event
     */
    findArbitrage(event) {
        const opportunities = [];
        
        // Deduplicate bookmakers by name first (regional variants)
        const uniqueBookmakers = this.deduplicateBookmakers(event.bookmakers);
        
        // Get all h2h markets from different bookmakers
        const h2hMarkets = [];
        for (const bookmaker of uniqueBookmakers) {
            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (h2h) {
                h2hMarkets.push({
                    bookmaker: bookmaker.name,
                    outcomes: h2h.outcomes
                });
            }
        }

        if (h2hMarkets.length < 2) return opportunities;

        // For 2-outcome markets (tennis, no draw)
        const outcomes = h2hMarkets[0].outcomes;
        if (outcomes.length === 2) {
            // Find best odds for each outcome across bookmakers
            let bestOutcome1 = { odds: 0, bookmaker: '' };
            let bestOutcome2 = { odds: 0, bookmaker: '' };

            for (const market of h2hMarkets) {
                if (market.outcomes[0].odds > bestOutcome1.odds) {
                    bestOutcome1 = {
                        odds: market.outcomes[0].odds,
                        bookmaker: market.bookmaker,
                        name: market.outcomes[0].name
                    };
                }
                if (market.outcomes[1].odds > bestOutcome2.odds) {
                    bestOutcome2 = {
                        odds: market.outcomes[1].odds,
                        bookmaker: market.bookmaker,
                        name: market.outcomes[1].name
                    };
                }
            }

            // Calculate arbitrage
            const impliedProb1 = 1 / bestOutcome1.odds;
            const impliedProb2 = 1 / bestOutcome2.odds;
            const totalImpliedProb = impliedProb1 + impliedProb2;

            if (totalImpliedProb < 1) {
                const profitPercent = (1 - totalImpliedProb) * 100;
                
                opportunities.push({
                    type: 'arbitrage',
                    event: event.eventName,
                    sport: event.sport,
                    commenceTime: event.commenceTime,
                    profitPercent: parseFloat(profitPercent.toFixed(2)),
                    stakes: this.calculateStakes(bestOutcome1.odds, bestOutcome2.odds, 100),
                    legs: [
                        {
                            outcome: bestOutcome1.name,
                            bookmaker: bestOutcome1.bookmaker,
                            odds: bestOutcome1.odds,
                            stake: this.calculateStakes(bestOutcome1.odds, bestOutcome2.odds, 100).stake1
                        },
                        {
                            outcome: bestOutcome2.name,
                            bookmaker: bestOutcome2.bookmaker,
                            odds: bestOutcome2.odds,
                            stake: this.calculateStakes(bestOutcome1.odds, bestOutcome2.odds, 100).stake2
                        }
                    ]
                });
            }
        }

        return opportunities;
    }

    /**
     * Calculate optimal stakes for arbitrage
     */
    calculateStakes(odds1, odds2, totalStake) {
        const implied1 = 1 / odds1;
        const implied2 = 1 / odds2;
        const totalImplied = implied1 + implied2;

        const stake1 = (totalStake * implied1) / totalImplied;
        const stake2 = (totalStake * implied2) / totalImplied;

        const profit1 = (stake1 * odds1) - totalStake;
        const profit2 = (stake2 * odds2) - totalStake;

        return {
            stake1: Math.round(stake1 * 100) / 100,
            stake2: Math.round(stake2 * 100) / 100,
            totalStake,
            guaranteedProfit: Math.round(profit1 * 100) / 100
        };
    }

    /**
     * Deduplicate bookmakers by name, keeping the one with best odds for each outcome
     */
    deduplicateBookmakers(bookmakers) {
        const bestByName = new Map();
        
        for (const bookmaker of bookmakers) {
            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (!h2h) continue;
            
            // Calculate average odds as a proxy for "best"
            const avgOdds = h2h.outcomes.reduce((sum, o) => sum + o.odds, 0) / h2h.outcomes.length;
            
            if (!bestByName.has(bookmaker.name) || bestByName.get(bookmaker.name).avgOdds < avgOdds) {
                bestByName.set(bookmaker.name, { bookmaker, avgOdds });
            }
        }
        
        return Array.from(bestByName.values()).map(b => b.bookmaker);
    }

    /**
     * Find +EV opportunities using sharp bookmaker as baseline
     */
    findPositiveEV(event, opportunities) {
        // Find Pinnacle (sharp bookmaker) odds as baseline
        let pinnacle = null;
        for (const bookmaker of event.bookmakers) {
            if (bookmaker.key === 'pinnacle' || bookmaker.name === 'Pinnacle') {
                pinnacle = bookmaker;
                break;
            }
        }

        if (!pinnacle) return;

        const pinnacleH2H = pinnacle.markets.find(m => m.type === 'h2h');
        if (!pinnacleH2H) return;

        // Deduplicate bookmakers by name (regional variants like unibet_nl, unibet_se)
        const uniqueBookmakers = this.deduplicateBookmakers(event.bookmakers);

        // Compare other bookmakers to Pinnacle
        for (const bookmaker of uniqueBookmakers) {
            if (bookmaker.name === 'Pinnacle') continue;

            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (!h2h) continue;

            for (let i = 0; i < h2h.outcomes.length; i++) {
                const outcome = h2h.outcomes[i];
                const pinnacleOutcome = pinnacleH2H.outcomes[i];

                if (!pinnacleOutcome) continue;

                const oddsRatio = outcome.odds / pinnacleOutcome.odds;

                // Flag suspicious odds (likely promotions or data errors)
                if (oddsRatio > this.SUSPICIOUS_ODDS_RATIO) {
                    opportunities.suspicious.push({
                        type: 'suspicious',
                        event: event.eventName,
                        sport: event.sport,
                        outcome: outcome.name,
                        bookmaker: bookmaker.name,
                        odds: outcome.odds,
                        pinnacleOdds: pinnacleOutcome.odds,
                        ratio: parseFloat(oddsRatio.toFixed(2)),
                        note: 'Odds significantly higher than Pinnacle - possible promotion or error'
                    });
                    continue; // Skip EV calculation for suspicious odds
                }

                // Calculate EV
                const trueProbability = 1 / pinnacleOutcome.odds;
                const ev = (outcome.odds * trueProbability) - 1;
                const evPercent = ev * 100;

                if (evPercent > this.MIN_EV_THRESHOLD) {
                    opportunities.positiveEV.push({
                        type: 'positiveEV',
                        event: event.eventName,
                        sport: event.sport,
                        commenceTime: event.commenceTime,
                        outcome: outcome.name,
                        bookmaker: bookmaker.name,
                        odds: outcome.odds,
                        pinnacleOdds: pinnacleOutcome.odds,
                        evPercent: parseFloat(evPercent.toFixed(2)),
                        trueProbability: parseFloat((trueProbability * 100).toFixed(2)),
                        note: 'Using Pinnacle as sharp baseline'
                    });
                }
            }
        }
    }

    /**
     * Find opportunities between traditional bookmakers and Polymarket
     */
    findCrossMarketOpportunities(oddsData, polymarketData, forex) {
        const opportunities = {
            arbitrage: [],
            positiveEV: []
        };

        // Simplified cross-market detection
        // Full implementation would require better event matching

        return opportunities;
    }
}

module.exports = OpportunityAnalyzer;
