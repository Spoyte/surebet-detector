/**
 * @fileoverview Tests for Odds Line Shopper
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { OddsLineShopper } = require('./odds-line-shopper.js');

describe('OddsLineShopper', () => {
    let shopper;

    beforeEach(async () => {
        shopper = new OddsLineShopper({
            minEVImprovement: 1.0,
            dataDir: './test-data'
        });
        await shopper.init();
    });

    afterEach(async () => {
        await shopper.shutdown();
    });

    describe('initialization', () => {
        it('should initialize with default options', async () => {
            const defaultShopper = new OddsLineShopper();
            await defaultShopper.init();
            assert.strictEqual(defaultShopper.minEVImprovement, 1.0);
            assert.strictEqual(defaultShopper.maxBookmakers, 50);
            assert.strictEqual(defaultShopper.includeExchange, true);
            await defaultShopper.shutdown();
        });

        it('should load bookmaker reliability scores', () => {
            assert.strictEqual(shopper.getReliabilityScore('pinnacle'), 0.95);
            assert.strictEqual(shopper.getReliabilityScore('betfair'), 0.95);
            assert.strictEqual(shopper.getReliabilityScore('unknown'), 0.70);
        });
    });

    describe('exchange handling', () => {
        it('should identify exchanges correctly', () => {
            assert.strictEqual(shopper.isExchange('betfair'), true);
            assert.strictEqual(shopper.isExchange('smarkets'), true);
            assert.strictEqual(shopper.isExchange('bet365'), false);
            assert.strictEqual(shopper.isExchange('pinnacle'), false);
        });

        it('should apply exchange commission', () => {
            const odds = 2.0;
            const result = shopper.applyExchangeCommission(odds, 'betfair');
            // 2.0 odds = 50% probability, with 5% commission = 52.5% = 1.905 odds
            assert.ok(result < odds);
            assert.ok(result > 1.9);
        });
    });

    describe('odds extraction', () => {
        const mockEvent = {
            id: 'test-event-1',
            sport_key: 'soccer_epl',
            home_team: 'Manchester United',
            away_team: 'Liverpool',
            commence_time: '2026-02-20T15:00:00Z',
            bookmakers: [
                {
                    key: 'bet365',
                    title: 'Bet365',
                    last_update: '2026-02-18T10:00:00Z',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Manchester United', price: 2.5 },
                                { name: 'Draw', price: 3.2 },
                                { name: 'Liverpool', price: 2.8 }
                            ]
                        }
                    ]
                },
                {
                    key: 'pinnacle',
                    title: 'Pinnacle',
                    last_update: '2026-02-18T10:05:00Z',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Manchester United', price: 2.6 },
                                { name: 'Draw', price: 3.1 },
                                { name: 'Liverpool', price: 2.9 }
                            ]
                        }
                    ]
                }
            ]
        };

        it('should extract odds lines from event data', () => {
            const lines = shopper.extractOddsLines(mockEvent);
            
            assert.strictEqual(lines.length, 6); // 3 outcomes x 2 bookmakers
            
            // Check structure
            const firstLine = lines[0];
            assert.ok(firstLine.bookmaker);
            assert.ok(firstLine.outcome);
            assert.ok(firstLine.odds);
            assert.ok(firstLine.impliedProbability);
            assert.ok(firstLine.timestamp);
            assert.ok(firstLine.market);
            assert.ok(firstLine.reliability);
        });

        it('should group lines by outcome', () => {
            const lines = shopper.extractOddsLines(mockEvent);
            const grouped = shopper.groupByOutcome(lines);
            
            // Should have 3 groups (3 outcomes)
            assert.strictEqual(grouped.size, 3);
            
            // Each group should have 2 lines (2 bookmakers)
            for (const [key, outcomeLines] of grouped) {
                assert.strictEqual(outcomeLines.length, 2);
            }
        });
    });

    describe('best line finding', () => {
        const mockLines = [
            { bookmaker: 'bet365', outcome: 'Team A', market: 'h2h', odds: 2.0, impliedProbability: 0.5, timestamp: Date.now(), reliability: 0.85 },
            { bookmaker: 'pinnacle', outcome: 'Team A', market: 'h2h', odds: 2.1, impliedProbability: 0.476, timestamp: Date.now(), reliability: 0.95 },
            { bookmaker: 'betfair', outcome: 'Team A', market: 'h2h', odds: 2.05, impliedProbability: 0.488, timestamp: Date.now(), reliability: 0.95 },
            { bookmaker: 'bet365', outcome: 'Team B', market: 'h2h', odds: 1.9, impliedProbability: 0.526, timestamp: Date.now(), reliability: 0.85 },
            { bookmaker: 'pinnacle', outcome: 'Team B', market: 'h2h', odds: 1.85, impliedProbability: 0.541, timestamp: Date.now(), reliability: 0.95 }
        ];

        it('should find best lines for each outcome', () => {
            const bestLines = shopper.findBestLines(mockLines);
            
            assert.ok(bestLines.length > 0);
            
            // Team A should have Pinnacle as best (2.1 odds)
            const teamALine = bestLines.find(l => l.outcome === 'Team A');
            assert.ok(teamALine);
            assert.strictEqual(teamALine.bestOdds.bookmaker, 'pinnacle');
            assert.strictEqual(teamALine.bestOdds.odds, 2.1);
        });

        it('should calculate EV improvement correctly', () => {
            const bestLines = shopper.findBestLines(mockLines);
            const teamALine = bestLines.find(l => l.outcome === 'Team A');
            
            // Best: 2.1, Worst: 2.0, Improvement: (2.1-2.0)/2.0 * 100 = 5%
            assert.strictEqual(teamALine.evImprovement, 5.0);
        });
    });

    describe('event shopping', () => {
        const mockEvent = {
            id: 'test-event-1',
            sport_key: 'soccer_epl',
            home_team: 'Manchester United',
            away_team: 'Liverpool',
            commence_time: '2026-02-20T15:00:00Z',
            bookmakers: [
                {
                    key: 'bet365',
                    title: 'Bet365',
                    last_update: '2026-02-18T10:00:00Z',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Manchester United', price: 2.5 },
                                { name: 'Draw', price: 3.2 },
                                { name: 'Liverpool', price: 2.8 }
                            ]
                        }
                    ]
                },
                {
                    key: 'pinnacle',
                    title: 'Pinnacle',
                    last_update: '2026-02-18T10:05:00Z',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Manchester United', price: 2.6 },
                                { name: 'Draw', price: 3.1 },
                                { name: 'Liverpool', price: 2.9 }
                            ]
                        }
                    ]
                },
                {
                    key: 'unibet',
                    title: 'Unibet',
                    last_update: '2026-02-18T10:03:00Z',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Manchester United', price: 2.45 },
                                { name: 'Draw', price: 3.25 },
                                { name: 'Liverpool', price: 2.75 }
                            ]
                        }
                    ]
                }
            ]
        };

        it('should shop a single event', () => {
            const result = shopper.shopEvent(mockEvent);
            
            assert.strictEqual(result.eventId, 'test-event-1');
            assert.ok(result.eventName.includes('Manchester United'));
            assert.ok(result.eventName.includes('Liverpool'));
            assert.strictEqual(result.sport, 'soccer_epl');
            assert.ok(result.recommendations);
            assert.ok(result.summary);
            assert.strictEqual(result.summary.bookmakers, 3);
        });

        it('should calculate theoretical hold', () => {
            const result = shopper.shopEvent(mockEvent);
            
            assert.ok(result.holdAnalysis);
            assert.ok(result.holdAnalysis.markets);
            assert.ok(result.holdAnalysis.bestMarket);
        });
    });

    describe('bookmaker comparison', () => {
        const mockEvents = [
            {
                id: 'event-1',
                sport_key: 'soccer_epl',
                home_team: 'Team A',
                away_team: 'Team B',
                commence_time: '2026-02-20T15:00:00Z',
                bookmakers: [
                    {
                        key: 'bet365',
                        title: 'Bet365',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team A', price: 2.0 }] }]
                    },
                    {
                        key: 'pinnacle',
                        title: 'Pinnacle',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team A', price: 2.1 }] }]
                    }
                ]
            },
            {
                id: 'event-2',
                sport_key: 'soccer_epl',
                home_team: 'Team C',
                away_team: 'Team D',
                commence_time: '2026-02-20T16:00:00Z',
                bookmakers: [
                    {
                        key: 'bet365',
                        title: 'Bet365',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team C', price: 1.9 }] }]
                    },
                    {
                        key: 'pinnacle',
                        title: 'Pinnacle',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team C', price: 1.85 }] }]
                    }
                ]
            }
        ];

        it('should compare two bookmakers', () => {
            const comparison = shopper.compareBookmakers(mockEvents, 'bet365', 'pinnacle');
            
            assert.strictEqual(comparison.bookmaker1, 'bet365');
            assert.strictEqual(comparison.bookmaker2, 'pinnacle');
            assert.strictEqual(comparison.totalComparisons, 2);
            assert.ok(comparison.summary);
            assert.ok(comparison.comparisons);
        });
    });

    describe('bookmaker rankings', () => {
        const mockEvents = [
            {
                id: 'event-1',
                sport_key: 'soccer_epl',
                home_team: 'Team A',
                away_team: 'Team B',
                commence_time: '2026-02-20T15:00:00Z',
                bookmakers: [
                    {
                        key: 'pinnacle',
                        title: 'Pinnacle',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team A', price: 2.2 }] }]
                    },
                    {
                        key: 'bet365',
                        title: 'Bet365',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team A', price: 2.0 }] }]
                    }
                ]
            },
            {
                id: 'event-2',
                sport_key: 'soccer_epl',
                home_team: 'Team C',
                away_team: 'Team D',
                commence_time: '2026-02-20T16:00:00Z',
                bookmakers: [
                    {
                        key: 'pinnacle',
                        title: 'Pinnacle',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team C', price: 2.3 }] }]
                    },
                    {
                        key: 'bet365',
                        title: 'Bet365',
                        markets: [{ key: 'h2h', outcomes: [{ name: 'Team C', price: 2.1 }] }]
                    }
                ]
            }
        ];

        it('should rank bookmakers by best odds frequency', () => {
            const rankings = shopper.getBookmakerRankings(mockEvents);
            
            assert.ok(rankings.length > 0);
            
            // Pinnacle should be ranked higher (better odds in both events)
            // Note: bookmaker names come from the 'title' field in the data
            const pinnacleRank = rankings.find(r => 
                r.bookmaker.toLowerCase().includes('pinnacle'));
            
            assert.ok(pinnacleRank, 'Pinnacle should be in rankings');
            assert.strictEqual(pinnacleRank.bestOddsCount, 2, 'Pinnacle should have best odds in both events');
        });
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('Running OddsLineShopper tests...');
}
