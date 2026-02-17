const AlertConfig = require('./alert-config.js');
const { OpportunityQualityScorer } = require('./opportunity-quality-scorer.js');
const { BookmakerHealthMonitor } = require('./bookmaker-health-monitor.js');
const CorrelationDetector = require('./correlation-detector.js');

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
        this.MIN_EV_THRESHOLD = parseFloat(config.MIN_EV_THRESHOLD) || 5;
        this.MAX_EV_DISPLAY = 100; // Cap display at 100% to avoid unrealistic values
        this.SUSPICIOUS_ODDS_RATIO = 2.5; // Flag if odds >2.5x Pinnacle
        this.PINNACLE_CONSENSUS_THRESHOLD = 1.5; // Flag Pinnacle if >1.5x consensus median
        this.qualityScoringEnabled = config.QUALITY_SCORING_ENABLED !== 'false';
    }
    
    async init() {
        await this.qualityScorer.init();
        await this.healthMonitor.init();
        return this;
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
            promotions: [],
            qualitySummary: null
        };

        // Analyze Odds API data
        for (const event of data.oddsData) {
            // Skip if sport is disabled
            if (!this.alertConfig.isSportEnabled(event.sport)) continue;

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
            
            // Add quality summary
            opportunities.qualitySummary = {
                arbitrage: this.qualityScorer.getQualityDistribution(opportunities.arbitrage, 'arbitrage'),
                ev: this.qualityScorer.getQualityDistribution(opportunities.positiveEV, 'ev')
            };
        }

        // Sort by value (or quality score if enabled)
        if (this.qualityScoringEnabled) {
            // Already sorted by quality scorer
        } else {
            opportunities.arbitrage.sort((a, b) => b.profitPercent - a.profitPercent);
            opportunities.positiveEV.sort((a, b) => b.evPercent - a.evPercent);
        }

        // Filter out extreme values from main display
        opportunities.positiveEV = opportunities.positiveEV.filter(ev => ev.evPercent <= this.MAX_EV_DISPLAY);

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
     */
    calculateConsensusOdds(bookmakers, outcomeIndex) {
        const odds = [];
        for (const bookmaker of bookmakers) {
            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (h2h && h2h.outcomes[outcomeIndex]) {
                odds.push(h2h.outcomes[outcomeIndex].odds);
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
     * Returns true if Pinnacle appears to have stale/bad data
     */
    isPinnacleStale(pinnacleOdds, consensusOdds) {
        if (!consensusOdds || consensusOdds === 0) return false;
        const ratio = pinnacleOdds / consensusOdds;
        // If Pinnacle is >1.5x or <0.67x of consensus, it may be stale
        return ratio > this.PINNACLE_CONSENSUS_THRESHOLD || ratio < (1 / this.PINNACLE_CONSENSUS_THRESHOLD);
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
            consensusOdds.push(this.calculateConsensusOdds(uniqueBookmakers, i));
        }

        // Check if Pinnacle has stale data for any outcome
        const staleOutcomes = new Set();
        for (let i = 0; i < pinnacleH2H.outcomes.length; i++) {
            if (this.isPinnacleStale(pinnacleH2H.outcomes[i].odds, consensusOdds[i])) {
                staleOutcomes.add(i);
                opportunities.suspicious.push({
                    type: 'suspicious',
                    event: event.eventName,
                    sport: event.sport,
                    outcome: pinnacleH2H.outcomes[i].name,
                    bookmaker: 'Pinnacle',
                    odds: pinnacleH2H.outcomes[i].odds,
                    consensusOdds: consensusOdds[i],
                    ratio: parseFloat((pinnacleH2H.outcomes[i].odds / consensusOdds[i]).toFixed(2)),
                    note: 'Pinnacle odds significantly different from consensus - possible stale data'
                });
            }
        }

        // Compare other bookmakers to Pinnacle
        for (const bookmaker of uniqueBookmakers) {
            if (bookmaker.name === 'Pinnacle') continue;

            const h2h = bookmaker.markets.find(m => m.type === 'h2h');
            if (!h2h) continue;

            for (let i = 0; i < h2h.outcomes.length; i++) {
                const outcome = h2h.outcomes[i];
                const pinnacleOutcome = pinnacleH2H.outcomes[i];

                if (!pinnacleOutcome) continue;

                // Skip EV calculation if Pinnacle has stale data for this outcome
                if (staleOutcomes.has(i)) continue;

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
