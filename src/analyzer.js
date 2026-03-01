const AlertConfig = require('./alert-config.js');
const { OpportunityQualityScorer } = require('./opportunity-quality-scorer.js');
const { BookmakerHealthMonitor } = require('./bookmaker-health-monitor.js');
const CorrelationDetector = require('./correlation-detector.js');
const ValueBettingDetector = require('./value-betting-detector.js');
const { OddsLineShopper } = require('./odds-line-shopper.js');
const { HedgeCalculator } = require('./hedge-calculator.js');

/**
 * Enhanced analyzer with better filtering and categorization
 */
class OpportunityAnalyzer {
    constructor(config) {
        this.config = config;
        this.alertConfig = new AlertConfig();
        this.qualityScorer = new OpportunityQualityScorer({ dataDir: config.DATA_DIR });
        this.healthMonitor = new BookmakerHealthMonitor({ dataDir: config.DATA_DIR });
        this.correlationDetector = new CorrelationDetector({
            dataDir: config.DATA_DIR,
            correlationThreshold: parseFloat(config.CORRELATION_THRESHOLD) || 0.7,
            maxExposurePerEvent: parseFloat(config.MAX_EXPOSURE_PER_EVENT) || 1000,
            maxExposurePerTeam: parseFloat(config.MAX_EXPOSURE_PER_TEAM) || 2000,
            maxExposurePerLeague: parseFloat(config.MAX_EXPOSURE_PER_LEAGUE) || 5000
        });
        this.valueBettingDetector = new ValueBettingDetector({
            dataDir: config.DATA_DIR,
            minEVThreshold: parseFloat(config.VALUE_BET_MIN_EV) || 2.0,
            minConfidence: parseFloat(config.VALUE_BET_MIN_CONFIDENCE) || 0.6,
            kellyFraction: parseFloat(config.VALUE_BET_KELLY_FRACTION) || 0.25
        });
        this.oddsLineShopper = new OddsLineShopper({
            dataDir: config.DATA_DIR,
            minEVImprovement: parseFloat(config.LINE_SHOP_MIN_EV) || 2.0,
            includeExchange: config.LINE_SHOP_INCLUDE_EXCHANGE !== 'false',
            logger: console
        });
        this.hedgeCalculator = new HedgeCalculator({
            dataDir: config.DATA_DIR,
            minGuaranteedProfit: parseFloat(config.HEDGE_MIN_PROFIT) || 0,
            maxHedgeRatio: parseFloat(config.HEDGE_MAX_RATIO) || 2.0,
            targetProfitLock: parseFloat(config.HEDGE_PROFIT_LOCK) || 0.70,
            logger: console
        });
        this.MIN_EV_THRESHOLD = parseFloat(config.MIN_EV_THRESHOLD) || 5;
        this.MAX_EV_DISPLAY = 100; // Cap display at 100% to avoid unrealistic values
        this.SUSPICIOUS_ODDS_RATIO = 2.5; // Flag if odds >2.5x Pinnacle
        this.PINNACLE_CONSENSUS_THRESHOLD = 1.5; // Flag Pinnacle if >1.5x consensus median
        this.qualityScoringEnabled = config.QUALITY_SCORING_ENABLED !== 'false';
    }
    
    async init() {
        await this.qualityScorer.init();
        await this.healthMonitor.init();
        await this.valueBettingDetector.init();
        await this.oddsLineShopper.init();
        await this.hedgeCalculator.init();
        return this;
    }

    /**
     * Check if event has already started (in-play)
     */
    isEventInPlay(event) {
        const commenceTime = new Date(event.commenceTime);
        const now = new Date();
        // Consider event in-play if it started more than 5 minutes ago
        // (5 min buffer for clock skew and pre-match odds validity)
        return now.getTime() > (commenceTime.getTime() + 5 * 60 * 1000);
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
            valueBets: [], // New: dedicated value betting opportunities
            suspicious: [], // New: track suspicious odds for review
            promotions: [],
            lineShopping: [], // New: odds line shopping opportunities
            qualitySummary: null
        };

        // Analyze Odds API data
        for (const event of data.oddsData) {
            // Skip if sport is disabled
            if (!this.alertConfig.isSportEnabled(event.sport)) continue;

            // Skip in-play events to avoid stale odds false positives
            if (this.isEventInPlay(event)) continue;

            // Find pure arbitrage within bookmakers
            const arbOpps = this.findArbitrage(event);
            opportunities.arbitrage.push(...arbOpps);

            // Find +EV opportunities (legacy method)
            this.findPositiveEV(event, opportunities);
        }

        // Use enhanced value betting detector
        const valueBetResults = this.valueBettingDetector.detectValueBets(data.oddsData);
        opportunities.valueBets = [
            ...valueBetResults.highConfidence,
            ...valueBetResults.mediumConfidence,
            ...valueBetResults.lowConfidence
        ];

        // Run odds line shopping analysis
        const shoppingResults = this.oddsLineShopper.findShoppingOpportunities(data.oddsData, {
            minImprovement: 2.0,
            maxResults: 20
        });
        opportunities.lineShopping = shoppingResults.opportunities;

        // Cross-reference with Polymarket
        const crossMarketOpps = this.findCrossMarketOpportunities(
            data.oddsData, 
            data.polymarketData,
            data.forex
        );
        opportunities.arbitrage.push(...crossMarketOpps.arbitrage);
        opportunities.positiveEV.push(...crossMarketOpps.positiveEV);

        // Apply quality scoring if enabled
        if (this.qualityScoringEnabled) {
            // Score arbitrage opportunities
            if (opportunities.arbitrage.length > 0) {
                opportunities.arbitrage = this.qualityScorer.scoreAndRankOpportunities(
                    opportunities.arbitrage, 
                    'arbitrage'
                );
            }
            
            // Score +EV opportunities
            if (opportunities.positiveEV.length > 0) {
                opportunities.positiveEV = this.qualityScorer.scoreAndRankOpportunities(
                    opportunities.positiveEV, 
                    'ev'
                );
            }
            
            // Score value bets
            if (opportunities.valueBets.length > 0) {
                opportunities.valueBets = this.qualityScorer.scoreAndRankOpportunities(
                    opportunities.valueBets,
                    'valueBet'
                );
            }
            
            // Add quality summary
            opportunities.qualitySummary = {
                arbitrage: this.qualityScorer.getQualityDistribution(opportunities.arbitrage, 'arbitrage'),
                ev: this.qualityScorer.getQualityDistribution(opportunities.positiveEV, 'ev'),
                valueBets: this.qualityScorer.getQualityDistribution(opportunities.valueBets, 'valueBet')
            };
        }

        // Sort by value (or quality score if enabled)
        if (this.qualityScoringEnabled) {
            // Already sorted by quality scorer
        } else {
            opportunities.arbitrage.sort((a, b) => b.profitPercent - a.profitPercent);
            opportunities.positiveEV.sort((a, b) => b.evPercent - a.evPercent);
            opportunities.valueBets.sort((a, b) => b.evPercent - a.evPercent);
        }

        // Filter out extreme values from main display
        opportunities.positiveEV = opportunities.positiveEV.filter(ev => ev.evPercent <= this.MAX_EV_DISPLAY);
        opportunities.valueBets = opportunities.valueBets.filter(vb => vb.evPercent <= this.MAX_EV_DISPLAY);

        // Apply user-configured filters
        const filtered = this.alertConfig.filterOpportunities(opportunities);
        
        return filtered;
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
     * Calculate median odds from all bookmakers for a given outcome
     * Filters out extreme outliers (odds > 50) which are likely data errors
     * Uses outcome name for robust comparison across bookmakers
     */
    calculateConsensusOdds(bookmakers, outcomeName) {
        const odds = [];
        for (const bookmaker of bookmakers) {
            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (h2h) {
                // Find outcome by name for robust comparison
                const outcome = h2h.outcomes.find(o => o.name === outcomeName);
                if (outcome) {
                    const oddsValue = outcome.odds;
                    // Filter out extreme outliers (>50) which are likely data errors
                    if (oddsValue > 1 && oddsValue <= 50) {
                        odds.push(oddsValue);
                    }
                }
            }
        }
        
        if (odds.length === 0) return null;
        
        odds.sort((a, b) => a - b);
        const mid = Math.floor(odds.length / 2);
        
        let median;
        if (odds.length % 2 === 0) {
            median = (odds[mid - 1] + odds[mid]) / 2;
        } else {
            median = odds[mid];
        }
        // Round to 2 decimal places to avoid floating point precision issues
        return Math.round(median * 100) / 100;
    }

    /**
     * Check if Pinnacle odds are significantly different from consensus
     * Returns an object with { isStale: boolean, direction: 'higher'|'lower'|'normal' }
     * 
     * NOTE: Pinnacle is a sharp bookmaker - when it differs from consensus,
     * it often means the soft bookmakers are slow to adjust, not that Pinnacle is wrong.
     * 
     * - If Pinnacle has LOWER odds than consensus: Soft bookmakers may be slow to adjust
     *   to new information. This could indicate +EV opportunities at soft bookmakers.
     * - If Pinnacle has HIGHER odds than consensus: Pinnacle thinks probability is lower.
     *   Soft bookmakers are overpricing - avoid these bets.
     */
    checkPinnacleDeviation(pinnacleOdds, consensusOdds) {
        if (!consensusOdds || consensusOdds === 0) {
            return { isStale: false, direction: 'normal', ratio: 1 };
        }
        const ratio = pinnacleOdds / consensusOdds;
        const extremeThreshold = 2.5;
        
        if (ratio > extremeThreshold) {
            return { isStale: true, direction: 'higher', ratio };
        } else if (ratio < (1 / extremeThreshold)) {
            return { isStale: true, direction: 'lower', ratio };
        }
        return { isStale: false, direction: 'normal', ratio };
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

        // Calculate consensus odds for each outcome to validate Pinnacle
        const consensusOdds = [];
        for (let i = 0; i < pinnacleH2H.outcomes.length; i++) {
            const outcomeName = pinnacleH2H.outcomes[i].name;
            consensusOdds.push({
                name: outcomeName,
                median: this.calculateConsensusOdds(uniqueBookmakers, outcomeName)
            });
        }

        // Check if Pinnacle has stale data for any outcome and categorize by direction
        const staleOutcomes = new Map(); // outcomeName -> { direction, ratio }
        for (let i = 0; i < pinnacleH2H.outcomes.length; i++) {
            const consensusEntry = consensusOdds[i];
            const deviation = this.checkPinnacleDeviation(pinnacleH2H.outcomes[i].odds, consensusEntry.median);
            
            if (deviation.isStale) {
                staleOutcomes.set(pinnacleH2H.outcomes[i].name, deviation);
                
                // Only flag as suspicious if Pinnacle has LOWER odds (potential value opportunity)
                // If Pinnacle has HIGHER odds, the soft bookmakers are overpricing - not suspicious, just bad value
                if (deviation.direction === 'lower') {
                    opportunities.suspicious.push({
                        type: 'suspicious',
                        event: event.eventName,
                        sport: event.sport,
                        outcome: pinnacleH2H.outcomes[i].name,
                        bookmaker: 'Pinnacle',
                        odds: pinnacleH2H.outcomes[i].odds,
                        consensusOdds: consensusEntry.median,
                        ratio: parseFloat(deviation.ratio.toFixed(2)),
                        note: 'Pinnacle odds significantly LOWER than consensus - potential +EV opportunity at soft bookmakers'
                    });
                }
            }
        }

        // Compare other bookmakers to Pinnacle
        for (const bookmaker of uniqueBookmakers) {
            if (bookmaker.name === 'Pinnacle') continue;

            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (!h2h) continue;

            for (const outcome of h2h.outcomes) {
                // Find matching outcome in Pinnacle by name for robust comparison
                const pinnacleOutcome = pinnacleH2H.outcomes.find(o => o.name === outcome.name);

                if (!pinnacleOutcome) continue;

                const oddsRatio = outcome.odds / pinnacleOutcome.odds;
                const deviation = staleOutcomes.get(outcome.name);

                // Handle extreme deviations from Pinnacle
                if (deviation) {
                    if (deviation.direction === 'higher') {
                        // Pinnacle has HIGHER odds than consensus - soft bookmakers are overpricing
                        // This is -EV territory, skip but log for awareness
                        opportunities.suspicious.push({
                            type: 'suspicious',
                            event: event.eventName,
                            sport: event.sport,
                            outcome: outcome.name,
                            bookmaker: bookmaker.name,
                            odds: outcome.odds,
                            pinnacleOdds: pinnacleOutcome.odds,
                            ratio: parseFloat(oddsRatio.toFixed(2)),
                            note: 'Soft bookmaker overpriced vs Pinnacle - avoid (Pinnacle likely more accurate)'
                        });
                        continue;
                    } else if (deviation.direction === 'lower') {
                        // Pinnacle has LOWER odds than consensus - potential value opportunity
                        // Calculate EV using Pinnacle as baseline even with deviation
                        // (the deviation itself suggests soft bookmakers are slow to adjust)
                    }
                }

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
