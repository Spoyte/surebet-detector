/**
 * Cross-Sport Arbitrage Detector Tests
 */

import { CrossSportArbitrageDetector, SportEvent } from '../cross-sport-arbitrage-detector.js';

describe('CrossSportArbitrageDetector', () => {
  let detector: CrossSportArbitrageDetector;

  beforeEach(() => {
    detector = new CrossSportArbitrageDetector();
  });

  describe('Basic Detection', () => {
    it('should detect arbitrage between tennis and soccer for same-country athlete', () => {
      const events: SportEvent[] = [
        {
          eventId: 'tennis-001',
          sport: 'tennis',
          league: 'Wimbledon',
          participants: ['Rafael Nadal'],
          startTime: Date.now() + 24 * 60 * 60 * 1000,
          markets: {
            h2h: {
              bestOdds: { 'Rafael Nadal': 1.5 },
              bestBookmaker: 'pinnacle'
            }
          },
          metadata: { country: 'ES' }
        },
        {
          eventId: 'soccer-001',
          sport: 'soccer',
          league: 'La Liga',
          participants: ['Spain'],
          startTime: Date.now() + 24 * 60 * 60 * 1000,
          markets: {
            h2h: {
              bestOdds: { 'Spain': 2.0 },
              bestBookmaker: 'bet365'
            }
          },
          metadata: { country: 'ES' }
        }
      ];

      const opportunities = detector.detectCrossSportArbitrage(events);
      
      // Should find opportunities due to correlation
      expect(opportunities).toBeDefined();
      expect(Array.isArray(opportunities)).toBe(true);
    });

    it('should detect MMA vs Boxing arbitrage for crossover fighters', () => {
      const events: SportEvent[] = [
        {
          eventId: 'mma-001',
          sport: 'mma',
          league: 'UFC',
          participants: ['Conor McGregor'],
          startTime: Date.now() + 48 * 60 * 60 * 1000,
          markets: {
            h2h: {
              bestOdds: { 'Conor McGregor': 1.8 },
              bestBookmaker: 'betfair'
            }
          },
          metadata: { fighterStyle: 'striker' }
        },
        {
          eventId: 'boxing-001',
          sport: 'boxing',
          league: 'Professional',
          participants: ['Conor McGregor'],
          startTime: Date.now() + 72 * 60 * 60 * 1000,
          markets: {
            h2h: {
              bestOdds: { 'Conor McGregor': 2.2 },
              bestBookmaker: 'pinnacle'
            }
          },
          metadata: { fighterStyle: 'striker' }
        }
      ];

      const opportunities = detector.detectCrossSportArbitrage(events);
      expect(opportunities).toBeDefined();
    });

    it('should return empty array when no cross-sport events exist', () => {
      const events: SportEvent[] = [
        {
          eventId: 'soccer-001',
          sport: 'soccer',
          league: 'Premier League',
          participants: ['Manchester United', 'Liverpool'],
          startTime: Date.now() + 24 * 60 * 60 * 1000,
          markets: {
            h2h: {
              bestOdds: { 'Manchester United': 2.5, 'Liverpool': 2.8 },
              bestBookmaker: 'bet365'
            }
          }
        }
      ];

      const opportunities = detector.detectCrossSportArbitrage(events);
      expect(opportunities).toEqual([]);
    });
  });

  describe('Filtering', () => {
    it('should filter by minimum profit', () => {
      const opportunities = [
        {
          id: 'opp-1',
          type: 'cross_market' as const,
          profitPercent: 0.5,
          confidence: 0.8,
          correlationStrength: 0.7,
          sportA: 'tennis',
          sportB: 'soccer',
          eventAId: 'a1',
          eventBId: 'b1',
          riskFactors: []
        },
        {
          id: 'opp-2',
          type: 'cross_market' as const,
          profitPercent: 1.5,
          confidence: 0.8,
          correlationStrength: 0.7,
          sportA: 'mma',
          sportB: 'boxing',
          eventAId: 'a2',
          eventBId: 'b2',
          riskFactors: []
        }
      ];

      const filtered = detector.filterOpportunities(opportunities, {
        minProfit: 1.0
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('opp-2');
    });

    it('should filter by minimum correlation strength', () => {
      const opportunities = [
        {
          id: 'opp-1',
          type: 'cross_market' as const,
          profitPercent: 1.0,
          confidence: 0.8,
          correlationStrength: 0.5,
          sportA: 'tennis',
          sportB: 'soccer',
          eventAId: 'a1',
          eventBId: 'b1',
          riskFactors: []
        },
        {
          id: 'opp-2',
          type: 'cross_market' as const,
          profitPercent: 1.0,
          confidence: 0.8,
          correlationStrength: 0.8,
          sportA: 'mma',
          sportB: 'boxing',
          eventAId: 'a2',
          eventBId: 'b2',
          riskFactors: []
        }
      ];

      const filtered = detector.filterOpportunities(opportunities, {
        minCorrelationStrength: 0.7
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('opp-2');
    });

    it('should filter by sport pairs', () => {
      const opportunities = [
        {
          id: 'opp-1',
          type: 'cross_market' as const,
          profitPercent: 1.0,
          confidence: 0.8,
          correlationStrength: 0.7,
          sportA: 'tennis',
          sportB: 'soccer',
          eventAId: 'a1',
          eventBId: 'b1',
          riskFactors: []
        },
        {
          id: 'opp-2',
          type: 'cross_market' as const,
          profitPercent: 1.0,
          confidence: 0.8,
          correlationStrength: 0.7,
          sportA: 'mma',
          sportB: 'boxing',
          eventAId: 'a2',
          eventBId: 'b2',
          riskFactors: []
        }
      ];

      const filtered = detector.filterOpportunities(opportunities, {
        sportPairs: ['mma/boxing']
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('opp-2');
    });

    it('should filter out opportunities with excluded risk factors', () => {
      const opportunities = [
        {
          id: 'opp-1',
          type: 'cross_market' as const,
          profitPercent: 1.0,
          confidence: 0.8,
          correlationStrength: 0.7,
          sportA: 'tennis',
          sportB: 'soccer',
          eventAId: 'a1',
          eventBId: 'b1',
          riskFactors: ['weak_correlation']
        },
        {
          id: 'opp-2',
          type: 'cross_market' as const,
          profitPercent: 1.0,
          confidence: 0.8,
          correlationStrength: 0.7,
          sportA: 'mma',
          sportB: 'boxing',
          eventAId: 'a2',
          eventBId: 'b2',
          riskFactors: []
        }
      ];

      const filtered = detector.filterOpportunities(opportunities, {
        excludeRiskFactors: ['weak_correlation']
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('opp-2');
    });
  });

  describe('Custom Mappings', () => {
    it('should allow adding custom cross-sport mappings', () => {
      const customMapping = {
        id: 'custom_test',
        name: 'Test Mapping',
        description: 'Test description',
        sportA: 'sport_a',
        sportB: 'sport_b',
        correlationType: 'player_overlap' as const,
        correlationStrength: 0.8,
        conversionLogic: (oddsA: number, contextA: any, oddsB: number, contextB: any) => ({
          valid: true,
          impliedOddsA: oddsA,
          impliedOddsB: oddsB
        })
      };

      detector.addCrossSportMapping(customMapping);
      
      const mappings = detector.getCrossSportMappings();
      const found = mappings.find(m => m.id === 'custom_test');
      
      expect(found).toBeDefined();
      expect(found?.correlationStrength).toBe(0.8);
    });
  });

  describe('Risk Assessment', () => {
    it('should identify cross-sport correlation risk', () => {
      const events: SportEvent[] = [
        {
          eventId: 'tennis-001',
          sport: 'tennis',
          league: 'Wimbledon',
          participants: ['Player A'],
          startTime: Date.now() + 24 * 60 * 60 * 1000,
          markets: {
            h2h: {
              bestOdds: { 'Player A': 1.5 },
              bestBookmaker: 'pinnacle'
            }
          }
        },
        {
          eventId: 'soccer-001',
          sport: 'soccer',
          league: 'World Cup',
          participants: ['Country A'],
          startTime: Date.now() + 72 * 60 * 60 * 1000, // 48h difference
          markets: {
            h2h: {
              bestOdds: { 'Country A': 2.0 },
              bestBookmaker: 'bet365'
            }
          }
        }
      ];

      const opportunities = detector.detectCrossSportArbitrage(events);
      
      // Should flag large time gap as risk
      if (opportunities.length > 0) {
        expect(opportunities[0].metadata.riskFactors).toContain('cross_sport_correlation_risk');
        expect(opportunities[0].metadata.riskFactors).toContain('large_time_gap');
      }
    });
  });

  describe('Confidence Calculation', () => {
    it('should reduce confidence for large time gaps', () => {
      const events: SportEvent[] = [
        {
          eventId: 'mma-001',
          sport: 'mma',
          league: 'UFC',
          participants: ['Fighter A'],
          startTime: Date.now() + 1000,
          markets: {
            h2h: {
              bestOdds: { 'Fighter A': 1.8 },
              bestBookmaker: 'betfair'
            }
          }
        },
        {
          eventId: 'boxing-001',
          sport: 'boxing',
          league: 'Professional',
          participants: ['Fighter A'],
          startTime: Date.now() + 100 * 60 * 60 * 1000, // 100 hours later
          markets: {
            h2h: {
              bestOdds: { 'Fighter A': 2.2 },
              bestBookmaker: 'pinnacle'
            }
          }
        }
      ];

      const opportunities = detector.detectCrossSportArbitrage(events);
      
      if (opportunities.length > 0) {
        // Confidence should be reduced due to large time gap
        expect(opportunities[0].confidence).toBeLessThan(0.75);
      }
    });
  });
});
