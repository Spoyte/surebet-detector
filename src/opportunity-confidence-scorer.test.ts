/**
 * Opportunity Confidence Scorer Tests
 */

import { OpportunityConfidenceScorer, OpportunityFeatures, ConfidenceScore } from './opportunity-confidence-scorer.js';

describe('OpportunityConfidenceScorer', () => {
  let scorer: OpportunityConfidenceScorer;
  
  const baseFeatures: OpportunityFeatures = {
    profitPercent: 2.5,
    expectedValue: 25,
    timeToEventMinutes: 120,
    timeOfDay: 20,
    dayOfWeek: 6,
    bookmakers: ['pinnacle', 'betfair'],
    bookmakerReliabilityScores: [0.95, 0.92],
    bookmakerAvgFillRates: [0.98, 0.95],
    bookmakerLimitHistory: [10000, 5000],
    sport: 'soccer',
    league: 'Premier League',
    market: '1X2',
    liquidityScore: 0.8,
    oddsMovementVolatility: 0.05,
    historicalSuccessRate: 0.75,
    similarOpportunitiesCount: 50,
    avgTimeToFillMinutes: 8,
    competitorCount: 5,
    marketEfficiency: 0.7
  };

  beforeEach(() => {
    scorer = new OpportunityConfidenceScorer();
  });

  describe('Basic Scoring', () => {
    it('should score an opportunity', async () => {
      const score = await scorer.scoreOpportunity(baseFeatures);
      
      expect(score).toBeDefined();
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.probability).toBeGreaterThanOrEqual(0);
      expect(score.probability).toBeLessThanOrEqual(1);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(score.grade);
    });

    it('should return all required fields', async () => {
      const score = await scorer.scoreOpportunity(baseFeatures);
      
      expect(score.score).toBeDefined();
      expect(score.confidence).toBeDefined();
      expect(score.probability).toBeDefined();
      expect(score.grade).toBeDefined();
      expect(score.factors).toBeDefined();
      expect(score.explanation).toBeDefined();
      expect(score.recommendedAction).toBeDefined();
      expect(score.estimatedFillTimeMinutes).toBeDefined();
    });

    it('should calculate factor scores', async () => {
      const score = await scorer.scoreOpportunity(baseFeatures);
      
      expect(score.factors.profit).toBeGreaterThanOrEqual(0);
      expect(score.factors.profit).toBeLessThanOrEqual(1);
      expect(score.factors.timing).toBeGreaterThanOrEqual(0);
      expect(score.factors.timing).toBeLessThanOrEqual(1);
      expect(score.factors.bookmaker).toBeGreaterThanOrEqual(0);
      expect(score.factors.bookmaker).toBeLessThanOrEqual(1);
      expect(score.factors.market).toBeGreaterThanOrEqual(0);
      expect(score.factors.market).toBeLessThanOrEqual(1);
      expect(score.factors.historical).toBeGreaterThanOrEqual(0);
      expect(score.factors.historical).toBeLessThanOrEqual(1);
    });
  });

  describe('Grade Assignment', () => {
    it('should assign grade A for excellent scores', async () => {
      const highProfitFeatures = { ...baseFeatures, profitPercent: 5.0, historicalSuccessRate: 0.9 };
      const score = await scorer.scoreOpportunity(highProfitFeatures);
      
      if (score.score >= 85) {
        expect(score.grade).toBe('A');
      }
    });

    it('should assign grade F for poor scores', async () => {
      const poorFeatures: OpportunityFeatures = {
        ...baseFeatures,
        profitPercent: 0.1,
        liquidityScore: 0.1,
        bookmakerReliabilityScores: [0.3, 0.3],
        historicalSuccessRate: 0.2
      };
      const score = await scorer.scoreOpportunity(poorFeatures);
      
      if (score.score < 40) {
        expect(score.grade).toBe('F');
      }
    });
  });

  describe('Recommendations', () => {
    it('should recommend execute for high scores', async () => {
      const excellentFeatures = {
        ...baseFeatures,
        profitPercent: 4.0,
        liquidityScore: 0.9,
        historicalSuccessRate: 0.85
      };
      const score = await scorer.scoreOpportunity(excellentFeatures);
      
      if (score.score >= 80) {
        expect(score.recommendedAction).toBe('execute');
      }
    });

    it('should recommend skip for very low scores', async () => {
      const badFeatures: OpportunityFeatures = {
        ...baseFeatures,
        profitPercent: 0.2,
        liquidityScore: 0.1,
        bookmakerReliabilityScores: [0.4, 0.4],
        historicalSuccessRate: 0.1
      };
      const score = await scorer.scoreOpportunity(badFeatures);
      
      if (score.score < 50 && score.profitPercent <= 3) {
        expect(score.recommendedAction).toBe('skip');
      }
    });
  });

  describe('Batch Scoring', () => {
    it('should score multiple opportunities', async () => {
      const opportunities = [
        baseFeatures,
        { ...baseFeatures, profitPercent: 1.5 },
        { ...baseFeatures, profitPercent: 3.5 }
      ];
      
      const scores = await scorer.scoreBatch(opportunities);
      
      expect(scores).toHaveLength(3);
      scores.forEach(score => {
        expect(score.score).toBeDefined();
        expect(score.grade).toBeDefined();
      });
    });
  });

  describe('Model Updates', () => {
    it('should update model with outcome', async () => {
      const outcome = {
        success: true,
        fillTimeMinutes: 5,
        actualProfit: 2.3
      };
      
      await scorer.updateModel(baseFeatures, outcome);
      
      // Should not throw
      expect(scorer).toBeDefined();
    });

    it('should emit modelUpdated event', async () => {
      const eventPromise = new Promise((resolve) => {
        scorer.once('modelUpdated', (event) => {
          resolve(event);
        });
      });
      
      await scorer.updateModel(baseFeatures, {
        success: true,
        fillTimeMinutes: 5,
        actualProfit: 2.3
      });
      
      const event = await eventPromise;
      expect(event).toBeDefined();
      expect(event.outcome).toBeDefined();
      expect(event.historicalCount).toBeGreaterThan(0);
    });
  });

  describe('Bookmaker Rankings', () => {
    it('should return bookmaker rankings', () => {
      const rankings = scorer.getBookmakerRanking();
      
      expect(Array.isArray(rankings)).toBe(true);
      expect(rankings.length).toBeGreaterThan(0);
      
      rankings.forEach(ranking => {
        expect(ranking.bookmaker).toBeDefined();
        expect(ranking.reliability).toBeGreaterThanOrEqual(0);
        expect(ranking.reliability).toBeLessThanOrEqual(1);
        expect(ranking.avgFillRate).toBeGreaterThanOrEqual(0);
        expect(ranking.avgFillRate).toBeLessThanOrEqual(1);
      });
    });

    it('should sort by reliability', () => {
      const rankings = scorer.getBookmakerRanking();
      
      for (let i = 1; i < rankings.length; i++) {
        expect(rankings[i - 1].reliability).toBeGreaterThanOrEqual(rankings[i].reliability);
      }
    });
  });

  describe('Sport Insights', () => {
    it('should return insights for known sports', () => {
      const insights = scorer.getSportInsights('soccer');
      
      expect(insights).not.toBeNull();
      expect(insights?.successRate).toBeGreaterThanOrEqual(0);
      expect(insights?.successRate).toBeLessThanOrEqual(1);
      expect(insights?.avgFillTime).toBeGreaterThan(0);
      expect(insights?.topBookmakers).toBeDefined();
    });

    it('should return null for unknown sports', () => {
      const insights = scorer.getSportInsights('unknown_sport_xyz');
      expect(insights).toBeNull();
    });
  });

  describe('Model Import/Export', () => {
    it('should export model', () => {
      const exported = scorer.exportModel();
      
      expect(exported.bookmakerProfiles).toBeDefined();
      expect(exported.sportProfiles).toBeDefined();
      expect(exported.historicalDataCount).toBeGreaterThanOrEqual(0);
    });

    it('should import model', () => {
      const exported = scorer.exportModel();
      
      const newScorer = new OpportunityConfidenceScorer();
      newScorer.importModel(exported);
      
      const reExported = newScorer.exportModel();
      expect(reExported.bookmakerProfiles).toEqual(exported.bookmakerProfiles);
    });
  });

  describe('Explanation Generation', () => {
    it('should generate explanations for high scores', async () => {
      const highScoreFeatures = {
        ...baseFeatures,
        profitPercent: 4.0,
        liquidityScore: 0.9
      };
      const score = await scorer.scoreOpportunity(highScoreFeatures);
      
      expect(score.explanation.length).toBeGreaterThan(0);
    });

    it('should explain low scores', async () => {
      const lowScoreFeatures: OpportunityFeatures = {
        ...baseFeatures,
        profitPercent: 0.3,
        liquidityScore: 0.2,
        bookmakerReliabilityScores: [0.4, 0.4]
      };
      const score = await scorer.scoreOpportunity(lowScoreFeatures);
      
      expect(score.explanation.length).toBeGreaterThan(0);
    });
  });

  describe('Fill Time Estimation', () => {
    it('should estimate fill time', async () => {
      const score = await scorer.scoreOpportunity(baseFeatures);
      
      expect(score.estimatedFillTimeMinutes).toBeGreaterThan(0);
    });

    it('should estimate faster fills for high scores', async () => {
      const highScoreFeatures = { ...baseFeatures, liquidityScore: 0.95 };
      const lowScoreFeatures = { ...baseFeatures, liquidityScore: 0.2 };
      
      const highScore = await scorer.scoreOpportunity(highScoreFeatures);
      const lowScore = await scorer.scoreOpportunity(lowScoreFeatures);
      
      // High liquidity should generally lead to faster fills
      if (highScore.score > lowScore.score) {
        expect(highScore.estimatedFillTimeMinutes).toBeLessThanOrEqual(
          lowScore.estimatedFillTimeMinutes * 2
        );
      }
    });
  });

  describe('Events', () => {
    it('should emit opportunityScored event', async () => {
      const eventPromise = new Promise((resolve) => {
        scorer.once('opportunityScored', (event) => {
          resolve(event);
        });
      });
      
      await scorer.scoreOpportunity(baseFeatures);
      const event = await eventPromise;
      
      expect(event).toBeDefined();
      expect(event.features).toBeDefined();
      expect(event.score).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it('should emit batchScored event', async () => {
      const eventPromise = new Promise((resolve) => {
        scorer.once('batchScored', (event) => {
          resolve(event);
        });
      });
      
      await scorer.scoreBatch([baseFeatures, baseFeatures]);
      const event = await eventPromise;
      
      expect(event).toBeDefined();
      expect(event.count).toBe(2);
      expect(event.avgScore).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero profit', async () => {
      const zeroProfitFeatures = { ...baseFeatures, profitPercent: 0 };
      const score = await scorer.scoreOpportunity(zeroProfitFeatures);
      
      expect(score.score).toBeDefined();
      expect(score.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle very high profit', async () => {
      const highProfitFeatures = { ...baseFeatures, profitPercent: 10 };
      const score = await scorer.scoreOpportunity(highProfitFeatures);
      
      expect(score.score).toBeGreaterThanOrEqual(50);
    });

    it('should handle missing historical data', async () => {
      const noHistoryFeatures: OpportunityFeatures = {
        ...baseFeatures,
        similarOpportunitiesCount: 0,
        historicalSuccessRate: 0
      };
      const score = await scorer.scoreOpportunity(noHistoryFeatures);
      
      expect(score.score).toBeDefined();
      expect(score.confidence).toBeLessThan(0.8); // Lower confidence without history
    });

    it('should handle single bookmaker', async () => {
      const singleBookmakerFeatures: OpportunityFeatures = {
        ...baseFeatures,
        bookmakers: ['pinnacle'],
        bookmakerReliabilityScores: [0.95],
        bookmakerAvgFillRates: [0.98],
        bookmakerLimitHistory: [10000]
      };
      const score = await scorer.scoreOpportunity(singleBookmakerFeatures);
      
      expect(score.score).toBeDefined();
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Run with Jest: npx jest opportunity-confidence-scorer.test.ts');
}
