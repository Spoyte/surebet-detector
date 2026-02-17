/**
 * @fileoverview Tests for Hedge Calculator
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { HedgeCalculator } = require('./hedge-calculator.js');

describe('HedgeCalculator', () => {
    let calculator;

    beforeEach(async () => {
        calculator = new HedgeCalculator({
            minGuaranteedProfit: 0,
            maxHedgeRatio: 2.0,
            targetProfitLock: 0.70
        });
        await calculator.init();
    });

    afterEach(async () => {
        await calculator.shutdown();
    });

    describe('initialization', () => {
        it('should initialize with default options', async () => {
            const defaultCalc = new HedgeCalculator();
            await defaultCalc.init();
            assert.strictEqual(defaultCalc.minGuaranteedProfit, 0);
            assert.strictEqual(defaultCalc.maxHedgeRatio, 2.0);
            assert.strictEqual(defaultCalc.targetProfitLock, 0.70);
            await defaultCalc.shutdown();
        });

        it('should accept custom options', () => {
            assert.strictEqual(calculator.minGuaranteedProfit, 0);
            assert.strictEqual(calculator.maxHedgeRatio, 2.0);
        });
    });

    describe('position management', () => {
        const mockPosition = {
            eventId: 'evt-1',
            eventName: 'Team A vs Team B',
            sport: 'basketball_nba',
            market: 'h2h',
            outcome: 'Team A',
            stake: 100,
            odds: 2.0,
            bookmaker: 'Bet365',
            placedAt: new Date().toISOString(),
            commenceTime: '2026-02-20T20:00:00Z'
        };

        it('should add a position', () => {
            const id = calculator.addPosition(mockPosition);
            assert.ok(id);
            assert.strictEqual(calculator.getPositions().length, 1);
        });

        it('should get a position by id', () => {
            const id = calculator.addPosition(mockPosition);
            const retrieved = calculator.getPosition(id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved.eventName, 'Team A vs Team B');
        });

        it('should remove a position', () => {
            const id = calculator.addPosition(mockPosition);
            assert.strictEqual(calculator.getPositions().length, 1);
            
            const removed = calculator.removePosition(id);
            assert.strictEqual(removed, true);
            assert.strictEqual(calculator.getPositions().length, 0);
        });
    });

    describe('full hedge calculation', () => {
        const position = {
            id: 'pos-1',
            eventId: 'evt-1',
            eventName: 'Team A vs Team B',
            sport: 'basketball_nba',
            market: 'h2h',
            outcome: 'Team A',
            stake: 100,
            odds: 2.0,
            bookmaker: 'Bet365',
            placedAt: new Date().toISOString(),
            commenceTime: '2026-02-20T20:00:00Z',
            status: 'open'
        };

        it('should calculate full hedge for 2-outcome market', () => {
            const currentOdds = {
                'Team A': 1.8,
                'Team B': 2.2,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculateFullHedge(position, currentOdds);
            
            assert.ok(hedge);
            assert.strictEqual(hedge.hedgeOutcome, 'Team B');
            assert.strictEqual(hedge.strategy, 'full_hedge');
            assert.ok(hedge.hedgeStake > 0);
            assert.ok(hedge.guaranteedProfit !== null);
        });

        it('should return null if no guaranteed profit', () => {
            calculator.minGuaranteedProfit = 50;
            
            const currentOdds = {
                'Team A': 1.9,
                'Team B': 1.9,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculateFullHedge(position, currentOdds);
            assert.strictEqual(hedge, null);
        });

        it('should return null if hedge ratio exceeds max', () => {
            calculator.maxHedgeRatio = 0.4;
            
            const currentOdds = {
                'Team A': 1.5,
                'Team B': 3.0,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculateFullHedge(position, currentOdds);
            assert.strictEqual(hedge, null);
        });
    });

    describe('partial hedge calculation', () => {
        const position = {
            id: 'pos-1',
            eventId: 'evt-1',
            eventName: 'Team A vs Team B',
            sport: 'basketball_nba',
            market: 'h2h',
            outcome: 'Team A',
            stake: 100,
            odds: 2.0,
            bookmaker: 'Bet365',
            placedAt: new Date().toISOString(),
            commenceTime: '2026-02-20T20:00:00Z',
            status: 'open'
        };

        it('should calculate partial hedge at 50%', () => {
            const currentOdds = {
                'Team A': 1.8,
                'Team B': 2.2,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculatePartialHedge(position, currentOdds, 0.5);
            
            assert.ok(hedge);
            assert.strictEqual(hedge.strategy, 'partial_hedge');
            assert.strictEqual(hedge.partialHedgePercent, 50);
            assert.strictEqual(hedge.guaranteedProfit, null); // No guaranteed profit
        });

        it('should have different profits for each scenario', () => {
            const currentOdds = {
                'Team A': 1.8,
                'Team B': 2.2,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculatePartialHedge(position, currentOdds, 0.5);
            
            assert.ok(hedge.scenarios.originalWins.profit !== hedge.scenarios.hedgeWins.profit);
        });
    });

    describe('profit lock calculation', () => {
        const position = {
            id: 'pos-1',
            eventId: 'evt-1',
            eventName: 'Team A vs Team B',
            sport: 'basketball_nba',
            market: 'h2h',
            outcome: 'Team A',
            stake: 100,
            odds: 2.0,
            bookmaker: 'Bet365',
            placedAt: new Date().toISOString(),
            commenceTime: '2026-02-20T20:00:00Z',
            status: 'open'
        };

        it('should calculate profit lock when position is in profit', () => {
            // Odds improved from 2.0 to 2.5
            const currentOdds = {
                'Team A': 2.5,
                'Team B': 1.6,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculateProfitLock(position, currentOdds);
            
            assert.ok(hedge);
            assert.strictEqual(hedge.strategy, 'profit_lock');
            assert.ok(hedge.guaranteedProfit > 0);
            assert.ok(hedge.currentProfit > 0);
        });

        it('should return null when position is not in profit', () => {
            // Odds worsened from 2.0 to 1.5
            const currentOdds = {
                'Team A': 1.5,
                'Team B': 2.8,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculateProfitLock(position, currentOdds);
            
            assert.strictEqual(hedge, null);
        });
    });

    describe('calculate all opportunities', () => {
        const position = {
            id: 'pos-1',
            eventId: 'evt-1',
            eventName: 'Team A vs Team B',
            sport: 'basketball_nba',
            market: 'h2h',
            outcome: 'Team A',
            stake: 100,
            odds: 2.0,
            bookmaker: 'Bet365',
            placedAt: new Date().toISOString(),
            commenceTime: '2026-02-20T20:00:00Z',
            status: 'open'
        };

        it('should return multiple hedge opportunities', () => {
            const currentOdds = {
                'Team A': 1.8,
                'Team B': 2.2,
                bookmaker: 'Pinnacle'
            };

            const opportunities = calculator.calculateHedgeOpportunities(position, currentOdds);
            
            assert.ok(opportunities.length > 0);
            
            // Should have full hedge + partial hedges
            const strategies = opportunities.map(o => o.strategy);
            assert.ok(strategies.includes('full_hedge'));
            assert.ok(strategies.includes('partial_hedge'));
        });

        it('should sort opportunities by guaranteed profit', () => {
            const currentOdds = {
                'Team A': 1.8,
                'Team B': 2.2,
                bookmaker: 'Pinnacle'
            };

            const opportunities = calculator.calculateHedgeOpportunities(position, currentOdds);
            
            // First opportunity should have highest guaranteed profit
            if (opportunities.length > 1) {
                const first = opportunities[0];
                const second = opportunities[1];
                
                if (first.guaranteedProfit !== null && second.guaranteedProfit !== null) {
                    assert.ok(first.guaranteedProfit >= second.guaranteedProfit);
                }
            }
        });
    });

    describe('find hedge opportunities for all positions', () => {
        it('should find opportunities for all tracked positions', () => {
            // Add two positions
            calculator.addPosition({
                eventId: 'evt-1',
                eventName: 'Game 1',
                sport: 'basketball_nba',
                market: 'h2h',
                outcome: 'Team A',
                stake: 100,
                odds: 2.0,
                bookmaker: 'Bet365',
                placedAt: new Date().toISOString(),
                commenceTime: '2026-02-20T20:00:00Z'
            });

            calculator.addPosition({
                eventId: 'evt-2',
                eventName: 'Game 2',
                sport: 'basketball_nba',
                market: 'h2h',
                outcome: 'Team C',
                stake: 150,
                odds: 1.8,
                bookmaker: 'Pinnacle',
                placedAt: new Date().toISOString(),
                commenceTime: '2026-02-20T21:00:00Z'
            });

            const allCurrentOdds = {
                'evt-1': {
                    'Team A': 1.8,
                    'Team B': 2.2,
                    bookmaker: 'Pinnacle'
                },
                'evt-2': {
                    'Team C': 1.7,
                    'Team D': 2.3,
                    bookmaker: 'Bet365'
                }
            };

            const result = calculator.findHedgeOpportunities(allCurrentOdds);
            
            assert.strictEqual(result.totalPositions, 2);
            assert.ok(result.positionsWithHedges >= 0);
            assert.ok(Array.isArray(result.opportunities));
            assert.ok(Array.isArray(result.positionsAnalyzed));
        });
    });

    describe('multi-outcome hedge', () => {
        const position = {
            id: 'pos-1',
            eventId: 'evt-1',
            eventName: 'Soccer Match',
            sport: 'soccer_epl',
            market: 'h2h',
            outcome: 'Home',
            stake: 100,
            odds: 2.5,
            bookmaker: 'Bet365',
            placedAt: new Date().toISOString(),
            commenceTime: '2026-02-20T15:00:00Z',
            status: 'open'
        };

        it('should calculate multi-outcome hedge for soccer', () => {
            const currentOdds = {
                'Home': 2.2,
                'Draw': 3.5,
                'Away': 3.2,
                bookmaker: 'Pinnacle'
            };

            const hedge = calculator.calculateMultiOutcomeHedge(
                position, 
                currentOdds, 
                ['Draw', 'Away']
            );
            
            assert.ok(hedge);
            assert.strictEqual(hedge.multiOutcome, true);
            assert.ok(hedge.hedgedOutcomes.includes('Draw'));
            assert.ok(hedge.hedgedOutcomes.includes('Away'));
        });
    });

    describe('hedge summary', () => {
        it('should calculate hedge summary statistics', () => {
            // Add some positions
            calculator.addPosition({
                eventId: 'evt-1',
                eventName: 'Game 1',
                sport: 'basketball_nba',
                market: 'h2h',
                outcome: 'Team A',
                stake: 100,
                odds: 2.0,
                bookmaker: 'Bet365',
                placedAt: new Date().toISOString(),
                commenceTime: '2026-02-20T20:00:00Z'
            });

            calculator.addPosition({
                eventId: 'evt-2',
                eventName: 'Game 2',
                sport: 'basketball_nba',
                market: 'h2h',
                outcome: 'Team C',
                stake: 200,
                odds: 1.8,
                bookmaker: 'Pinnacle',
                placedAt: new Date().toISOString(),
                commenceTime: '2026-02-20T21:00:00Z'
            });

            const summary = calculator.getHedgeSummary();
            
            assert.strictEqual(summary.totalPositions, 2);
            assert.strictEqual(summary.openPositions, 2);
            assert.strictEqual(summary.totalStaked, 300);
        });
    });

    describe('record hedge placed', () => {
        it('should update position status when hedge is recorded', () => {
            const id = calculator.addPosition({
                eventId: 'evt-1',
                eventName: 'Game 1',
                sport: 'basketball_nba',
                market: 'h2h',
                outcome: 'Team A',
                stake: 100,
                odds: 2.0,
                bookmaker: 'Bet365',
                placedAt: new Date().toISOString(),
                commenceTime: '2026-02-20T20:00:00Z'
            });

            const position = calculator.getPosition(id);
            assert.strictEqual(position.status, 'open');

            const mockHedge = {
                hedgeOutcome: 'Team B',
                hedgeStake: 80,
                strategy: 'full_hedge',
                guaranteedProfit: 10
            };

            const recorded = calculator.recordHedgePlaced(id, mockHedge);
            assert.strictEqual(recorded, true);

            const updated = calculator.getPosition(id);
            assert.strictEqual(updated.status, 'fully_hedged');
            assert.ok(updated.hedge);
            assert.ok(updated.hedgedAt);
        });
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('Running HedgeCalculator tests...');
}
