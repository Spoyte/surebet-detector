// Bet Data Source
class BetAPI {
  constructor() {
    this.bets = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    
    const mockBets = [
      {
        id: 'bet-1',
        opportunityId: 'opp-1',
        matchId: 'match-1',
        bookmakerId: '1',
        marketType: 'MATCH_WINNER',
        selection: 'PSG',
        odds: 1.90,
        stake: 526.32,
        currency: 'EUR',
        potentialReturn: 1000.00,
        status: 'PLACED',
        placedAt: now,
        settledAt: null,
        actualReturn: null,
        profitLoss: null,
        screenshotUrl: null,
        notes: 'First leg of arbitrage',
        tags: ['arbitrage', 'ligue1'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'bet-2',
        opportunityId: 'opp-1',
        matchId: 'match-1',
        bookmakerId: '2',
        marketType: 'MATCH_WINNER',
        selection: 'Marseille',
        odds: 4.20,
        stake: 238.10,
        currency: 'EUR',
        potentialReturn: 1000.02,
        status: 'PLACED',
        placedAt: now,
        settledAt: null,
        actualReturn: null,
        profitLoss: null,
        screenshotUrl: null,
        notes: 'Second leg of arbitrage',
        tags: ['arbitrage', 'ligue1'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'bet-3',
        matchId: 'match-2',
        bookmakerId: '1',
        marketType: 'MATCH_WINNER',
        selection: 'Alcaraz',
        odds: 1.45,
        stake: 200,
        currency: 'EUR',
        potentialReturn: 290.00,
        status: 'WON',
        placedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        settledAt: now,
        actualReturn: 290.00,
        profitLoss: 90.00,
        screenshotUrl: '/screenshots/bet-3.png',
        notes: 'Value bet on favorite',
        tags: ['value', 'tennis'],
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        updatedAt: now,
      },
    ];

    mockBets.forEach(bet => this.bets.set(bet.id, bet));
  }

  async getBets({ filter, limit = 50, offset = 0 }) {
    let results = Array.from(this.bets.values());

    if (filter) {
      if (filter.status?.length) {
        results = results.filter(b => filter.status.includes(b.status));
      }

      if (filter.bookmakers?.length) {
        results = results.filter(b => filter.bookmakers.includes(b.bookmakerId));
      }

      if (filter.sports?.length) {
        // Would need to join with matches
      }

      if (filter.dateFrom) {
        const fromDate = new Date(filter.dateFrom);
        results = results.filter(b => b.createdAt >= fromDate);
      }

      if (filter.dateTo) {
        const toDate = new Date(filter.dateTo);
        results = results.filter(b => b.createdAt <= toDate);
      }

      if (filter.tags?.length) {
        results = results.filter(b => 
          filter.tags.some(tag => b.tags.includes(tag))
        );
      }
    }

    // Sort by created date desc
    results.sort((a, b) => b.createdAt - a.createdAt);

    return results.slice(offset, offset + limit);
  }

  async getById(id) {
    return this.bets.get(id) || null;
  }

  async getStats(filter) {
    const bets = await this.getBets({ filter, limit: 10000 });
    
    const won = bets.filter(b => b.status === 'WON').length;
    const lost = bets.filter(b => b.status === 'LOST').length;
    const pending = bets.filter(b => ['PENDING', 'PLACED'].includes(b.status)).length;
    
    const totalStake = bets.reduce((sum, b) => sum + (b.stake || 0), 0);
    const totalReturn = bets.reduce((sum, b) => sum + (b.actualReturn || 0), 0);
    
    return {
      total: bets.length,
      won,
      lost,
      pending,
      totalStake,
      totalReturn,
      profitLoss: totalReturn - totalStake,
    };
  }

  async create(data) {
    const id = `bet-${Date.now()}`;
    const bet = {
      ...data,
      id,
      potentialReturn: data.stake * data.odds,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.bets.set(id, bet);
    return bet;
  }

  async update(id, data) {
    const bet = this.bets.get(id);
    if (!bet) return null;
    
    const updated = {
      ...bet,
      ...data,
      updatedAt: new Date(),
    };
    
    // Auto-calculate profit/loss if settled
    if (data.status === 'WON' || data.status === 'LOST' || data.status === 'SETTLED') {
      if (updated.actualReturn !== undefined) {
        updated.profitLoss = updated.actualReturn - updated.stake;
      }
      if (!updated.settledAt) {
        updated.settledAt = new Date();
      }
    }
    
    this.bets.set(id, updated);
    return updated;
  }

  async delete(id) {
    return this.bets.delete(id);
  }
}

module.exports = BetAPI;
