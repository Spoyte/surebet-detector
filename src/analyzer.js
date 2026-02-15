/**
 * Analyzes odds data to find arbitrage and +EV opportunities
 */
class OpportunityAnalyzer {
    constructor(config) {
        this.config = config;
        this.MIN_EV_THRESHOLD = parseFloat(config.MIN_EV_THRESHOLD) || 5;
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
            promotions: []
        };

        // Analyze Odds API data
        for (const event of data.oddsData) {
            // Find pure arbitrage within bookmakers
            const arbOpps = this.findArbitrage(event);
            opportunities.arbitrage.push(...arbOpps);

            // Find +EV opportunities
            const evOpps = this.findPositiveEV(event);
            opportunities.positiveEV.push(...evOpps);
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

        return opportunities;
    }

    /**
     * Find pure arbitrage opportunities within a single event
     */
    findArbitrage(event) {
        const opportunities = [];
        
        // Get all h2h markets from different bookmakers
        const h2hMarkets = [];
        for (const bookmaker of event.bookmakers) {
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
     * Find +EV opportunities using sharp bookmaker as baseline
     */
    findPositiveEV(event) {
        const opportunities = [];
        
        // Find Pinnacle (sharp bookmaker) odds as baseline
        let pinnacle = null;
        for (const bookmaker of event.bookmakers) {
            if (bookmaker.key === 'pinnacle' || bookmaker.name === 'Pinnacle') {
                pinnacle = bookmaker;
                break;
            }
        }

        if (!pinnacle) return opportunities;

        const pinnacleH2H = pinnacle.markets.find(m => m.type === 'h2h');
        if (!pinnacleH2H) return opportunities;

        // Compare other bookmakers to Pinnacle
        for (const bookmaker of event.bookmakers) {
            if (bookmaker.key === 'pinnacle') continue;

            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (!h2h) continue;

            for (let i = 0; i < h2h.outcomes.length; i++) {
                const outcome = h2h.outcomes[i];
                const pinnacleOutcome = pinnacleH2H.outcomes[i];

                if (!pinnacleOutcome) continue;

                // Skip suspicious odds (likely data errors or different markets)
                // If bookmaker odds are >3x Pinnacle, it's probably an error
                if (outcome.odds > pinnacleOutcome.odds * 3) {
                    console.log(`Skipping suspicious odds: ${outcome.name} @ ${bookmaker.name} (${outcome.odds} vs Pinnacle ${pinnacleOutcome.odds})`);
                    continue;
                }

                // Calculate EV
                const trueProbability = 1 / pinnacleOutcome.odds;
                const ev = (outcome.odds * trueProbability) - 1;
                const evPercent = ev * 100;

                if (evPercent > this.MIN_EV_THRESHOLD) {
                    opportunities.push({
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

        return opportunities;
    }

    /**
     * Find opportunities between traditional bookmakers and Polymarket
     */
    findCrossMarketOpportunities(oddsData, polymarketData, forex) {
        const opportunities = {
            arbitrage: [],
            positiveEV: []
        };

        for (const oddEvent of oddsData) {
            // Find matching Polymarket event
            const polyEvent = this.matchEvents(oddEvent, polymarketData);
            if (!polyEvent) continue;

            // Get best odds from bookmakers
            const h2hMarkets = [];
            for (const bookmaker of oddEvent.bookmakers) {
                const h2h = bookmaker.markets.find(m => m.type === 'h2h');
                if (h2h) {
                    h2hMarkets.push({ bookmaker: bookmaker.name, outcomes: h2h.outcomes });
                }
            }

            if (h2hMarkets.length === 0) continue;

            // Compare with Polymarket
            const polyMarket = polyEvent.bookmakers[0].markets[0];
            
            for (const market of h2hMarkets) {
                for (let i = 0; i < market.outcomes.length; i++) {
                    const bookOdds = market.outcomes[i].odds;
                    const polyOdds = polyMarket.outcomes[i]?.odds;
                    
                    if (!polyOdds) continue;

                    // Convert Polymarket USD odds to EUR equivalent
                    const polyOddsEUR = polyOdds; // Already in implied probability format

                    // Check for arbitrage
                    const bookImplied = 1 / bookOdds;
                    const polyImplied = 1 / polyOdds;

                    if (bookImplied + polyImplied < 1) {
                        const profitPercent = (1 - (bookImplied + polyImplied)) * 100;
                        opportunities.arbitrage.push({
                            type: 'crossMarketArbitrage',
                            event: oddEvent.eventName,
                            sport: oddEvent.sport,
                            profitPercent: parseFloat(profitPercent.toFixed(2)),
                            legs: [
                                {
                                    outcome: market.outcomes[i].name,
                                    bookmaker: market.bookmaker,
                                    odds: bookOdds,
                                    currency: 'EUR'
                                },
                                {
                                    outcome: polyMarket.outcomes[i].name,
                                    bookmaker: 'Polymarket',
                                    odds: polyOdds,
                                    currency: 'USD',
                                    forexRate: forex.USD_EUR
                                }
                            ],
                            note: `Forex: 1 USD = ${forex.USD_EUR} EUR`
                        });
                    }
                }
            }
        }

        return opportunities;
    }

    /**
     * Match events between Odds API and Polymarket
     */
    matchEvents(oddEvent, polymarketData) {
        // Simple matching based on event name similarity
        // In production, you'd want more sophisticated matching
        const oddName = oddEvent.eventName.toLowerCase();
        
        for (const polyEvent of polymarketData) {
            const polyName = polyEvent.eventName.toLowerCase();
            
            // Check for common keywords
            const keywords = oddName.split(' ').filter(w => w.length > 3);
            const matches = keywords.filter(kw => polyName.includes(kw)).length;
            
            if (matches >= 2) {
                return polyEvent;
            }
        }
        
        return null;
    }

    /**
     * Apply promotion boosts to find enhanced +EV
     */
    applyPromotions(opportunities, promotions) {
        const enhanced = [];

        for (const opp of opportunities.positiveEV) {
            for (const promo of promotions) {
                if (this.promotionApplies(promo, opp)) {
                    const boostedOdds = this.applyBoost(opp.odds, promo);
                    const boostedEV = ((boostedOdds * (opp.trueProbability / 100)) - 1) * 100;

                    enhanced.push({
                        ...opp,
                        originalOdds: opp.odds,
                        boostedOdds,
                        originalEV: opp.evPercent,
                        boostedEV: parseFloat(boostedEV.toFixed(2)),
                        promotion: promo
                    });
                }
            }
        }

        return enhanced;
    }

    /**
     * Check if promotion applies to opportunity
     */
    promotionApplies(promo, opp) {
        // Check bookmaker match
        if (promo.bookmaker && promo.bookmaker !== opp.bookmaker) return false;
        
        // Check sport match
        if (promo.sport && promo.sport !== opp.sport) return false;
        
        // Check minimum odds
        if (promo.minOdds && opp.odds < promo.minOdds) return false;

        return true;
    }

    /**
     * Apply odds boost
     */
    applyBoost(odds, promo) {
        if (promo.type === 'oddsBoost') {
            return odds * (1 + promo.percent / 100);
        }
        if (promo.type === 'freeBet') {
            // Free bet EV calculation is different
            // Simplified: assume 70% retention on free bet
            return odds + (promo.value / 100) * 0.7;
        }
        return odds;
    }
}

module.exports = OpportunityAnalyzer;
