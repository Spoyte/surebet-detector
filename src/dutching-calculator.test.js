/**
 * Tests for DutchingCalculator using Node.js built-in test runner
 * Run with: node --test src/dutching-calculator.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock the logger module before importing the calculator
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id.endsWith('/logger.js') || id === './logger.js') {
        return { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} };
    }
    return originalRequire.apply(this, arguments);
};

const DutchingCalculator = require('./dutching-calculator.js');

describe('DutchingCalculator', () => {
    let calculator;
    
    beforeEach(async () => {
        calculator = new DutchingCalculator({
            minProfitPercent: 0.5,
            defaultTotalStake: 100
        });
        await calculator.init();
    });
    
    describe('Initialization', () => {
        it('should initialize with default config', () => {
            const defaultCalc = new DutchingCalculator();
            assert.strictEqual(defaultCalc.config.minProfitPercent, 0.5);
            assert.strictEqual(defaultCalc.config.maxOutcomes, 5);
        });
        
        it('should initialize with custom config', () => {
            const customCalc = new DutchingCalculator({
                minProfitPercent: 1.0,
                maxOutcomes: 3
            });
            assert.strictEqual(customCalc.config.minProfitPercent, 1.0);
            assert.strictEqual(customCalc.config.maxOutcomes, 3);
        });
    });
    
    describe('Equal Profit Dutching', () => {
        it('should calculate equal profit Dutch correctly', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.5 },
                { bookmaker: 'BookB', outcome: 'Draw', odds: 3.2 },
                { bookmaker: 'BookC', outcome: 'Away', odds: 3.0 }
            ];
            
            const result = calculator.calculateEqualProfitDutch(outcomes, 100);
            
            assert.strictEqual(result.type, 'equalProfitDutch');
            assert.ok(result.outcomes.length === 3);
            assert.ok(result.totalStake > 0);
            assert.ok(result.bookPercentage > 0);
        });
        
        it('should detect underround (guaranteed profit)', () => {
            // Create an underround situation: 1/2.2 + 1/3.5 + 1/3.5 = 0.98 < 1
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.2 },
                { bookmaker: 'BookB', outcome: 'Draw', odds: 3.5 },
                { bookmaker: 'BookC', outcome: 'Away', odds: 3.5 }
            ];
            
            const result = calculator.calculateEqualProfitDutch(outcomes, 100);
            
            assert.ok(result.isUnderround);
            assert.ok(result.isProfitable);
            assert.ok(result.profitPercent > 0);
        });
        
        it('should return error for less than 2 outcomes', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.0 }
            ];
            
            const result = calculator.calculateEqualProfitDutch(outcomes, 100);
            
            assert.ok(result.error);
            assert.ok(result.error.includes('At least 2 outcomes'));
        });
        
        it('should calculate stakes that sum to total', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.0 },
                { bookmaker: 'BookB', outcome: 'Away', odds: 2.0 }
            ];
            
            const result = calculator.calculateEqualProfitDutch(outcomes, 100);
            const stakeSum = result.outcomes.reduce((sum, o) => sum + o.stake, 0);
            
            assert.ok(Math.abs(stakeSum - result.totalStake) < 0.01);
        });
    });
    
    describe('Weighted Dutching', () => {
        it('should calculate weighted Dutch correctly', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.0, weight: 2 },
                { bookmaker: 'BookB', outcome: 'Away', odds: 2.0, weight: 1 }
            ];
            
            const result = calculator.calculateWeightedDutch(outcomes, 100);
            
            assert.strictEqual(result.type, 'weightedDutch');
            assert.ok(result.outcomes[0].stake > result.outcomes[1].stake); // Higher weight = higher stake
        });
        
        it('should calculate profit range for weighted Dutch', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.5, weight: 1 },
                { bookmaker: 'BookB', outcome: 'Away', odds: 1.8, weight: 1 }
            ];
            
            const result = calculator.calculateWeightedDutch(outcomes, 100);
            
            assert.ok(result.hasOwnProperty('minProfit'));
            assert.ok(result.hasOwnProperty('maxProfit'));
            assert.ok(result.hasOwnProperty('profitRange'));
        });
    });
    
    describe('Target Profit Calculation', () => {
        it('should calculate stakes for target profit', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.2 },
                { bookmaker: 'BookB', outcome: 'Draw', odds: 3.5 },
                { bookmaker: 'BookC', outcome: 'Away', odds: 3.5 }
            ];
            
            const result = calculator.calculateStakesForTargetProfit(outcomes, 10);
            
            assert.strictEqual(result.type, 'targetProfitDutch');
            assert.strictEqual(result.targetProfit, 10);
            assert.ok(result.totalStake > 0);
        });
        
        it('should return error for impossible target profit', () => {
            const outcomes = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 1.8 },
                { bookmaker: 'BookB', outcome: 'Away', odds: 1.8 }
            ];
            
            const result = calculator.calculateStakesForTargetProfit(outcomes, 10);
            
            assert.ok(result.error);
            assert.ok(result.error.includes('Cannot achieve guaranteed profit'));
        });
    });
    
    describe('Exchange Dutching', () => {
        it('should handle lay bets correctly', () => {
            const backBets = [
                { bookmaker: 'BookA', outcome: 'Home', odds: 2.5 }
            ];
            
            const layBets = [
                { bookmaker: 'Betfair', outcome: 'Not Home', odds: 1.67, commission: 0.05 }
            ];
            
            const result = calculator.calculateExchangeDutch(backBets, layBets, 100);
            
            assert.strictEqual(result.type, 'exchangeDutch');
            assert.ok(result.includesLayBets);
            assert.ok(result.outcomes.length === 2);
        });
    });
    
    describe('Stake Rounding', () => {
        it('should round stakes correctly', () => {
            const rounded = calculator.roundStake(10.73);
            assert.strictEqual(rounded, 10.5); // Rounds to nearest 0.5
        });
        
        it('should enforce minimum stake', () => {
            const rounded = calculator.roundStake(2);
            assert.ok(rounded >= calculator.config.minStakePerBookmaker);
        });
        
        it('should enforce maximum stake', () => {
            const rounded = calculator.roundStake(50000);
            assert.ok(rounded <= calculator.config.maxStakePerBookmaker);
        });
    });
    
    describe('Validation', () => {
        it('should validate a correct Dutch', () => {
            const dutchResult = {
                type: 'equalProfitDutch',
                outcomes: [
                    { bookmaker: 'BookA', stake: 50 },
                    { bookmaker: 'BookB', stake: 50 }
                ],
                bookPercentage: 95
            };
            
            const validation = calculator.validateDutch(dutchResult);
            
            assert.ok(validation.valid);
            assert.strictEqual(validation.issues.length, 0);
        });
        
        it('should detect duplicate bookmakers', () => {
            const dutchResult = {
                type: 'equalProfitDutch',
                outcomes: [
                    { bookmaker: 'BookA', stake: 50 },
                    { bookmaker: 'BookA', stake: 50 }
                ],
                bookPercentage: 95
            };
            
            const validation = calculator.validateDutch(dutchResult);
            
            assert.ok(validation.warnings.length > 0);
            assert.ok(validation.warnings.some(w => w.includes('same bookmaker')));
        });
        
        it('should handle errors in Dutch result', () => {
            const dutchResult = {
                error: 'Invalid odds provided'
            };
            
            const validation = calculator.validateDutch(dutchResult);
            
            assert.ok(!validation.valid);
            assert.strictEqual(validation.error, 'Invalid odds provided');
        });
    });
    
    describe('Recommendations', () => {
        it('should generate EXCELLENT recommendation for high profit underround', () => {
            const rec = calculator.generateDutchRecommendation(6, true);
            assert.strictEqual(rec.rating, 'EXCELLENT');
            assert.strictEqual(rec.urgency, 'high');
        });
        
        it('should generate GOOD recommendation for moderate profit underround', () => {
            const rec = calculator.generateDutchRecommendation(3, true);
            assert.strictEqual(rec.rating, 'GOOD');
            assert.strictEqual(rec.urgency, 'medium');
        });
        
        it('should generate AVOID recommendation for negative profit', () => {
            const rec = calculator.generateDutchRecommendation(-2, false);
            assert.strictEqual(rec.rating, 'AVOID');
            assert.strictEqual(rec.urgency, 'none');
        });
        
        it('should generate PROFITABLE recommendation for weighted Dutch', () => {
            const rec = calculator.generateWeightedDutchRecommendation(5, 10);
            assert.strictEqual(rec.rating, 'PROFITABLE');
        });
    });
    
    describe('History', () => {
        it('should save to history', () => {
            const opportunity = {
                profitPercent: 5,
                isProfitable: true
            };
            
            calculator.saveToHistory(opportunity);
            
            assert.strictEqual(calculator.historicalDutches.length, 1);
            assert.ok(calculator.historicalDutches[0].savedAt);
        });
        
        it('should return historical stats', () => {
            calculator.saveToHistory({ profitPercent: 5, isProfitable: true });
            calculator.saveToHistory({ profitPercent: 3, isProfitable: true });
            calculator.saveToHistory({ profitPercent: -1, isProfitable: false });
            
            const stats = calculator.getHistoricalStats();
            
            assert.strictEqual(stats.totalOpportunities, 3);
            assert.strictEqual(stats.profitableOpportunities, 2);
        });
    });
    
    describe('Variance Calculation', () => {
        it('should calculate variance correctly', () => {
            const values = [2, 4, 4, 4, 5, 5, 7, 9];
            const variance = calculator.calculateVariance(values);
            // Population variance = 4
            assert.ok(Math.abs(variance - 4) < 0.01);
        });
        
        it('should return 0 for single value', () => {
            const variance = calculator.calculateVariance([5]);
            assert.strictEqual(variance, 0);
        });
    });
    
    describe('Export', () => {
        it('should export data as JSON', () => {
            const json = calculator.exportData('json');
            const parsed = JSON.parse(json);
            
            assert.ok(parsed.config);
            assert.ok(parsed.timestamp);
        });
        
        it('should export data as object', () => {
            const data = calculator.exportData('object');
            
            assert.ok(typeof data === 'object');
            assert.ok(data.config);
        });
    });
});
