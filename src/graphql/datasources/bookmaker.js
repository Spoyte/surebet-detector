// Bookmaker Data Source
class BookmakerAPI {
  constructor() {
    // In-memory store - replace with database
    this.bookmakers = new Map([
      ['1', { id: '1', name: 'Unibet', code: 'unibet', country: 'FR', website: 'https://unibet.fr', isActive: true, reliabilityScore: 4.5, withdrawalSpeed: 2, customerServiceRating: 4.2, oddsQualityScore: 4.0, createdAt: new Date(), updatedAt: new Date() }],
      ['2', { id: '2', name: 'Betclic', code: 'betclic', country: 'FR', website: 'https://betclic.fr', isActive: true, reliabilityScore: 4.3, withdrawalSpeed: 3, customerServiceRating: 4.0, oddsQualityScore: 3.8, createdAt: new Date(), updatedAt: new Date() }],
      ['3', { id: '3', name: 'Winamax', code: 'winamax', country: 'FR', website: 'https://winamax.fr', isActive: true, reliabilityScore: 4.7, withdrawalSpeed: 1, customerServiceRating: 4.5, oddsQualityScore: 4.2, createdAt: new Date(), updatedAt: new Date() }],
      ['4', { id: '4', name: 'FDJ', code: 'fdj', country: 'FR', website: 'https://parionssport.fdj.fr', isActive: true, reliabilityScore: 4.8, withdrawalSpeed: 2, customerServiceRating: 4.3, oddsQualityScore: 3.5, createdAt: new Date(), updatedAt: new Date() }],
      ['5', { id: '5', name: 'ZEbet', code: 'zebet', country: 'FR', website: 'https://zebet.fr', isActive: true, reliabilityScore: 4.0, withdrawalSpeed: 3, customerServiceRating: 3.8, oddsQualityScore: 3.9, createdAt: new Date(), updatedAt: new Date() }],
      ['6', { id: '6', name: 'Pinnacle', code: 'pinnacle', country: 'MT', website: 'https://pinnacle.com', isActive: true, reliabilityScore: 4.9, withdrawalSpeed: 1, customerServiceRating: 4.0, oddsQualityScore: 4.8, createdAt: new Date(), updatedAt: new Date() }],
      ['7', { id: '7', name: 'Betfair', code: 'betfair', country: 'MT', website: 'https://betfair.com', isActive: true, reliabilityScore: 4.6, withdrawalSpeed: 2, customerServiceRating: 4.1, oddsQualityScore: 4.5, createdAt: new Date(), updatedAt: new Date() }],
    ]);
  }

  async getAll() {
    return Array.from(this.bookmakers.values());
  }

  async getById(id) {
    return this.bookmakers.get(id) || null;
  }

  async getByCode(code) {
    for (const bookmaker of this.bookmakers.values()) {
      if (bookmaker.code === code) {
        return bookmaker;
      }
    }
    return null;
  }

  async create(data) {
    const id = String(this.bookmakers.size + 1);
    const bookmaker = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.bookmakers.set(id, bookmaker);
    return bookmaker;
  }

  async update(id, data) {
    const bookmaker = this.bookmakers.get(id);
    if (!bookmaker) return null;
    
    const updated = {
      ...bookmaker,
      ...data,
      updatedAt: new Date(),
    };
    this.bookmakers.set(id, updated);
    return updated;
  }

  async delete(id) {
    return this.bookmakers.delete(id);
  }
}

module.exports = BookmakerAPI;
