// Odds Data Source
class OddsAPI {
  constructor() {
    this.odds = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    
    const mockOdds = [
      // PSG vs Marseille - Match Winner
      { id: 'odd-1', matchId: 'match-1', bookmakerId: '1', marketType: 'MATCH_WINNER', selection: 'PSG', odds: 1.85, impliedProbability: 0.54, volume: 15000, lastUpdated: now, isLive: false },
      { id: 'odd-2', matchId: 'match-1', bookmakerId: '1', marketType: 'MATCH_WINNER', selection: 'Draw', odds: 3.40, impliedProbability: 0.29, volume: 8000, lastUpdated: now, isLive: false },
      { id: 'odd-3', matchId: 'match-1', bookmakerId: '1', marketType: 'MATCH_WINNER', selection: 'Marseille', odds: 4.20, impliedProbability: 0.24, volume: 5000, lastUpdated: now, isLive: false },
      { id: 'odd-4', matchId: 'match-1', bookmakerId: '2', marketType: 'MATCH_WINNER', selection: 'PSG', odds: 1.90, impliedProbability: 0.53, volume: 12000, lastUpdated: now, isLive: false },
      { id: 'odd-5', matchId: 'match-1', bookmakerId: '2', marketType: 'MATCH_WINNER', selection: 'Draw', odds: 3.30, impliedProbability: 0.30, volume: 7000, lastUpdated: now, isLive: false },
      { id: 'odd-6', matchId: 'match-1', bookmakerId: '2', marketType: 'MATCH_WINNER', selection: 'Marseille', odds: 4.00, impliedProbability: 0.25, volume: 4000, lastUpdated: now, isLive: false },
      { id: 'odd-7', matchId: 'match-1', bookmakerId: '3', marketType: 'MATCH_WINNER', selection: 'PSG', odds: 1.88, impliedProbability: 0.53, volume: 18000, lastUpdated: now, isLive: false },
      { id: 'odd-8', matchId: 'match-1', bookmakerId: '3', marketType: 'MATCH_WINNER', selection: 'Draw', odds: 3.35, impliedProbability: 0.30, volume: 9000, lastUpdated: now, isLive: false },
      { id: 'odd-9', matchId: 'match-1', bookmakerId: '3', marketType: 'MATCH_WINNER', selection: 'Marseille', odds: 4.10, impliedProbability: 0.24, volume: 6000, lastUpdated: now, isLive: false },
      
      // Tennis - Live match
      { id: 'odd-10', matchId: 'match-2', bookmakerId: '1', marketType: 'MATCH_WINNER', selection: 'Alcaraz', odds: 1.45, impliedProbability: 0.69, volume: 25000, lastUpdated: now, isLive: true },
      { id: 'odd-11', matchId: 'match-2', bookmakerId: '1', marketType: 'MATCH_WINNER', selection: 'Djokovic', odds: 2.80, impliedProbability: 0.36, volume: 20000, lastUpdated: now, isLive: true },
      { id: 'odd-12', matchId: 'match-2', bookmakerId: '6', marketType: 'MATCH_WINNER', selection: 'Alcaraz', odds: 1.50, impliedProbability: 0.67, volume: 30000, lastUpdated: now, isLive: true },
      { id: 'odd-13', matchId: 'match-2', bookmakerId: '6', marketType: 'MATCH_WINNER', selection: 'Djokovic', odds: 2.65, impliedProbability: 0.38, volume: 25000, lastUpdated: now, isLive: true },
    ];

    mockOdds.forEach(odd => this.odds.set(odd.id, odd));
  }

  async getByMatchId(matchId) {
    return Array.from(this.odds.values()).filter(o => o.matchId === matchId);
  }

  async getByBookmakerId(bookmakerId) {
    return Array.from(this.odds.values()).filter(o => o.bookmakerId === bookmakerId);
  }

  async getById(id) {
    return this.odds.get(id) || null;
  }

  async create(data) {
    const id = `odd-${Date.now()}`;
    const odd = {
      ...data,
      id,
      lastUpdated: new Date(),
    };
    this.odds.set(id, odd);
    return odd;
  }

  async update(id, data) {
    const odd = this.odds.get(id);
    if (!odd) return null;
    
    const updated = {
      ...odd,
      ...data,
      lastUpdated: new Date(),
    };
    this.odds.set(id, updated);
    return updated;
  }

  async delete(id) {
    return this.odds.delete(id);
  }

  async getBestOdds(matchId, marketType, selection) {
    const odds = Array.from(this.odds.values()).filter(
      o => o.matchId === matchId && o.marketType === marketType && o.selection === selection
    );
    
    if (odds.length === 0) return null;
    
    return odds.reduce((best, current) => 
      current.odds > best.odds ? current : best
    );
  }
}

module.exports = OddsAPI;
