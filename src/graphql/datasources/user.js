// User Data Source
class UserAPI {
  constructor() {
    this.users = new Map();
    this.preferences = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    
    const mockUser = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Demo User',
      createdAt: now,
      updatedAt: now,
    };

    this.users.set('user-1', mockUser);

    const mockPreferences = {
      userId: 'user-1',
      minProfitPercentage: 1.5,
      minEvPercentage: 5.0,
      maxStake: 1000,
      defaultCurrency: 'EUR',
      alertChannels: ['TELEGRAM', 'EMAIL'],
      quietHoursStart: 23,
      quietHoursEnd: 8,
      excludedBookmakers: [],
      favoriteSports: ['SOCCER', 'TENNIS'],
    };

    this.preferences.set('user-1', mockPreferences);
  }

  async getById(id) {
    const user = this.users.get(id);
    if (!user) return null;
    
    const preferences = this.preferences.get(id);
    return {
      ...user,
      preferences: preferences || this.createDefaultPreferences(id),
    };
  }

  async getByEmail(email) {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return this.getById(user.id);
      }
    }
    return null;
  }

  async create(data) {
    const id = `user-${Date.now()}`;
    const now = new Date();
    
    const user = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    
    this.users.set(id, user);
    this.preferences.set(id, this.createDefaultPreferences(id));
    
    return this.getById(id);
  }

  async update(id, data) {
    const user = this.users.get(id);
    if (!user) return null;
    
    const updated = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    
    this.users.set(id, updated);
    return this.getById(id);
  }

  async updatePreferences(userId, data) {
    const existing = this.preferences.get(userId);
    
    const updated = {
      ...existing,
      ...data,
      userId,
    };
    
    this.preferences.set(userId, updated);
    return updated;
  }

  createDefaultPreferences(userId) {
    return {
      userId,
      minProfitPercentage: 1.0,
      minEvPercentage: 0,
      maxStake: 100,
      defaultCurrency: 'EUR',
      alertChannels: ['TELEGRAM'],
      quietHoursStart: null,
      quietHoursEnd: null,
      excludedBookmakers: [],
      favoriteSports: [],
    };
  }

  async delete(id) {
    this.preferences.delete(id);
    return this.users.delete(id);
  }
}

module.exports = UserAPI;
