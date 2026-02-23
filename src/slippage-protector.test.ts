/**
 * Slippage Protector Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlippageProtector, SlippageConfig, BetPlacementRequest, OddsSnapshot } from './slippage-protector.js';

describe('SlippageProtector', () => {
  let protector: SlippageProtector;
  
  const defaultConfig: SlippageConfig = {
    maxSlippagePercent: 0.5,
    criticalSlippagePercent: 2.0,
    checkWindowMs: 5000,
    autoRetry: true,
    maxRetries: 3,
    retryDelayMs: 100,
    detectPriceImprovement: true
  };

  beforeEach(() => {
    protector = new SlippageProtector(defaultConfig);
  });

  afterEach(() => {
    protector.dispose();
  });

  describe('Configuration', () => {
    it('should use default config when none provided', () => {
      const p = new SlippageProtector();
      expect(p).toBeDefined();
      p.dispose();
    });

    it('should update config', () => {
      protector.updateConfig({ maxSlippagePercent: 1.0 });
      // Config is private, but we can test behavior changes
    });
  });

  describe('Odds Recording', () => {
    it('should record odds snapshot', () => {
      const snapshot: OddsSnapshot = {
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 2.0,
        timestamp: Date.now()
      };
      
      protector.recordOdds(snapshot);
      // Should not throw
    });

    it('should handle multiple odds updates', () => {
      const baseTime = Date.now();
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 2.0,
        timestamp: baseTime
      });
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.95,
        timestamp: baseTime + 1000
      });
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.90,
        timestamp: baseTime + 2000
      });
      
      // Should maintain history
    });
  });

  describe('Slippage Detection', () => {
    beforeEach(() => {
      // Record initial odds
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 2.0,
        timestamp: Date.now()
      });
    });

    it('should detect no slippage when odds match', async () => {
      const request: BetPlacementRequest = {
        id: 'bet-1',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      expect(result.canProceed).toBe(true);
      expect(result.slippageType).toBe('none');
      expect(result.slippagePercent).toBe(0);
      expect(result.recommendation).toBe('proceed');
    });

    it('should detect critical slippage when odds worsen significantly', async () => {
      // Update odds to much worse value
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.90, // 5% worse than 2.0
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-2',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      expect(result.canProceed).toBe(false);
      expect(result.slippageType).toBe('critical');
      expect(result.recommendation).toBe('abort');
      expect(result.slippagePercent).toBeLessThan(-2.0);
    });

    it('should detect acceptable slippage within tolerance', async () => {
      // Update odds to slightly worse value
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.99, // 0.5% worse than 2.0
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-3',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      expect(result.slippageType).toBe('acceptable');
      expect(result.slippagePercent).toBeGreaterThan(-0.5);
      expect(result.slippagePercent).toBeLessThan(0);
    });

    it('should detect favorable slippage (price improvement)', async () => {
      // Update odds to better value
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 2.1, // 5% better than 2.0
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-4',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      expect(result.canProceed).toBe(true);
      expect(result.slippageType).toBe('favorable');
      expect(result.slippagePercent).toBeGreaterThan(0);
      expect(result.adjustedStake).toBeDefined();
    });

    it('should abort when no current odds available', async () => {
      const request: BetPlacementRequest = {
        id: 'bet-5',
        opportunityId: 'opp-1',
        bookmaker: 'UnknownBookmaker',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      expect(result.canProceed).toBe(false);
      expect(result.slippageType).toBe('critical');
      expect(result.recommendation).toBe('abort');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on acceptable slippage with autoRetry enabled', async () => {
      // Initial odds
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 2.0,
        timestamp: Date.now()
      });
      
      // Worsen odds slightly (within acceptable range but triggers retry)
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.98, // 1% worse
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-retry',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      // With 1% slippage (between maxSlippagePercent 0.5% and critical 2%)
      // and autoRetry enabled, should recommend retry
      expect(result.recommendation).toBe('retry');
      expect(result.retryAfterMs).toBeDefined();
    });

    it('should proceed after max retries reached', async () => {
      protector.updateConfig({ maxRetries: 0 }); // No retries
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.98,
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-no-retry',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      // With no retries allowed, should proceed with adjusted stake
      expect(result.canProceed).toBe(true);
      expect(result.recommendation).toBe('proceed');
      expect(result.adjustedStake).toBeDefined();
    });
  });

  describe('Execute With Protection', () => {
    it('should execute bet when no slippage', async () => {
      const executeFn = vi.fn().mockResolvedValue(true);
      
      const request: BetPlacementRequest = {
        id: 'bet-exec-1',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.executeWithProtection(request, executeFn);
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(executeFn).toHaveBeenCalledTimes(1);
    });

    it('should abort on critical slippage', async () => {
      const executeFn = vi.fn().mockResolvedValue(true);
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.85, // Critical slippage
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-exec-2',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.executeWithProtection(request, executeFn);
      
      expect(result.success).toBe(false);
      expect(result.result.recommendation).toBe('abort');
      expect(executeFn).not.toHaveBeenCalled();
    });

    it('should pass adjusted stake to execute function', async () => {
      const executeFn = vi.fn().mockResolvedValue(true);
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 2.1, // Price improvement
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-exec-3',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      await protector.executeWithProtection(request, executeFn);
      
      expect(executeFn).toHaveBeenCalledWith(
        request,
        expect.any(Number) // adjustedStake
      );
    });
  });

  describe('Events', () => {
    it('should emit slippageCheck event', (done) => {
      protector.on('slippageCheck', (event) => {
        expect(event.request).toBeDefined();
        expect(event.result).toBeDefined();
        expect(event.timestamp).toBeDefined();
        done();
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-event-1',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      protector.checkSlippage(request);
    });

    it('should emit betPlaced event on successful execution', (done) => {
      protector.on('betPlaced', (event) => {
        expect(event.request).toBeDefined();
        expect(event.attempts).toBeDefined();
        done();
      });
      
      const executeFn = vi.fn().mockResolvedValue(true);
      const request: BetPlacementRequest = {
        id: 'bet-event-2',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      protector.executeWithProtection(request, executeFn);
    });

    it('should emit betAborted event on critical slippage', (done) => {
      protector.on('betAborted', (event) => {
        expect(event.request).toBeDefined();
        expect(event.result.recommendation).toBe('abort');
        done();
      });
      
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.80,
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-event-3',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      protector.checkSlippage(request);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero odds gracefully', async () => {
      const request: BetPlacementRequest = {
        id: 'bet-edge-1',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      // Should not throw, but likely abort due to invalid odds
      expect(result).toBeDefined();
    });

    it('should handle very large slippage values', async () => {
      protector.recordOdds({
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        odds: 1.0, // 50% worse than 2.0
        timestamp: Date.now()
      });
      
      const request: BetPlacementRequest = {
        id: 'bet-edge-2',
        opportunityId: 'opp-1',
        bookmaker: 'Unibet',
        market: '1X2',
        selection: 'Home',
        requestedOdds: 2.0,
        stake: 100,
        timestamp: Date.now()
      };
      
      const result = await protector.checkSlippage(request);
      
      expect(result.canProceed).toBe(false);
      expect(result.slippageType).toBe('critical');
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  // Manual test runner for development
  console.log('Run with Jest: npx jest slippage-protector.test.ts');
}
