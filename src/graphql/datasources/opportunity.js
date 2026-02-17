// Opportunity Data Source
class OpportunityAPI {
  constructor() {
    this.opportunities = new Map();
    this.legs = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min
    
    const mockOpportunities = [
      {
        id: 'opp-1',
        matchId: 'match-1',
        type: 'ARBITRAGE',
        marketType: 'MATCH_WINNER',
        profitPercentage: 2.35,
        evPercentage: null,
        totalStake: 1000,
        currency: 'EUR',
        status: 'ACTIVE',
        qualityScore: 85,
        timeToEvent: 3600,
        createdAt: now,
        expiresAt: expiresAt,
        notes: 'Good liquidity on both sides',
      },
      {
        id: 'opp-2',
        matchId: 'match-2',
        type: 'VALUE_BET',
        marketType: 'MATCH_WINNER',
        profitPercentage: null,
        evPercentage: 8.5,
        totalStake: 500,
        currency: 'EUR',
        status: 'ACTIVE',
        qualityScore: 72,
        timeToEvent: 1200,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        notes: 'Sharp line from Pinnacle suggests value',
      },
    ];

    mockOpportunities.forEach(opp => this.opportunities.set(opp.id, opp));

    // Initialize legs
    const mockLegs = [
      { id: 'leg-1', opportunityId: 'opp-1', bookmakerId: '1', selection: 'PSG', odds: 1.90, stake: 526.32, probability: 0.526 },
      { id: 'leg-2', opportunityId: 'opp-1', bookmakerId: '2', selection: 'Marseille', odds: 4.20, stake: 238.10, probability: 0.238 },
      { id: 'leg-3', opportunityId: 'opp-1', bookmakerId: '3', selection: 'Draw', odds: 3.50, stake: 235.58, probability: 0.236 },
      { id: 'leg-4', opportunityId: 'opp-2', bookmakerId: '1', selection: 'Djokovic', odds: 2.80, stake: 500, probability: 0.385 },
    ];

    mockLegs.forEach(leg => this.legs.set(leg.id, leg));
  }

  async getOpportunities({ filter, limit = 50, offset = 0, orderBy = 'profitPercentage', orderDirection = 'desc' }) {
    let results = Array.from(this.opportunities.values());

    if (filter) {
      if (filter.sports?.length) {
        // Filter by sport would require joining with matches
        // Simplified for demo
      }

      if (filter.bookmakers?.length) {
        const oppIds = new Set();
        for (const leg of this.legs.values()) {
          if (filter.bookmakers.includes(leg.bookmakerId)) {
            oppIds.add(leg.opportunityId);
          }
        }
        results = results.filter(o => oppIds.has(o.id));
      }

      if (filter.marketTypes?.length) {
        results = results.filter(o => filter.marketTypes.includes(o.marketType));
      }

      if (filter.minProfit !== undefined) {
        results = results.filter(o => (o.profitPercentage || 0) >= filter.minProfit);
      }

      if (filter.maxProfit !== undefined) {
        results = results.filter(o => (o.profitPercentage || 0) <= filter.maxProfit);
      }

      if (filter.minEv !== undefined) {
        results = results.filter(o => (o.evPercentage || 0) >= filter.minEv);
      }

      if (filter.isLive !== undefined) {
        // Would need to join with matches
      }

      if (filter.status) {
        results = results.filter(o => o.status === filter.status);
      }
    }

    // Sort
    results.sort((a, b) => {
      const aVal = a[orderBy] || 0;
      const bVal = b[orderBy] || 0;
      return orderDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return results.slice(offset, offset + limit);
  }

  async getById(id) {
    return this.opportunities.get(id) || null;
  }

  async getByMatchId(matchId) {
    return Array.from(this.opportunities.values()).filter(o => o.matchId === matchId);
  }

  async getCount(filter) {
    const results = await this.getOpportunities({ filter, limit: 10000 });
    return results.length;
  }

  async getLegs(opportunityId) {
    return Array.from(this.legs.values()).filter(l => l.opportunityId === opportunityId);
  }

  async create(data) {
    const id = `opp-${Date.now()}`;
    const opportunity = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.opportunities.set(id, opportunity);
    return opportunity;
  }

  async update(id, data) {
    const opportunity = this.opportunities.get(id);
    if (!opportunity) return null;
    
    const updated = {
      ...opportunity,
      ...data,
    };
    this.opportunities.set(id, updated);
    return updated;
  }

  async bookmark(id, userId) {
    // Implementation would save to user's bookmarks
    const opportunity = this.opportunities.get(id);
    if (!opportunity) return null;
    
    // Add bookmark logic here
    return opportunity;
  }

  async delete(id) {
    // Also delete associated legs
    for (const [legId, leg] of this.legs) {
      if (leg.opportunityId === id) {
        this.legs.delete(legId);
      }
    }
    return this.opportunities.delete(id);
  }
}

module.exports = OpportunityAPI;
