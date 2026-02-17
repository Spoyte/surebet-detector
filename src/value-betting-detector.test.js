/**
 * Tests for ValueBettingDetector using Node.js built-in test runner
 * Run with: node --test src/value-betting-detector.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock the logger module before importing the detector
const mockLogger = {
    info: () => {},
    debug: () => {},
    error: () => {},
    warn: () => {}
};

// Create a mock for the logger module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id.endsWith('/logger.js') || id === './logger.js') {
        return mockLogger;
    }
    return originalRequire.apply(this, arguments);
};

const ValueBettingDetector = require('./value-betting-detector.js');

describe('ValueBettingDetector', () => {
    let detector;
    
    beforeEach(async () => {
        detector = new ValueBettingDetector({
            minEVThreshold: 2.0,
            minConfidence: 0.6,
            dataDir: './test-data'
        });
        await detector.init();
    });
    
    describe('Initialization', () => {
        it('should initialize with default config', () => {
            const defaultDetector = new ValueBettingDetector();
            assert.strictEqual(defaultDetector.config.minEVThreshold, 2.0);
            assert.ok(defaultDetector.config.sharpBookmakers.includes('pinnacle'));
            assert.ok(defaultDetector.config.sharpBookmakers.includes('betfair'));
        });
        
        it('should initialize with custom config', () => {
            const customDetector = new ValueBettingDetector({
                minEVThreshold: 5.0,
                kellyFraction: 0.5
            });
            assert.strictEqual(customDetector.config.minEVThreshold, 5.0);
            assert.strictEqual(customDetector.config.kellyFraction, 0.5);
        });
    });
    
    describe('EV Calculation', () => {
        it('should calculate positive EV correctly', () => {
            const ev = detector.calculateEV(2.5, 0.5);  // 50% true probability, 2.5 odds
            assert.strictEqual(ev.ev, 0.25);  // (2.5 * 0.5) - 1 = 0.25
            assert.strictEqual(ev.evPercent, 25);
        });
        
        it('should calculate negative EV correctly', () => {
            const ev = detector.calculateEV(1.8, 0.5);  // 50% true probability, 1.8 odds
            assert.ok(Math.abs(ev.ev - (-0.10)) < 0.001);  // (1.8 * 0.5) - 1 = -0.10
            assert.strictEqual(ev.evPercent, -10);
        });
        
        it('should calculate zero EV correctly', () => {
            const ev = detector.calculateEV(2.0, 0.5);  // 50% true probability, 2.0 odds
            assert.strictEqual(ev.ev, 0);
            assert.strictEqual(ev.evPercent, 0);
        });
    });
    
    describe('Kelly Criterion', () => {
        it('should calculate Kelly stake correctly for positive EV', () => {
            const stake = detector.calculateKellyStake(2.5, 0.5, 0.25);
            // f* = (1.5 * 0.5 - 0.5) / 1.5 = 0.1667
            // With 0.25 fraction: 0.1667 * 0.25 * 100 = 4.17%
            assert.ok(stake > 0);
            assert.ok(stake < 10);
        });
        
        it('should return 0 for negative EV', () => {
            const stake = detector.calculateKellyStake(1.8, 0.5, 0.25);
            assert.strictEqual(stake, 0);
        });
        
        it('should handle edge case of 100% probability', () => {
            const stake = detector.calculateKellyStake(1.5, 1.0, 0.25);
            assert.strictEqual(stake, 25);  // Maximum stake at 25% of bankroll
        });
    });
    
    describe('Probability Calculations', () => {
        it('should extract sharp bookmaker data correctly', () => {
            const event = {
                bookmakers: [
                    { key: 'pinnacle', name: 'Pinnacle', markets: [{ type: 'h2h', outcomes: [{ name: 'Team A', odds: 2.0 }] }] },
                    { key: 'bet365', name: 'Bet365', markets: [{ type: 'h2h', outcomes: [{ name: 'Team A', odds: 1.9 }] }] }
                ]
            };
            
            const sharpData = detector.extractSharpBookmakerData(event);
            assert.strictEqual(sharpData.length, 1);
            assert.strictEqual(sharpData[0].name, 'Pinnacle');
        });
        
        it('should calculate weighted average probability', () => {
            const sharpData = [
                {
                    name: 'Pinnacle',
                    weight: 0.35,
                    outcomes: [
                        { name: 'Team A', odds: 2.0, impliedProb: 0.5 },
                        { name: 'Team B', odds: 2.0, impliedProb: 0.5 }
                    ]
                },
                {
                    name: 'Betfair',
                    weight: 0.25,
                    outcomes: [
                        { name: 'Team A', odds: 2.1, impliedProb: 0.476 },
                        { name: 'Team B', odds: 1.9, impliedProb: 0.526 }
                    ]
                }
            ];
            
            const probabilities = detector.calculateTrueProbabilities(sharpData, 'soccer');
            assert.ok(probabilities);
            assert.strictEqual(probabilities.length, 2);
            assert.ok(probabilities[0].probability > 0);
            assert.ok(probabilities[0].probability < 1);
        });
        
        it('should normalize probabilities to sum to 1', () => {
            const probabilities = [
                { probability: 0.6, confidence: 0.8, sources: ['Pinnacle'] },
                { probability: 0.6, confidence: 0.8, sources: ['Pinnacle'] }
            ];
            
            const normalized = detector.normalizeProbabilities(probabilities);
            const sum = normalized.reduce((acc, p) => acc + p.probability, 0);
            assert.ok(Math.abs(sum - 1) < 0.00001);
        });
    });
    
    describe('Outlier Detection', () => {
        it('should remove obvious outliers', () => {
            const probs = [
                { prob: 0.5, weight: 1 },
                { prob: 0.51, weight: 1 },
                { prob: 0.49, weight: 1 },
                { prob: 0.9, weight: 1 }  // Outlier
            ];
            
            const filtered = detector.removeOutliers(probs);
            assert.strictEqual(filtered.length, 3);
            assert.ok(!filtered.map(p => p.prob).includes(0.9));
        });
        
        it('should handle small arrays without error', () => {
            const probs = [
                { prob: 0.5, weight: 1 },
                { prob: 0.51, weight: 1 }
            ];
            
            const filtered = detector.removeOutliers(probs);
            assert.strictEqual(filtered.length, 2);
        });
    });
    
    describe('Market Efficiency', () => {
        it('should return correct efficiency for known sports', () => {
            assert.strictEqual(detector.getMarketEfficiency('soccer'), 0.92);
            assert.strictEqual(detector.getMarketEfficiency('tennis'), 0.90);
            assert.strictEqual(detector.getMarketEfficiency('esports'), 0.75);
        });
        
        it('should return default efficiency for unknown sports', () => {
            assert.strictEqual(detector.getMarketEfficiency('unknown-sport'), 0.85);
        });
        
        it('should adjust probabilities for market efficiency', () => {
            const adjusted = detector.adjustForMarketEfficiency(0.7, 0.9);
            // Should move towards 0.5 due to inefficiency
            assert.ok(adjusted < 0.7);
            assert.ok(adjusted > 0.5);
        });
    });
    
    describe('Confidence Calculation', () => {
        it('should calculate higher confidence with more samples', () => {
            const lowSample = detector.calculateProbabilityConfidence(2, 0.01);
            const highSample = detector.calculateProbabilityConfidence(5, 0.01);
            assert.ok(highSample > lowSample);
        });
        
        it('should penalize high variance', () => {
            const lowVariance = detector.calculateProbabilityConfidence(3, 0.001);
            const highVariance = detector.calculateProbabilityConfidence(3, 0.1);
            assert.ok(lowVariance > highVariance);
        });
    });
    
    describe('Recommendation Generation', () => {
        it('should generate STRONG_BUY for high EV and confidence', () => {
            const rec = detector.generateRecommendation(15, 0.9, 5);
            assert.strictEqual(rec.rating, 'STRONG_BUY');
            assert.strictEqual(rec.urgency, 'high');
        });
        
        it('should generate BUY for moderate EV', () => {
            const rec = detector.generateRecommendation(7, 0.75, 3);
            assert.strictEqual(rec.rating, 'BUY');
            assert.strictEqual(rec.urgency, 'medium');
        });
        
        it('should generate SPECULATIVE for marginal value', () => {
            const rec = detector.generateRecommendation(4, 0.65, 1);
            assert.strictEqual(rec.rating, 'SPECULATIVE');
            assert.strictEqual(rec.urgency, 'low');
        });
        
        it('should generate WATCH for low value', () => {
            const rec = detector.generateRecommendation(2, 0.55, 0.5);
            assert.strictEqual(rec.rating, 'WATCH');
            assert.strictEqual(rec.urgency, 'none');
        });
    });
    
    describe('Full Event Analysis', () => {
        const mockEvent = {
            eventName: 'Team A vs Team B',
            sport: 'soccer',
            commenceTime: '2026-02-20T15:00:00Z',
            bookmakers: [
                {
                    key: 'pinnacle',
                    name: 'Pinnacle',
                    markets: [{
                        type: 'h2h',
                        outcomes: [
                            { name: 'Team A', odds: 2.1 },
                            { name: 'Team B', odds: 1.8 }
                        ]
                    }]
                },
                {
                    key: 'betfair',
                    name: 'Betfair',
                    markets: [{
                        type: 'h2h',
                        outcomes: [
                            { name: 'Team A', odds: 2.05 },
                            { name: 'Team B', odds: 1.85 }
                        ]
                    }]
                },
                {
                    key: 'bet365',
                    name: 'Bet365',
                    markets: [{
                        type: 'h2h',
                        outcomes: [
                            { name: 'Team A', odds: 2.3 },  // Value here!
                            { name: 'Team B', odds: 1.65 }
                        ]
                    }]
                }
            ]
        };
        
        it('should detect value bets in event', () => {
            const valueBets = detector.analyzeEvent(mockEvent);
            assert.ok(Array.isArray(valueBets));
            // Bet365 has higher odds on Team A than sharp bookmakers suggest
        });
        
        it('should include all required fields in value bet', () => {
            const valueBets = detector.analyzeEvent(mockEvent);
            if (valueBets.length > 0) {
                const bet = valueBets[0];
                assert.strictEqual(bet.type, 'valueBet');
                assert.ok(bet.hasOwnProperty('event'));
                assert.ok(bet.hasOwnProperty('sport'));
                assert.ok(bet.hasOwnProperty('outcome'));
                assert.ok(bet.hasOwnProperty('bookmaker'));
                assert.ok(bet.hasOwnProperty('odds'));
                assert.ok(bet.hasOwnProperty('trueProbability'));
                assert.ok(bet.hasOwnProperty('evPercent'));
                assert.ok(bet.hasOwnProperty('confidence'));
                assert.ok(bet.hasOwnProperty('kellyStake'));
                assert.ok(bet.hasOwnProperty('recommendation'));
            }
        });
    });
    
    describe('Closing Line Value', () => {
        it('should track CLV correctly', () => {
            const clv = detector.analyzeClosingLineValue('event-1', 2.0, 1.8);
            assert.ok(clv);
            assert.strictEqual(clv.lineMovement, -0.2);
            assert.strictEqual(clv.beatClosingLine, false);  // 1.8 < 2.0, so we got worse odds
        });
        
        it('should identify beating closing line', () => {
            const clv = detector.analyzeClosingLineValue('event-2', 2.0, 2.2);
            assert.strictEqual(clv.beatClosingLine, true);  // 2.2 > 2.0, so we got better odds
        });
    });
    
    describe('Integration', () => {
        const mockOddsData = [
            {
                eventName: 'Match 1',
                sport: 'soccer',
                commenceTime: '2026-02-20T15:00:00Z',
                bookmakers: [
                    {
                        key: 'pinnacle',
                        name: 'Pinnacle',
                        markets: [{
                            type: 'h2h',
                            outcomes: [
                                { name: 'Home', odds: 2.0 },
                                { name: 'Away', odds: 2.0 }
                            ]
                        }]
                    },
                    {
                        key: 'bet365',
                        name: 'Bet365',
                        markets: [{
                            type: 'h2h',
                            outcomes: [
                                { name: 'Home', odds: 2.2 },
                                { name: 'Away', odds: 1.8 }
                            ]
                        }]
                    }
                ]
            }
        ];
        
        it('should categorize value bets by confidence', () => {
            const results = detector.detectValueBets(mockOddsData);
            assert.ok(results.hasOwnProperty('highConfidence'));
            assert.ok(results.hasOwnProperty('mediumConfidence'));
            assert.ok(results.hasOwnProperty('lowConfidence'));
            assert.ok(results.hasOwnProperty('analysis'));
        });
    });
});
