/**
 * Cross-Sport Arbitrage Detection
 * 
 * Detects arbitrage opportunities between related markets across different sports.
 * Examples:
 * - Tennis player vs their national team soccer match
 * - NBA player points vs their college basketball legacy
 * - Fighter MMA odds vs their boxing odds
 * - Player performance across different leagues/tournaments
 */

import { ArbitrageDetector, ArbitrageOpportunity, ArbitrageLeg } from './arbitrage-detector.js';

export interface CrossSportMapping {
  id: string;
  name: string;
  description: string;
  sportA: string;
  sportB: string;
  correlationType: 'player_overlap' | 'team_overlap' | 'event_correlation' | 'temporal_correlation';
  correlationStrength: number; // 0-1, how strongly the outcomes are related
  conversionLogic: (oddsA: number, contextA: any, oddsB: number, contextB: any) => { valid: boolean; impliedOddsA: number; impliedOddsB: number; notes?: string } | null;
}

export interface CrossSportOpportunity extends ArbitrageOpportunity {
  crossSportMappingId: string;
  correlationStrength: number;
  sportA: string;
  sportB: string;
  eventAId: string;
  eventBId: string;
  riskFactors: string[];
}

export interface SportEvent {
  eventId: string;
  sport: string;
  league: string;
  participants: string[]; // players or teams
  startTime: number;
  markets: Record<string, any>;
  metadata?: {
    playerIds?: string[];
    teamIds?: string[];
    tournamentId?: string;
    round?: string;
  };
}

export class CrossSportArbitrageDetector {
  private readonly MIN_PROFIT_PERCENT = 0.3; // Lower threshold due to higher risk
  private readonly MAX_PROFIT_PERCENT = 15;
  private readonly MIN_CORRELATION_STRENGTH = 0.6;
  private crossSportMappings: Map<string, CrossSportMapping[]> = new Map();
  private playerDatabase: Map<string, { sports: string[]; teams: string[]; country?: string }> = new Map();

  constructor() {
    this.initializeCrossSportMappings();
    this.initializePlayerDatabase();
  }

  /**
   * Initialize cross-sport arbitrage mappings
   */
  private initializeCrossSportMappings(): void {
    // Tennis Player vs National Team Soccer
    this.crossSportMappings.set('tennis_soccer', [
      {
        id: 'tennis_player_national_team',
        name: 'Tennis Player vs National Team Performance',
        description: 'Arbitrage between tennis player match odds and their national team soccer match',
        sportA: 'tennis',
        sportB: 'soccer',
        correlationType: 'player_overlap',
        correlationStrength: 0.65,
        conversionLogic: (oddsA, contextA, oddsB, contextB) => {
          // If tennis player is favorite and their national team is also favorite,
          // there might be correlation-based value
          const tennisWinProb = 1 / oddsA;
          const soccerWinProb = 1 / oddsB;
          
          // Weak positive correlation - both succeeding on same day
          const combinedProb = tennisWinProb * 0.6 + soccerWinProb * 0.4;
          
          return {
            valid: true,
            impliedOddsA: 1 / tennisWinProb,
            impliedOddsB: 1 / (combinedProb - tennisWinProb * 0.3),
            notes: 'National sentiment correlation factor applied'
          };
        }
      }
    ]);

    // MMA vs Boxing (fighter crossover)
    this.crossSportMappings.set('mma_boxing', [
      {
        id: 'fighter_crossover',
        name: 'MMA Fighter vs Boxing Odds',
        description: 'Compare odds for fighters who compete in both MMA and boxing',
        sportA: 'mma',
        sportB: 'boxing',
        correlationType: 'player_overlap',
        correlationStrength: 0.75,
        conversionLogic: (oddsA, contextA, oddsB, contextB) => {
          // High correlation - same fighter, different sport
          // Boxing odds typically more favorable for strikers
          const mmaOdds = oddsA;
          const boxingOdds = oddsB;
          
          // If fighter is striker, boxing odds should be better
          const isStriker = contextA.fighterStyle === 'striker';
          const adjustmentFactor = isStriker ? 0.85 : 1.15;
          
          return {
            valid: true,
            impliedOddsA: mmaOdds,
            impliedOddsB: boxingOdds * adjustmentFactor,
            notes: `Fighter style adjustment: ${isStriker ? 'striker' : 'grappler'}`
          };
        }
      }
    ]);

    // NBA vs College Basketball (player legacy)
    this.crossSportMappings.set('basketball_ncaa_nba', [
      {
        id: 'player_legacy_performance',
        name: 'NBA vs NCAA Player Performance',
        description: 'Arbitrage between NBA player props and their alma mater games',
        sportA: 'basketball_nba',
        sportB: 'basketball_ncaa',
        correlationType: 'temporal_correlation',
        correlationStrength: 0.55,
        conversionLogic: (oddsA, contextA, oddsB, contextB) => {
          // Same day performance correlation
          const nbaProb = 1 / oddsA;
          const ncaaProb = 1 / oddsB;
          
          // Weak correlation through alumni sentiment
          return {
            valid: true,
            impliedOddsA: oddsA,
            impliedOddsB: oddsB * 0.95, // Slight adjustment for sentiment
            notes: 'Alumni sentiment correlation'
          };
        }
      }
    ]);

    // Golf vs Tennis (individual sports correlation)
    this.crossSportMappings.set('golf_tennis', [
      {
        id: 'individual_sport_mentality',
        name: 'Individual Sport Performance Correlation',
        description: 'Correlation between golf and tennis performance for same-country athletes',
        sportA: 'golf',
        sportB: 'tennis',
        correlationType: 'event_correlation',
        correlationStrength: 0.5,
        conversionLogic: (oddsA, contextA, oddsB, contextB) => {
          // Same country, major tournament weekend
          const sameCountry = contextA.country === contextB.country;
          const bothMajors = contextA.isMajor && contextB.isMajor;
          
          if (!sameCountry || !bothMajors) return null;
          
          return {
            valid: true,
            impliedOddsA: oddsA,
            impliedOddsB: oddsB,
            notes: 'Major tournament weekend correlation'
          };
        }
      }
    ]);

    // Esports vs Traditional Sports (team organizations)
    this.crossSportMappings.set('esports_traditional', [
      {
        id: 'org_cross_performance',
        name: 'Esports Org vs Traditional Sports',
        description: 'Sports organizations with both esports and traditional teams',
        sportA: 'esports',
        sportB: 'soccer',
        correlationType: 'team_overlap',
        correlationStrength: 0.45,
        conversionLogic: (oddsA, contextA, oddsB, contextB) => {
          // Same organization, different sports (e.g., PSG esports and soccer)
          const sameOrg = contextA.organization === contextB.organization;
          if (!sameOrg) return null;
          
          return {
            valid: true,
            impliedOddsA: oddsA,
            impliedOddsB: oddsB * 0.98, // Minimal correlation
            notes: 'Organization performance correlation'
          };
        }
      }
    ]);

    // Tennis Doubles vs Singles (same player)
    this.crossSportMappings.set('tennis_singles_doubles', [
      {
        id: 'singles_doubles_correlation',
        name: 'Tennis Singles vs Doubles',
        description: 'Same player performance in singles vs doubles matches',
        sportA: 'tennis_singles',
        sportB: 'tennis_doubles',
        correlationType: 'player_overlap',
        correlationStrength: 0.8,
        conversionLogic: (oddsA, contextA, oddsB, contextB) => {
          // High correlation - same player, same tournament
          const sameTournament = contextA.tournament === contextB.tournament;
          const sameDay = Math.abs(contextA.startTime - contextB.startTime) < 24 * 60 * 60 * 1000;
          
          if (!sameTournament) return null;
          
          // Singles performance often predicts doubles
          const singlesProb = 1 / oddsA;
          const adjustment = sameDay ? 0.9 : 1.0; // Fatigue factor if same day
          
          return {
            valid: true,
            impliedOddsA: oddsA,
            impliedOddsB: 1 / (singlesProb * 0.85 * adjustment),
            notes: sameDay ? 'Same-day fatigue factor applied' : 'Tournament form correlation'
          };
        }
      }
    ]);
  }

  /**
   * Initialize player database with cross-sport athletes
   */
  private initializePlayerDatabase(): void {
    // Example cross-sport athletes
    const crossSportAthletes = [
      { id: 'conor_mcgregor', sports: ['mma', 'boxing'], name: 'Conor McGregor' },
      { id: 'jake_paul', sports: ['boxing', 'mma'], name: 'Jake Paul' },
      { id: 'logan_paul', sports: ['boxing', 'wrestling'], name: 'Logan Paul' },
      { id: 'gareth_bale', sports: ['soccer', 'golf'], name: 'Gareth Bale' },
      { id: 'michael_jordan', sports: ['basketball', 'baseball'], name: 'Michael Jordan' },
      { id: 'bo_jackson', sports: ['football', 'baseball'], name: 'Bo Jackson' },
      { id: 'deion_sanders', sports: ['football', 'baseball'], name: 'Deion Sanders' },
      { id: 'naomi_osaka', sports: ['tennis'], country: 'JP', name: 'Naomi Osaka' },
      { id: 'rafael_nadal', sports: ['tennis', 'golf'], country: 'ES', name: 'Rafael Nadal' },
    ];

    for (const athlete of crossSportAthletes) {
      this.playerDatabase.set(athlete.id, {
        sports: athlete.sports,
        teams: [],
        country: athlete.country
      });
    }
  }

  /**
   * Detect cross-sport arbitrage opportunities
   */
  public detectCrossSportArbitrage(events: SportEvent[]): CrossSportOpportunity[] {
    const opportunities: CrossSportOpportunity[] = [];

    // Group events by sport
    const eventsBySport = this.groupEventsBySport(events);

    // Check each cross-sport mapping
    for (const [mappingKey, mappings] of this.crossSportMappings.entries()) {
      const [sportA, sportB] = mappingKey.split('_');
      const eventsA = eventsBySport.get(sportA) || [];
      const eventsB = eventsBySport.get(sportB) || [];

      if (eventsA.length === 0 || eventsB.length === 0) continue;

      for (const mapping of mappings) {
        if (mapping.correlationStrength < this.MIN_CORRELATION_STRENGTH) continue;

        const mappingOpportunities = this.findMappingOpportunities(
          eventsA,
          eventsB,
          mapping
        );
        opportunities.push(...mappingOpportunities);
      }
    }

    // Sort by profit potential
    return opportunities
      .filter(opp => opp.profitPercent >= this.MIN_PROFIT_PERCENT)
      .sort((a, b) => b.profitPercent - a.profitPercent);
  }

  /**
   * Group events by sport
   */
  private groupEventsBySport(events: SportEvent[]): Map<string, SportEvent[]> {
    const grouped = new Map<string, SportEvent[]>();
    
    for (const event of events) {
      const existing = grouped.get(event.sport) || [];
      existing.push(event);
      grouped.set(event.sport, existing);
    }
    
    return grouped;
  }

  /**
   * Find opportunities for a specific cross-sport mapping
   */
  private findMappingOpportunities(
    eventsA: SportEvent[],
    eventsB: SportEvent[],
    mapping: CrossSportMapping
  ): CrossSportOpportunity[] {
    const opportunities: CrossSportOpportunity[] = [];

    for (const eventA of eventsA) {
      for (const eventB of eventsB) {
        // Check if events share participants
        const sharedParticipants = this.findSharedParticipants(eventA, eventB);
        
        if (sharedParticipants.length === 0) continue;

        // Check for arbitrage between related markets
        const marketOpportunities = this.checkMarketArbitrage(
          eventA,
          eventB,
          mapping,
          sharedParticipants
        );
        
        opportunities.push(...marketOpportunities);
      }
    }

    return opportunities;
  }

  /**
   * Find shared participants between two events
   */
  private findSharedParticipants(eventA: SportEvent, eventB: SportEvent): string[] {
    const shared: string[] = [];
    
    for (const participantA of eventA.participants) {
      const normalizedA = this.normalizeParticipantName(participantA);
      
      for (const participantB of eventB.participants) {
        const normalizedB = this.normalizeParticipantName(participantB);
        
        if (normalizedA === normalizedB || this.areNamesSimilar(normalizedA, normalizedB)) {
          shared.push(participantA);
        }
      }
    }
    
    return shared;
  }

  /**
   * Normalize participant name for comparison
   */
  private normalizeParticipantName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/(fc|sc|united|city|club)$/i, '');
  }

  /**
   * Check if two names are similar (fuzzy matching)
   */
  private areNamesSimilar(nameA: string, nameB: string): boolean {
    // Simple Levenshtein distance or substring matching
    if (nameA.includes(nameB) || nameB.includes(nameA)) return true;
    
    // Check player database for aliases
    for (const [id, data] of this.playerDatabase.entries()) {
      // This is simplified - real implementation would use proper name matching
    }
    
    return false;
  }

  /**
   * Check for arbitrage between markets of two events
   */
  private checkMarketArbitrage(
    eventA: SportEvent,
    eventB: SportEvent,
    mapping: CrossSportMapping,
    sharedParticipants: string[]
  ): CrossSportOpportunity[] {
    const opportunities: CrossSportOpportunity[] = [];

    // Get moneyline/match winner markets
    const marketA = eventA.markets['h2h'] || eventA.markets['match_winner'];
    const marketB = eventB.markets['h2h'] || eventB.markets['match_winner'];

    if (!marketA || !marketB) return opportunities;

    for (const participant of sharedParticipants) {
      const oddsA = this.getBestOdds(marketA, participant);
      const oddsB = this.getBestOdds(marketB, participant);

      if (!oddsA || !oddsB) continue;

      const conversion = mapping.conversionLogic(
        oddsA,
        { event: eventA, participant },
        oddsB,
        { event: eventB, participant }
      );

      if (!conversion || !conversion.valid) continue;

      const impliedProbA = 1 / conversion.impliedOddsA;
      const impliedProbB = 1 / conversion.impliedOddsB;
      const totalProb = impliedProbA + impliedProbB;

      if (totalProb < 1) {
        const profitPercent = (1 - totalProb) * 100;
        
        if (profitPercent >= this.MIN_PROFIT_PERCENT && profitPercent <= this.MAX_PROFIT_PERCENT) {
          const legs: ArbitrageLeg[] = [
            {
              bookmaker: marketA.bestBookmaker || 'bookmaker_a',
              market: 'h2h',
              selection: participant,
              odds: oddsA,
              stake: (100 * impliedProbA) / totalProb,
              impliedProbability: impliedProbA,
              contribution: (impliedProbA / totalProb) * 100
            },
            {
              bookmaker: marketB.bestBookmaker || 'bookmaker_b',
              market: 'h2h',
              selection: participant,
              odds: oddsB,
              stake: (100 * impliedProbB) / totalProb,
              impliedProbability: impliedProbB,
              contribution: (impliedProbB / totalProb) * 100
            }
          ];

          opportunities.push({
            id: `cross-sport-${eventA.eventId}-${eventB.eventId}-${Date.now()}`,
            type: 'cross_market',
            sport: `${eventA.sport}/${eventB.sport}`,
            league: `${eventA.league}/${eventB.league}`,
            eventId: `${eventA.eventId}/${eventB.eventId}`,
            homeTeam: participant,
            awayTeam: 'Cross-Sport Arbitrage',
            startTime: Math.min(eventA.startTime, eventB.startTime),
            profitPercent,
            confidence: this.calculateCrossSportConfidence(eventA, eventB, mapping),
            legs,
            totalStake: 100,
            expectedProfit: 100 * (profitPercent / 100),
            timestamp: Date.now(),
            expiresAt: Math.min(eventA.startTime, eventB.startTime),
            metadata: {
              marketTypes: ['h2h'],
              bookmakerCount: 2,
              detectionMethod: 'cross_sport_arbitrage',
              riskFactors: this.identifyCrossSportRiskFactors(eventA, eventB, mapping)
            },
            crossSportMappingId: mapping.id,
            correlationStrength: mapping.correlationStrength,
            sportA: eventA.sport,
            sportB: eventB.sport,
            eventAId: eventA.eventId,
            eventBId: eventB.eventId,
            riskFactors: []
          });
        }
      }
    }

    return opportunities;
  }

  /**
   * Get best odds for a participant from a market
   */
  private getBestOdds(market: any, participant: string): number | null {
    // Simplified - real implementation would parse market structure
    if (market.bestOdds && market.bestOdds[participant]) {
      return market.bestOdds[participant];
    }
    return null;
  }

  /**
   * Calculate confidence for cross-sport opportunity
   */
  private calculateCrossSportConfidence(
    eventA: SportEvent,
    eventB: SportEvent,
    mapping: CrossSportMapping
  ): number {
    let confidence = mapping.correlationStrength;

    // Reduce confidence based on time difference
    const timeDiff = Math.abs(eventA.startTime - eventB.startTime);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff > 48) {
      confidence *= 0.7;
    } else if (hoursDiff > 24) {
      confidence *= 0.85;
    }

    // Reduce confidence for lower correlation types
    if (mapping.correlationType === 'temporal_correlation') {
      confidence *= 0.8;
    } else if (mapping.correlationType === 'event_correlation') {
      confidence *= 0.75;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Identify risk factors for cross-sport arbitrage
   */
  private identifyCrossSportRiskFactors(
    eventA: SportEvent,
    eventB: SportEvent,
    mapping: CrossSportMapping
  ): string[] {
    const risks: string[] = ['cross_sport_correlation_risk'];

    const timeDiff = Math.abs(eventA.startTime - eventB.startTime);
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      risks.push('large_time_gap');
    }

    if (mapping.correlationStrength < 0.7) {
      risks.push('weak_correlation');
    }

    if (mapping.correlationType === 'temporal_correlation') {
      risks.push('temporal_only_correlation');
    }

    // Check if events are in different time zones
    risks.push('execution_complexity');

    return risks;
  }

  /**
   * Add custom cross-sport mapping
   */
  public addCrossSportMapping(mapping: CrossSportMapping): void {
    const key = `${mapping.sportA}_${mapping.sportB}`;
    const existing = this.crossSportMappings.get(key) || [];
    existing.push(mapping);
    this.crossSportMappings.set(key, existing);
  }

  /**
   * Get all available cross-sport mappings
   */
  public getCrossSportMappings(): CrossSportMapping[] {
    const all: CrossSportMapping[] = [];
    for (const mappings of this.crossSportMappings.values()) {
      all.push(...mappings);
    }
    return all;
  }

  /**
   * Filter opportunities based on user preferences
   */
  public filterOpportunities(
    opportunities: CrossSportOpportunity[],
    filters: {
      minProfit?: number;
      maxProfit?: number;
      minConfidence?: number;
      minCorrelationStrength?: number;
      sportPairs?: string[];
      excludeRiskFactors?: string[];
    }
  ): CrossSportOpportunity[] {
    return opportunities.filter(opp => {
      if (filters.minProfit && opp.profitPercent < filters.minProfit) return false;
      if (filters.maxProfit && opp.profitPercent > filters.maxProfit) return false;
      if (filters.minConfidence && opp.confidence < filters.minConfidence) return false;
      if (filters.minCorrelationStrength && opp.correlationStrength < filters.minCorrelationStrength) return false;
      if (filters.sportPairs) {
        const pair = `${opp.sportA}/${opp.sportB}`;
        if (!filters.sportPairs.includes(pair)) return false;
      }
      if (filters.excludeRiskFactors) {
        const hasExcludedRisk = opp.metadata.riskFactors.some(r => 
          filters.excludeRiskFactors!.includes(r)
        );
        if (hasExcludedRisk) return false;
      }
      return true;
    });
  }
}

export default CrossSportArbitrageDetector;
