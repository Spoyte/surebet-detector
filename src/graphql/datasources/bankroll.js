// Bankroll Data Source
class BankrollAPI {
  constructor() {
    this.bankrolls = new Map();
    this.balances = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    
    // Initialize bankroll for user-1
    this.bankrolls.set('user-1', {
      id: 'bankroll-1',
      userId: 'user-1',
      totalBalance: 12500,
      currency: 'EUR',
      dailyProfitLoss: 245,
      weeklyProfitLoss: 890,
      monthlyProfitLoss: 3200,
      allTimeProfitLoss: 8500,
      roi: 12.5,
      exposureLimit: 5000,
      currentExposure: 1500,
      updatedAt: now,
    });

    // Initialize bookmaker balances
    const mockBalances = [
      { id: 'bal-1', userId: 'user-1', bookmakerId: '1', balance: 3500, available: 3000, exposure: 500, lastUpdated: now },
      { id: 'bal-2', userId: 'user-1', bookmakerId: '2', balance: 2800, available: 2500, exposure: 300, lastUpdated: now },
      { id: 'bal-3', userId: 'user-1', bookmakerId: '3', balance: 4200, available: 3800, exposure: 400, lastUpdated: now },
      { id: 'bal-4', userId: 'user-1', bookmakerId: '6', balance: 2000, available: 1700, exposure: 300, lastUpdated: now },
    ];

    mockBalances.forEach(bal => this.balances.set(bal.id, bal));
  }

  async getBankroll(userId) {
    const bankroll = this.bankrolls.get(userId);
    if (!bankroll) {
      // Create default bankroll
      return this.createDefaultBankroll(userId);
    }
    return { ...bankroll, userId };
  }

  async createDefaultBankroll(userId) {
    const bankroll = {
      id: `bankroll-${userId}`,
      userId,
      totalBalance: 0,
      currency: 'EUR',
      dailyProfitLoss: 0,
      weeklyProfitLoss: 0,
      monthlyProfitLoss: 0,
      allTimeProfitLoss: 0,
      roi: 0,
      exposureLimit: 1000,
      currentExposure: 0,
      updatedAt: new Date(),
    };
    this.bankrolls.set(userId, bankroll);
    return bankroll;
  }

  async getBookmakerBalances(userId) {
    return Array.from(this.balances.values()).filter(b => b.userId === userId);
  }

  async updateBalance(userId, bookmakerId, balance) {
    const existing = Array.from(this.balances.values()).find(
      b => b.userId === userId && b.bookmakerId === bookmakerId
    );

    if (existing) {
      existing.balance = balance;
      existing.available = balance - existing.exposure;
      existing.lastUpdated = new Date();
      return existing;
    }

    // Create new balance entry
    const newBalance = {
      id: `bal-${Date.now()}`,
      userId,
      bookmakerId,
      balance,
      available: balance,
      exposure: 0,
      lastUpdated: new Date(),
    };
    this.balances.set(newBalance.id, newBalance);
    
    // Update total bankroll
    await this.recalculateTotal(userId);
    
    return newBalance;
  }

  async transfer(userId, fromBookmakerId, toBookmakerId, amount) {
    const fromBalance = Array.from(this.balances.values()).find(
      b => b.userId === userId && b.bookmakerId === fromBookmakerId
    );
    
    const toBalance = Array.from(this.balances.values()).find(
      b => b.userId === userId && b.bookmakerId === toBookmakerId
    );

    if (!fromBalance || !toBalance) {
      throw new Error('Bookmaker balance not found');
    }

    if (fromBalance.available < amount) {
      throw new Error('Insufficient available balance');
    }

    fromBalance.balance -= amount;
    fromBalance.available -= amount;
    fromBalance.lastUpdated = new Date();

    toBalance.balance += amount;
    toBalance.available += amount;
    toBalance.lastUpdated = new Date();

    await this.recalculateTotal(userId);

    return [fromBalance, toBalance];
  }

  async recalculateTotal(userId) {
    const balances = await this.getBookmakerBalances(userId);
    const total = balances.reduce((sum, b) => sum + b.balance, 0);
    const exposure = balances.reduce((sum, b) => sum + b.exposure, 0);

    const bankroll = this.bankrolls.get(userId);
    if (bankroll) {
      bankroll.totalBalance = total;
      bankroll.currentExposure = exposure;
      bankroll.updatedAt = new Date();
    }
  }

  async updateExposure(userId, bookmakerId, exposure) {
    const balance = Array.from(this.balances.values()).find(
      b => b.userId === userId && b.bookmakerId === bookmakerId
    );

    if (balance) {
      balance.exposure = exposure;
      balance.available = balance.balance - exposure;
      balance.lastUpdated = new Date();
      await this.recalculateTotal(userId);
      return balance;
    }

    return null;
  }
}

module.exports = BankrollAPI;
