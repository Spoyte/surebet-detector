// Match Data Source
class MatchAPI {
  constructor() {
    this.matches = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const mockMatches = [
      {
        id: 'match-1',
        externalId: 'ext-1',
        sport: 'SOCCER',
        league: 'Ligue 1',
        homeTeam: 'PSG',
        awayTeam: 'Marseille',
        startTime: tomorrow,
        status: 'SCHEDULED',
        isLive: false,
        score: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'match-2',
        externalId: 'ext-2',
        sport: 'TENNIS',
        league: 'ATP Paris',
        homeTeam: 'Alcaraz',
        awayTeam: 'Djokovic',
        startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        status: 'LIVE',
        isLive: true,
        score: { home: 1, away: 0, sets: [[6, 4], [3, 2]] },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'match-3',
        externalId: 'ext-3',
        sport: 'BASKETBALL',
        league: 'NBA',
        homeTeam: 'Lakers',
        awayTeam: 'Warriors',
        startTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        status: 'SCHEDULED',
        isLive: false,
        score: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'match-4',
        externalId: 'ext-4',
        sport: 'ESPORTS',
        league: 'CS2 Major',
        homeTeam: 'NAVI',
        awayTeam: 'FaZe',
        startTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
        status: 'SCHEDULED',
        isLive: false,
        score: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    mockMatches.forEach(match => this.matches.set(match.id, match));
  }

  async getMatches({ sport, league, isLive, from, to, limit = 50, offset = 0 }) {
    let results = Array.from(this.matches.values());

    if (sport) {
      results = results.filter(m => m.sport === sport);
    }

    if (league) {
      results = results.filter(m => m.league.toLowerCase().includes(league.toLowerCase()));
    }

    if (isLive !== undefined) {
      results = results.filter(m => m.isLive === isLive);
    }

    if (from) {
      const fromDate = new Date(from);
      results = results.filter(m => m.startTime >= fromDate);
    }

    if (to) {
      const toDate = new Date(to);
      results = results.filter(m => m.startTime <= toDate);
    }

    // Sort by start time
    results.sort((a, b) => a.startTime - b.startTime);

    return results.slice(offset, offset + limit);
  }

  async getById(id) {
    return this.matches.get(id) || null;
  }

  async create(data) {
    const id = `match-${Date.now()}`;
    const match = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.matches.set(id, match);
    return match;
  }

  async update(id, data) {
    const match = this.matches.get(id);
    if (!match) return null;
    
    const updated = {
      ...match,
      ...data,
      updatedAt: new Date(),
    };
    this.matches.set(id, updated);
    return updated;
  }

  async delete(id) {
    return this.matches.delete(id);
  }
}

module.exports = MatchAPI;
