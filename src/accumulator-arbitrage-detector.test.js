/**
 * Tests for Accumulator Arbitrage Detector
 */

const AccumulatorArbitrageDetector = require('./accumulator-arbitrage-detector.js');

// Test utilities
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🧪 Running Accumulator Arbitrage Detector Tests...\n');
    
    let passed = 0;
    let failed = 0;

    // Test 1: Initialization with default config
    try {
        console.log('Test 1: Initialization with default config');
        const detector = new AccumulatorArbitrageDetector();
        await detector.init();
        
        if (detector.config.minProfitPercent !== 1.0) {
            throw new Error(`Expected minProfitPercent 1.0, got ${detector.config.minProfitPercent}`);
        }
        if (detector.config.maxLegs !== 5) {
            throw new Error(`Expected maxLegs 5, got ${detector.config.maxLegs}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 2: Initialization with custom config
    try {
        console.log('Test 2: Initialization with custom config');
        const detector = new AccumulatorArbitrageDetector({
            minProfitPercent: 2.5,
            maxLegs: 3,
            minLegs: 2
        });
        
        if (detector.config.minProfitPercent !== 2.5) {
            throw new Error(`Expected minProfitPercent 2.5, got ${detector.config.minProfitPercent}`);
        }
        if (detector.config.maxLegs !== 3) {
            throw new Error(`Expected maxLegs 3, got ${detector.config.maxLegs}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 3: Generate consistent leg keys
    try {
        console.log('Test 3: Generate consistent leg keys');
        const detector = new AccumulatorArbitrageDetector();
        
        const event1 = {
            homeTeam: 'Manchester United',
            awayTeam: 'Liverpool',
            sport: 'soccer',
            commenceTime: '2026-02-20T15:00:00Z'
        };
        
        const event2 = {
            homeTeam: 'MANCHESTERUNITED',
            awayTeam: 'LIVERPOOL',
            sport: 'SOCCER',
            commenceTime: '2026-02-20T15:00:00Z'
        };
        
        const key1 = detector.generateLegKey(event1);
        const key2 = detector.generateLegKey(event2);
        
        if (key1 !== key2) {
            throw new Error(`Keys should match: ${key1} vs ${key2}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 4: Build leg index
    try {
        console.log('Test 4: Build leg index');
        const detector = new AccumulatorArbitrageDetector();
        
        const oddsData = [
            {
                id: '1',
                name: 'Man Utd vs Liverpool',
                homeTeam: 'Manchester United',
                awayTeam: 'Liverpool',
                sport: 'soccer',
                commenceTime: '2026-02-20T15:00:00Z',
                bookmaker: 'BookmakerA',
                odds: [
                    { outcome: 'home', odds: 2.5 },
                    { outcome: 'draw', odds: 3.2 },
                    { outcome: 'away', odds: 2.8 }
                ]
            }
        ];
        
        const index = detector.buildLegIndex(oddsData);
        
        if (index.size !== 1) {
            throw new Error(`Expected index size 1, got ${index.size}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 5: Validate correct accumulator
    try {
        console.log('Test 5: Validate correct accumulator');
        const detector = new AccumulatorArbitrageDetector();
        
        const acc = {
            bookmaker: 'BookmakerA',
            legs: [
                { eventName: 'Match 1', outcome: 'home', odds: 2.0 },
                { eventName: 'Match 2', outcome: 'away', odds: 1.8 }
            ]
        };
        
        if (!detector.isValidAccumulator(acc)) {
            throw new Error('Valid accumulator should pass validation');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 6: Reject accumulator with too few legs
    try {
        console.log('Test 6: Reject accumulator with too few legs');
        const detector = new AccumulatorArbitrageDetector();
        
        const acc = {
            bookmaker: 'BookmakerA',
            legs: [
                { eventName: 'Match 1', outcome: 'home', odds: 2.0 }
            ]
        };
        
        if (detector.isValidAccumulator(acc)) {
            throw new Error('Accumulator with 1 leg should be rejected');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 7: Reject accumulator with too many legs
    try {
        console.log('Test 7: Reject accumulator with too many legs');
        const detector = new AccumulatorArbitrageDetector();
        
        const acc = {
            bookmaker: 'BookmakerA',
            legs: Array(6).fill({ eventName: 'Match', outcome: 'home', odds: 2.0 })
        };
        
        if (detector.isValidAccumulator(acc)) {
            throw new Error('Accumulator with 6 legs should be rejected');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 8: Get opposite outcomes
    try {
        console.log('Test 8: Get opposite outcomes');
        const detector = new AccumulatorArbitrageDetector();
        
        const tests = [
            ['home', 'away'],
            ['away', 'home'],
            ['over', 'under'],
            ['under', 'over'],
            ['yes', 'no'],
            ['1', '2'],
            ['2', '1']
        ];
        
        for (const [input, expected] of tests) {
            const result = detector.getOppositeOutcome(input);
            if (result !== expected) {
                throw new Error(`Opposite of ${input}: expected ${expected}, got ${result}`);
            }
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 9: Calculate accumulator stakes
    try {
        console.log('Test 9: Calculate accumulator stakes');
        const detector = new AccumulatorArbitrageDetector();
        
        const stakes = detector.calculateAccumulatorStakes(5.0, 6.0, 100);
        
        if (stakes.stakeAccumulator1 <= 0) {
            throw new Error('Stake 1 should be positive');
        }
        if (stakes.stakeAccumulator2 <= 0) {
            throw new Error('Stake 2 should be positive');
        }
        if (stakes.totalStake !== 100) {
            throw new Error(`Total stake should be 100, got ${stakes.totalStake}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 10: Calculate hedge stakes
    try {
        console.log('Test 10: Calculate hedge stakes');
        const detector = new AccumulatorArbitrageDetector();
        
        const stakes = detector.calculateHedgeStakes(10.0, 8.0, 100);
        
        if (stakes.accumulatorStake <= 0) {
            throw new Error('Accumulator stake should be positive');
        }
        if (stakes.layStake <= 0) {
            throw new Error('Lay stake should be positive');
        }
        if (stakes.layLiability <= 0) {
            throw new Error('Lay liability should be positive');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 11: Opportunity quality scoring - EXCELLENT
    try {
        console.log('Test 11: Opportunity quality scoring - EXCELLENT');
        const detector = new AccumulatorArbitrageDetector();
        
        const quality = detector.calculateOpportunityQuality(10, 2);
        
        if (quality.tier !== 'EXCELLENT') {
            throw new Error(`Expected tier EXCELLENT, got ${quality.tier}`);
        }
        if (quality.score < 80) {
            throw new Error(`Expected score >= 80, got ${quality.score}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 12: Opportunity quality scoring - POOR
    try {
        console.log('Test 12: Opportunity quality scoring - POOR');
        const detector = new AccumulatorArbitrageDetector();
        
        const quality = detector.calculateOpportunityQuality(1, 6);
        
        if (quality.tier !== 'POOR') {
            throw new Error(`Expected tier POOR, got ${quality.tier}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 13: Calculate match confidence
    try {
        console.log('Test 13: Calculate match confidence');
        const detector = new AccumulatorArbitrageDetector();
        
        const leg = {
            outcome: 'home',
            eventName: 'Man Utd vs Liverpool'
        };
        
        const matches = {
            'home': { bookmaker: 'A', odds: 2.5 },
            'away': { bookmaker: 'B', odds: 2.8 }
        };
        
        const confidence = detector.calculateMatchConfidence(leg, matches);
        
        if (confidence !== 1) {
            throw new Error(`Expected confidence 1, got ${confidence}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 14: Empty statistics
    try {
        console.log('Test 14: Empty statistics');
        const detector = new AccumulatorArbitrageDetector();
        
        const stats = detector.getStatistics();
        
        if (stats.message !== 'No historical data available') {
            throw new Error(`Expected empty stats message, got ${stats.message}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 15: Save and retrieve opportunities
    try {
        console.log('Test 15: Save and retrieve opportunities');
        const detector = new AccumulatorArbitrageDetector();
        
        const opportunities = [
            { type: 'fullAccumulatorArbitrage', profitPercent: 5.0 },
            { type: 'partialAccumulatorArbitrage', profitPercent: 3.0 },
            { type: 'fullAccumulatorArbitrage', profitPercent: -1.0 }
        ];
        
        detector.saveOpportunities(opportunities);
        
        const stats = detector.getStatistics();
        
        if (stats.totalOpportunities !== 3) {
            throw new Error(`Expected 3 opportunities, got ${stats.totalOpportunities}`);
        }
        if (stats.profitableOpportunities !== 2) {
            throw new Error(`Expected 2 profitable opportunities, got ${stats.profitableOpportunities}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 16: Export data as JSON
    try {
        console.log('Test 16: Export data as JSON');
        const detector = new AccumulatorArbitrageDetector();
        
        const json = detector.exportData('json');
        const parsed = JSON.parse(json);
        
        if (!parsed.config) {
            throw new Error('Exported data should include config');
        }
        if (!parsed.statistics) {
            throw new Error('Exported data should include statistics');
        }
        if (!parsed.timestamp) {
            throw new Error('Exported data should include timestamp');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 17: Export data as object
    try {
        console.log('Test 17: Export data as object');
        const detector = new AccumulatorArbitrageDetector();
        
        const data = detector.exportData('object');
        
        if (typeof data !== 'object') {
            throw new Error('Exported data should be an object');
        }
        if (!data.config) {
            throw new Error('Exported data should include config');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 18: Full arbitrage detection
    try {
        console.log('Test 18: Full arbitrage detection');
        const detector = new AccumulatorArbitrageDetector();
        
        const accumulator = {
            bookmaker: 'BookmakerA',
            legs: [
                { eventName: 'Match 1', outcome: 'home', odds: 2.0 },
                { eventName: 'Match 2', outcome: 'away', odds: 2.0 }
            ]
        };
        
        const matchedLegs = [
            {
                originalLeg: accumulator.legs[0],
                matches: {
                    'home': { bookmaker: 'BookmakerB', odds: 2.2 },
                    'away': { bookmaker: 'BookmakerC', odds: 1.9 }
                },
                matchConfidence: 1.0
            },
            {
                originalLeg: accumulator.legs[1],
                matches: {
                    'home': { bookmaker: 'BookmakerC', odds: 1.9 },
                    'away': { bookmaker: 'BookmakerB', odds: 2.2 }
                },
                matchConfidence: 1.0
            }
        ];
        
        const arb = detector.checkFullArbitrage(accumulator, matchedLegs);
        
        if (arb === null) {
            throw new Error('Should detect arbitrage opportunity');
        }
        if (arb.type !== 'fullAccumulatorArbitrage') {
            throw new Error(`Expected type fullAccumulatorArbitrage, got ${arb.type}`);
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 19: No arbitrage when confidence too low
    try {
        console.log('Test 19: No arbitrage when confidence too low');
        const detector = new AccumulatorArbitrageDetector();
        
        const accumulator = {
            bookmaker: 'BookmakerA',
            legs: [
                { eventName: 'Match 1', outcome: 'home', odds: 2.0 }
            ]
        };
        
        const matchedLegs = [
            {
                originalLeg: accumulator.legs[0],
                matches: {},
                matchConfidence: 0.5
            }
        ];
        
        const arb = detector.checkFullArbitrage(accumulator, matchedLegs);
        
        if (arb !== null) {
            throw new Error('Should not detect arbitrage with low confidence');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 20: Partial arbitrage detection
    try {
        console.log('Test 20: Partial arbitrage detection');
        const detector = new AccumulatorArbitrageDetector();
        
        const accumulator = {
            bookmaker: 'BookmakerA',
            legs: [
                { eventName: 'Match 1', outcome: 'home', odds: 2.0 },
                { eventName: 'Match 2', outcome: 'away', odds: 1.8 }
            ]
        };
        
        const matchedLegs = [
            {
                originalLeg: accumulator.legs[0],
                matches: {
                    'home': { bookmaker: 'BookmakerB', odds: 2.5 },
                    'away': { bookmaker: 'BookmakerC', odds: 1.9 }
                },
                matchConfidence: 1.0
            },
            {
                originalLeg: accumulator.legs[1],
                matches: {
                    'home': { bookmaker: 'BookmakerC', odds: 2.1 },
                    'away': { bookmaker: 'BookmakerB', odds: 1.8 }
                },
                matchConfidence: 1.0
            }
        ];
        
        const arb = detector.checkPartialArbitrage(accumulator, matchedLegs);
        
        if (arb === null) {
            throw new Error('Should detect partial arbitrage');
        }
        if (arb.type !== 'partialAccumulatorArbitrage') {
            throw new Error(`Expected type partialAccumulatorArbitrage, got ${arb.type}`);
        }
        if (arb.arbitrageLegs.length === 0) {
            throw new Error('Should have arbitrage legs');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Test 21: End-to-end integration
    try {
        console.log('Test 21: End-to-end integration');
        const detector = new AccumulatorArbitrageDetector();
        
        const accumulatorData = [
            {
                bookmaker: 'BookmakerA',
                legs: [
                    { eventName: 'Team A vs Team B', homeTeam: 'Team A', awayTeam: 'Team B', outcome: 'home', odds: 2.0 },
                    { eventName: 'Team C vs Team D', homeTeam: 'Team C', awayTeam: 'Team D', outcome: 'away', odds: 2.2 }
                ]
            }
        ];
        
        const singleOddsData = [
            {
                id: '1',
                name: 'Team A vs Team B',
                homeTeam: 'Team A',
                awayTeam: 'Team B',
                sport: 'soccer',
                commenceTime: '2026-02-20T15:00:00Z',
                bookmaker: 'BookmakerB',
                odds: [
                    { outcome: 'home', odds: 2.3 },
                    { outcome: 'away', odds: 1.9 }
                ]
            },
            {
                id: '2',
                name: 'Team C vs Team D',
                homeTeam: 'Team C',
                awayTeam: 'Team D',
                sport: 'soccer',
                commenceTime: '2026-02-20T17:00:00Z',
                bookmaker: 'BookmakerB',
                odds: [
                    { outcome: 'home', odds: 1.8 },
                    { outcome: 'away', odds: 2.4 }
                ]
            }
        ];
        
        const opportunities = detector.findAccumulatorArbitrage(accumulatorData, singleOddsData);
        
        if (!Array.isArray(opportunities)) {
            throw new Error('Should return an array of opportunities');
        }
        
        console.log('  ✅ Passed\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}\n`);
        failed++;
    }

    // Print summary
    console.log('='.repeat(50));
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));
    
    return { passed, failed };
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    });
}

module.exports = { runTests };
