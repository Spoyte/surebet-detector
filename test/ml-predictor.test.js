/**
 * @fileoverview ML Odds Predictor Tests
 * @description Test suite for the ML odds prediction module
 */

const { MLOddsPredictor } = require('../src/ml-odds-predictor');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../data/test-ml');

// Mock data
const mockEvent = {
    id: 'test-event-001',
    sport: 'tennis',
    home_team: 'Player A',
    away_team: 'Player B',
    commence_time: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    bookmakers: [
        {
            name: 'TestBookmaker1',
            markets: [{
                type: 'h2h',
                outcomes: [
                    { name: 'Player A', odds: 1.80 },
                    { name: 'Player B', odds: 2.00 }
                ]
            }]
        },
        {
            name: 'TestBookmaker2',
            markets: [{
                type: 'h2h',
                outcomes: [
                    { name: 'Player A', odds: 1.75 },
                    { name: 'Player B', odds: 2.10 }
                ]
            }]
        }
    ]
};

// Test suite
async function runTests() {
    console.log('🧪 Running ML Odds Predictor Tests...\n');
    
    let passed = 0;
    let failed = 0;
    
    // Setup
    const predictor = new MLOddsPredictor({
        dataDir: TEST_DATA_DIR,
        minHistoryPoints: 3
    });
    
    // Clean up test directory
    try {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
    
    // Test 1: Initialization
    try {
        await predictor.init();
        console.log('✅ Test 1: Initialization passed');
        passed++;
    } catch (error) {
        console.error('❌ Test 1: Initialization failed:', error.message);
        failed++;
    }
    
    // Test 2: Record odds
    try {
        await predictor.recordOdds('test-event-001', 'TestBookmaker1', 'h2h', 1.80);
        await predictor.recordOdds('test-event-001', 'TestBookmaker1', 'h2h', 1.82, Date.now() - 300000);
        await predictor.recordOdds('test-event-001', 'TestBookmaker1', 'h2h', 1.85, Date.now() - 600000);
        console.log('✅ Test 2: Record odds passed');
        passed++;
    } catch (error) {
        console.error('❌ Test 2: Record odds failed:', error.message);
        failed++;
    }
    
    // Test 3: Get historical odds
    try {
        const history = await predictor.getHistoricalOdds('test-event-001', 'TestBookmaker1', 'h2h');
        if (history.length >= 1) {
            console.log('✅ Test 3: Get historical odds passed');
            passed++;
        } else {
            throw new Error('Expected at least 1 history entry');
        }
    } catch (error) {
        console.error('❌ Test 3: Get historical odds failed:', error.message);
        failed++;
    }
    
    // Test 4: Calculate trend
    try {
        const history = await predictor.getHistoricalOdds('test-event-001', 'TestBookmaker1', 'h2h');
        const trend = predictor.calculateTrend(history);
        if (trend && trend.direction) {
            console.log('✅ Test 4: Calculate trend passed');
            passed++;
        } else {
            throw new Error('Trend calculation failed');
        }
    } catch (error) {
        console.error('❌ Test 4: Calculate trend failed:', error.message);
        failed++;
    }
    
    // Test 5: Calculate volatility
    try {
        const history = await predictor.getHistoricalOdds('test-event-001', 'TestBookmaker1', 'h2h');
        const volatility = predictor.calculateVolatility(history);
        if (volatility && typeof volatility.value === 'number') {
            console.log('✅ Test 5: Calculate volatility passed');
            passed++;
        } else {
            throw new Error('Volatility calculation failed');
        }
    } catch (error) {
        console.error('❌ Test 5: Calculate volatility failed:', error.message);
        failed++;
    }
    
    // Test 6: Calculate market pressure
    try {
        const pressure = predictor.calculateMarketPressure(mockEvent, 'TestBookmaker1', 'h2h');
        if (pressure && typeof pressure.value === 'number') {
            console.log('✅ Test 6: Calculate market pressure passed');
            passed++;
        } else {
            throw new Error('Market pressure calculation failed');
        }
    } catch (error) {
        console.error('❌ Test 6: Calculate market pressure failed:', error.message);
        failed++;
    }
    
    // Test 7: Predict odds (with insufficient history)
    try {
        const result = await predictor.predictOdds(mockEvent, 'TestBookmaker1', 'h2h', 'Player A');
        if (!result.success && result.reason === 'insufficient_history') {
            console.log('✅ Test 7: Predict odds (insufficient history) passed');
            passed++;
        } else {
            throw new Error('Expected insufficient_history error');
        }
    } catch (error) {
        console.error('❌ Test 7: Predict odds failed:', error.message);
        failed++;
    }
    
    // Test 8: Get stats
    try {
        const stats = predictor.getStats();
        if (stats && typeof stats.totalPredictions === 'number') {
            console.log('✅ Test 8: Get stats passed');
            passed++;
        } else {
            throw new Error('Stats retrieval failed');
        }
    } catch (error) {
        console.error('❌ Test 8: Get stats failed:', error.message);
        failed++;
    }
    
    // Test 9: Export predictions (empty)
    try {
        const json = await predictor.exportPredictions('json');
        if (typeof json === 'string') {
            console.log('✅ Test 9: Export predictions passed');
            passed++;
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        console.error('❌ Test 9: Export predictions failed:', error.message);
        failed++;
    }
    
    // Test 10: Predict arbitrage opportunities
    try {
        const predictions = await predictor.predictArbitrageOpportunities([mockEvent]);
        if (Array.isArray(predictions)) {
            console.log('✅ Test 10: Predict arbitrage opportunities passed');
            passed++;
        } else {
            throw new Error('Expected array of predictions');
        }
    } catch (error) {
        console.error('❌ Test 10: Predict arbitrage opportunities failed:', error.message);
        failed++;
    }
    
    // Cleanup
    try {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
    
    // Summary
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { runTests };
