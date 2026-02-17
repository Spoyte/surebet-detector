/**
 * Sharp Bookmaker Integration Tests
 * Using Node.js built-in test runner
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const SharpBookmakerIntegration = require('./sharp-bookmaker-integration');

describe('SharpBookmakerIntegration', () => {
  let integration;

  beforeEach(() => {
    integration = new SharpBookmakerIntegration({
      pinnacleApiKey: 'test-pinnacle-key',
      cloudbetApiKey: 'test-cloudbet-key',
      cacheTtlMs: 1000 // Short cache for testing
    });
  });

  describe('Constructor', () => {
    it('should initialize with provided options', () => {
      assert.strictEqual(integration.options.pinnacleApiKey, 'test-pinnacle-key');
      assert.strictEqual(integration.options.cloudbetApiKey, 'test-cloudbet-key');
      assert.strictEqual(integration.bookmakers.pinnacle.enabled, true);
      assert.strictEqual(integration.bookmakers.cloudbet.enabled, true);
      assert.strictEqual(integration.bookmakers.maxwell.enabled, false);
    });

    it('should use environment variables when options not provided', () => {
      process.env.PINNACLE_API_KEY = 'env-pinnacle-key';
      const int = new SharpBookmakerIntegration();
      assert.strictEqual(int.options.pinnacleApiKey, 'env-pinnacle-key');
      delete process.env.PINNACLE_API_KEY;
    });
  });

  describe('removeVig', () => {
    it('should remove margin from 2-outcome odds', () => {
      const odds = { home: 1.9, away: 1.9 }; // 5.26% margin each way
      const fairOdds = integration.removeVig(odds, 0.05);
      
      // Fair odds should be higher (no margin)
      assert.ok(fairOdds.home > 1.9);
      assert.ok(fairOdds.away > 1.9);
      
      // Probabilities should sum to 1
      const probSum = 1/fairOdds.home + 1/fairOdds.away;
      assert.ok(Math.abs(probSum - 1) < 0.001);
    });

    it('should remove margin from 3-outcome odds', () => {
      const odds = { home: 2.5, draw: 3.2, away: 2.8 };
      const fairOdds = integration.removeVig(odds, 0.05);
      
      const probSum = 1/fairOdds.home + 1/fairOdds.draw + 1/fairOdds.away;
      assert.ok(Math.abs(probSum - 1) < 0.001);
    });
  });

  describe('calculateTrueLine', () => {
    it('should calculate weighted average from multiple sources', () => {
      const oddsArray = [
        {
          bookmaker: 'pinnacle',
          rawOdds: { home: 2.0, away: 1.8 },
          fairOdds: { home: 2.05, away: 1.85 },
          weight: 1.0
        },
        {
          bookmaker: 'cloudbet',
          rawOdds: { home: 1.95, away: 1.85 },
          fairOdds: { home: 2.0, away: 1.9 },
          weight: 0.9
        }
      ];

      const trueLine = integration.calculateTrueLine(oddsArray);
      
      assert.ok(trueLine.odds.home);
      assert.ok(trueLine.odds.away);
      assert.ok(trueLine.confidence > 0);
      assert.strictEqual(trueLine.marginRemoved, true);
    });

    it('should weight higher confidence sources more heavily', () => {
      const oddsArray = [
        {
          bookmaker: 'pinnacle',
          rawOdds: { home: 2.0, away: 1.8 },
          fairOdds: { home: 2.1, away: 1.75 },
          weight: 1.0 // Higher weight
        },
        {
          bookmaker: 'cloudbet',
          rawOdds: { home: 1.9, away: 1.9 },
          fairOdds: { home: 1.95, away: 1.85 },
          weight: 0.5 // Lower weight
        }
      ];

      const trueLine = integration.calculateTrueLine(oddsArray);
      
      // True line should be closer to Pinnacle (higher weight)
      assert.ok(trueLine.odds.home > 2.0);
    });
  });

  describe('calculateConfidence', () => {
    it('should return high confidence when sources agree', () => {
      const dewiggedOdds = [
        { fairOdds: { home: 2.0, away: 1.8 }, weight: 1.0 },
        { fairOdds: { home: 2.01, away: 1.79 }, weight: 0.9 }
      ];
      const trueOdds = { home: 2.005, away: 1.795 };

      const confidence = integration.calculateConfidence(dewiggedOdds, trueOdds);
      assert.ok(confidence > 0.8);
    });

    it('should return low confidence when sources disagree', () => {
      const dewiggedOdds = [
        { fairOdds: { home: 2.5, away: 1.5 }, weight: 1.0 },
        { fairOdds: { home: 1.8, away: 2.0 }, weight: 0.9 }
      ];
      const trueOdds = { home: 2.15, away: 1.75 };

      const confidence = integration.calculateConfidence(dewiggedOdds, trueOdds);
      assert.ok(confidence < 0.5);
    });

    it('should return 0.5 confidence with single source', () => {
      const dewiggedOdds = [
        { fairOdds: { home: 2.0, away: 1.8 }, weight: 1.0 }
      ];
      const trueOdds = { home: 2.0, away: 1.8 };

      const confidence = integration.calculateConfidence(dewiggedOdds, trueOdds);
      assert.strictEqual(confidence, 0.5);
    });
  });

  describe('detectValueBet', () => {
    it('should detect positive EV when bookmaker offers better odds than true line', () => {
      const recreationalOdds = { home: 2.2, away: 1.7 }; // Better than true
      const trueLine = {
        trueOdds: { home: 2.0, away: 1.8 },
        confidence: 0.8
      };

      const result = integration.detectValueBet(recreationalOdds, trueLine);
      
      assert.strictEqual(result.hasValue, true);
      assert.ok(result.valueBets.length > 0);
      assert.strictEqual(result.bestValue.outcome, 'home');
      assert.ok(result.bestValue.expectedValue > 0);
    });

    it('should not detect value when bookmaker odds are worse', () => {
      const recreationalOdds = { home: 1.8, away: 1.6 }; // Worse than true
      const trueLine = {
        trueOdds: { home: 2.0, away: 1.8 },
        confidence: 0.8
      };

      const result = integration.detectValueBet(recreationalOdds, trueLine);
      
      assert.strictEqual(result.hasValue, false);
      assert.strictEqual(result.valueBets.length, 0);
      assert.strictEqual(result.bestValue, null);
    });

    it('should calculate edge correctly', () => {
      const recreationalOdds = { home: 2.1 };
      const trueLine = {
        trueOdds: { home: 2.0 },
        confidence: 0.8
      };

      const result = integration.detectValueBet(recreationalOdds, trueLine);
      
      // EV = (2.1 * 0.5) - 1 = 0.05 = 5%
      assert.ok(result.bestValue.expectedValue > 4);
    });
  });

  describe('getValueRecommendation', () => {
    it('should recommend STRONG_BET for high EV and confidence', () => {
      assert.strictEqual(integration.getValueRecommendation(0.06, 0.85), 'STRONG_BET');
    });

    it('should recommend BET for moderate EV and confidence', () => {
      assert.strictEqual(integration.getValueRecommendation(0.04, 0.75), 'BET');
    });

    it('should recommend SMALL_BET for lower EV', () => {
      assert.strictEqual(integration.getValueRecommendation(0.025, 0.65), 'SMALL_BET');
    });

    it('should recommend MARGINAL for minimal EV', () => {
      assert.strictEqual(integration.getValueRecommendation(0.01, 0.9), 'MARGINAL');
    });

    it('should recommend NO_BET for negative EV', () => {
      assert.strictEqual(integration.getValueRecommendation(-0.01, 0.9), 'NO_BET');
    });
  });

  describe('Cache', () => {
    it('should cache and retrieve values', () => {
      const key = 'test-key';
      const value = { odds: { home: 2.0 } };

      integration.setCached(key, value);
      const cached = integration.getCached(key);

      assert.deepStrictEqual(cached, value);
    });

    it('should return null for expired cache', (t, done) => {
      const key = 'expired-key';
      const value = { odds: { home: 2.0 } };

      integration.setCached(key, value);
      
      setTimeout(() => {
        const cached = integration.getCached(key);
        assert.strictEqual(cached, null);
        done();
      }, 1100);
    });

    it('should clear all cache', () => {
      integration.setCached('key1', { value: 1 });
      integration.setCached('key2', { value: 2 });

      integration.clearCache();

      assert.strictEqual(integration.getCached('key1'), null);
      assert.strictEqual(integration.getCached('key2'), null);
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status for all bookmakers', () => {
      const health = integration.getHealthStatus();

      assert.ok(health.pinnacle);
      assert.ok(health.cloudbet);
      assert.ok(health.maxwell);

      assert.strictEqual(health.pinnacle.enabled, true);
      assert.strictEqual(health.pinnacle.status, 'configured');
      assert.strictEqual(health.maxwell.enabled, false);
      assert.strictEqual(health.maxwell.status, 'not_configured');
    });

    it('should include features for each bookmaker', () => {
      const health = integration.getHealthStatus();

      assert.ok(health.pinnacle.features.includes('high_limits'));
      assert.ok(health.pinnacle.features.includes('no_restrictions'));
      assert.ok(health.cloudbet.features.includes('crypto_friendly'));
    });
  });

  describe('getPinnacleSportId', () => {
    it('should return correct sport IDs', () => {
      assert.strictEqual(integration.getPinnacleSportId('soccer'), 29);
      assert.strictEqual(integration.getPinnacleSportId('tennis'), 33);
      assert.strictEqual(integration.getPinnacleSportId('basketball'), 4);
      assert.strictEqual(integration.getPinnacleSportId('football'), 15);
    });

    it('should default to soccer for unknown sports', () => {
      assert.strictEqual(integration.getPinnacleSportId('unknown'), 29);
    });
  });

  describe('Integration with Value Betting', () => {
    it('should identify value in soft bookmaker odds', () => {
      // Simulate scenario where soft bookmaker is slow to adjust
      const pinnacleOdds = {
        bookmaker: 'pinnacle',
        rawOdds: { home: 1.8, away: 2.1 },
        fairOdds: { home: 1.85, away: 2.15 },
        weight: 1.0
      };

      const trueLineResult = integration.calculateTrueLine([pinnacleOdds]);
      
      // Format as expected by detectValueBet
      const trueLine = {
        trueOdds: trueLineResult.odds,
        confidence: trueLineResult.confidence
      };

      // Soft bookmaker hasn't adjusted yet
      const softBookmakerOdds = { home: 2.0, away: 1.9 };

      const valueAnalysis = integration.detectValueBet(softBookmakerOdds, trueLine);

      // Home at 2.0 when true is 1.85 is value
      assert.strictEqual(valueAnalysis.hasValue, true);
      const homeValue = valueAnalysis.valueBets.find(v => v.outcome === 'home');
      assert.ok(homeValue);
      assert.ok(homeValue.expectedValue > 0);
    });
  });
});
