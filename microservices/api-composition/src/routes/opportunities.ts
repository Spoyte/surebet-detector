/**
 * Opportunities Routes
 * 
 * Enhanced opportunity endpoints with composition.
 */

import { Router } from 'express';
import { serviceClient } from '../utils/service-client.js';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../index.js';

const router = Router();

/**
 * GET /api/opportunities/enhanced
 * 
 * Opportunities with additional computed fields and metadata.
 */
router.get('/enhanced', cacheMiddleware('opportunities-enhanced', 20), async (req, res) => {
  const {
    sport,
    minProfit,
    maxProfit,
    bookmaker,
    market,
    sortBy = 'profit',
    limit = 50,
    offset = 0
  } = req.query;

  try {
    // Build query params for arbitrage detector
    const params = new URLSearchParams();
    if (sport) params.append('sport', sport as string);
    if (minProfit) params.append('minProfit', minProfit as string);
    if (maxProfit) params.append('maxProfit', maxProfit as string);
    if (bookmaker) params.append('bookmaker', bookmaker as string);
    if (market) params.append('market', market as string);
    params.append('sortBy', sortBy as string);
    params.append('limit', String(Math.min(parseInt(limit as string), 100)));
    params.append('offset', offset as string);

    const [opportunities, bookmakerStats, marketData] = await Promise.allSettled([
      serviceClient.get('arbitrageDetector', `/api/opportunities?${params.toString()}`),
      serviceClient.get('analyticsService', '/api/bookmaker-reliability'),
      serviceClient.get('oddsCollector', '/api/market-data')
    ]);

    const opps = opportunities.status === 'fulfilled' ? opportunities.value as any[] : [];
    const stats = bookmakerStats.status === 'fulfilled' ? bookmakerStats.value as any[] : [];
    const markets = marketData.status === 'fulfilled' ? marketData.value as any[] : [];

    // Enhance opportunities with computed fields
    const enhanced = opps.map(opp => {
      // Calculate reliability score based on bookmaker history
      const reliabilityScores = opp.bookmakers.map((bm: string) => {
        const stat = stats.find((s: any) => s.name === bm);
        return stat ? stat.reliabilityScore : 0.5;
      });
      const avgReliability = reliabilityScores.reduce((a: number, b: number) => a + b, 0) / reliabilityScores.length;

      // Get market context
      const marketInfo = markets.find((m: any) => m.matchId === opp.matchId);

      // Calculate quality score
      const qualityScore = calculateQualityScore(opp, avgReliability);

      return {
        ...opp,
        reliabilityScore: avgReliability,
        qualityScore,
        marketContext: marketInfo || null,
        timeToEvent: opp.eventDate ? new Date(opp.eventDate).getTime() - Date.now() : null,
        estimatedValue: opp.profitPercent * avgReliability,
        riskLevel: determineRiskLevel(opp, avgReliability)
      };
    });

    // Sort by the requested field
    if (sortBy === 'quality') {
      enhanced.sort((a, b) => b.qualityScore - a.qualityScore);
    } else if (sortBy === 'reliability') {
      enhanced.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    }

    res.json({
      opportunities: enhanced.slice(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string)),
      total: enhanced.length,
      filters: {
        sport,
        minProfit,
        maxProfit,
        bookmaker,
        market
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching enhanced opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

/**
 * GET /api/opportunities/:id/full
 * 
 * Complete opportunity details with all related data.
 */
router.get('/:id/full', cacheMiddleware('opportunity-full', 60), async (req, res) => {
  const { id } = req.params;

  try {
    const results = await serviceClient.batch([
      { service: 'arbitrageDetector', endpoint: `/api/opportunities/${id}` },
      { service: 'analyticsService', endpoint: `/api/opportunities/${id}/history` },
      { service: 'analyticsService', endpoint: `/api/opportunities/${id}/line-movement` },
      { service: 'oddsCollector', endpoint: `/api/odds?opportunityId=${id}` },
      { service: 'analyticsService', endpoint: `/api/similar-opportunities/${id}` }
    ]);

    const [opportunity, history, lineMovement, odds, similar] = results;

    if (!opportunity.success) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    // Calculate additional metrics
    const oppData = opportunity.data as any;
    const histData = history.success ? history.value as any[] : [];
    
    const avgProfit = histData.length > 0 
      ? histData.reduce((sum, h) => sum + h.profitPercent, 0) / histData.length 
      : oppData.profitPercent;
    
    const profitTrend = histData.length >= 2 
      ? histData[histData.length - 1].profitPercent - histData[0].profitPercent 
      : 0;

    res.json({
      opportunity: oppData,
      historicalData: {
        entries: histData,
        averageProfit: avgProfit,
        trend: profitTrend > 0 ? 'improving' : profitTrend < 0 ? 'declining' : 'stable',
        volatility: calculateVolatility(histData)
      },
      lineMovement: lineMovement.success ? lineMovement.value : [],
      currentOdds: odds.success ? odds.value : [],
      similarOpportunities: similar.success ? similar.value : [],
      analysis: {
        recommendation: generateRecommendation(oppData, avgProfit, profitTrend),
        confidenceScore: calculateConfidenceScore(oppData, histData.length)
      },
      partialData: results.some(r => !r.success),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching full opportunity details:', error);
    res.status(500).json({ error: 'Failed to fetch opportunity details' });
  }
});

/**
 * GET /api/opportunities/compare
 * 
 * Compare multiple opportunities side by side.
 */
router.post('/compare', async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 5) {
    return res.status(400).json({ error: 'Please provide 2-5 opportunity IDs' });
  }

  try {
    const requests = ids.map(id => ({
      service: 'arbitrageDetector' as const,
      endpoint: `/api/opportunities/${id}`
    }));

    const results = await serviceClient.batch(requests);
    const opportunities = results
      .filter(r => r.success)
      .map(r => r.data);

    if (opportunities.length < 2) {
      return res.status(400).json({ error: 'Could not fetch enough valid opportunities' });
    }

    // Generate comparison analysis
    const comparison = {
      opportunities,
      comparisonMatrix: generateComparisonMatrix(opportunities),
      bestByCategory: findBestByCategory(opportunities),
      riskComparison: compareRisks(opportunities),
      timestamp: new Date().toISOString()
    };

    res.json(comparison);
  } catch (error) {
    logger.error('Error comparing opportunities:', error);
    res.status(500).json({ error: 'Failed to compare opportunities' });
  }
});

// Helper functions
function calculateQualityScore(opp: any, reliability: number): number {
  const profitWeight = 0.4;
  const reliabilityWeight = 0.3;
  const liquidityWeight = 0.2;
  const timeWeight = 0.1;

  const profitScore = Math.min(opp.profitPercent / 10, 1); // Normalize to 0-1
  const liquidityScore = opp.liquidity || 0.5;
  const timeScore = opp.eventDate 
    ? Math.min((new Date(opp.eventDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000), 1)
    : 0.5;

  return (profitScore * profitWeight) +
         (reliability * reliabilityWeight) +
         (liquidityScore * liquidityWeight) +
         (timeScore * timeWeight);
}

function determineRiskLevel(opp: any, reliability: number): 'low' | 'medium' | 'high' {
  if (reliability > 0.8 && opp.profitPercent < 5) return 'low';
  if (reliability < 0.5 || opp.profitPercent > 15) return 'high';
  return 'medium';
}

function calculateVolatility(history: any[]): number {
  if (history.length < 2) return 0;
  
  const profits = history.map(h => h.profitPercent);
  const avg = profits.reduce((a, b) => a + b, 0) / profits.length;
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / profits.length;
  
  return Math.sqrt(variance);
}

function generateRecommendation(opp: any, avgProfit: number, trend: number): string {
  if (opp.profitPercent > 8 && trend >= 0) return 'Strong opportunity - consider immediate action';
  if (opp.profitPercent > 5 && trend >= 0) return 'Good opportunity - monitor for changes';
  if (trend < 0) return 'Declining opportunity - act quickly if interested';
  return 'Standard opportunity - evaluate based on your strategy';
}

function calculateConfidenceScore(opp: any, historyLength: number): number {
  const baseScore = 0.5;
  const historyBonus = Math.min(historyLength * 0.05, 0.3);
  const profitBonus = opp.profitPercent > 5 ? 0.1 : 0;
  
  return Math.min(baseScore + historyBonus + profitBonus, 1);
}

function generateComparisonMatrix(opportunities: any[]): any {
  const categories = ['profit', 'reliability', 'timeToEvent', 'risk'];
  const matrix: Record<string, any> = {};

  categories.forEach(cat => {
    matrix[cat] = opportunities.map(o => ({
      id: o.id,
      value: o[cat],
      rank: 0 // Will be calculated
    }));
    
    // Sort and assign ranks
    matrix[cat].sort((a: any, b: any) => b.value - a.value);
    matrix[cat].forEach((item: any, idx: number) => {
      item.rank = idx + 1;
    });
  });

  return matrix;
}

function findBestByCategory(opportunities: any[]): Record<string, any> {
  return {
    highestProfit: opportunities.reduce((best, curr) => 
      curr.profitPercent > best.profitPercent ? curr : best),
    mostReliable: opportunities.reduce((best, curr) => 
      (curr.reliabilityScore || 0) > (best.reliabilityScore || 0) ? curr : best),
    soonestEvent: opportunities
      .filter(o => o.eventDate)
      .reduce((best, curr) => 
        new Date(curr.eventDate) < new Date(best.eventDate) ? curr : best)
  };
}

function compareRisks(opportunities: any[]): any {
  return opportunities.map(o => ({
    id: o.id,
    event: o.event,
    riskLevel: o.riskLevel,
    factors: {
      profit: o.profitPercent > 10 ? 'high' : o.profitPercent > 5 ? 'medium' : 'low',
      reliability: o.reliabilityScore > 0.8 ? 'low' : o.reliabilityScore > 0.5 ? 'medium' : 'high',
      timePressure: o.timeToEvent < 3600000 ? 'high' : o.timeToEvent < 86400000 ? 'medium' : 'low'
    }
  }));
}

export { router as opportunityRoutes };
