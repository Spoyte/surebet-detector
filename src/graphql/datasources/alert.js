// Alert Data Source
class AlertAPI {
  constructor() {
    this.alerts = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    
    const mockAlerts = [
      {
        id: 'alert-1',
        userId: 'user-1',
        type: 'OPPORTUNITY',
        priority: 'HIGH',
        message: 'New arbitrage opportunity: PSG vs Marseille (2.35% profit)',
        data: { opportunityId: 'opp-1', profitPercentage: 2.35 },
        isRead: false,
        createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      },
      {
        id: 'alert-2',
        userId: 'user-1',
        type: 'BET_SETTLED',
        priority: 'MEDIUM',
        message: 'Your bet on Alcaraz has won! Profit: €90.00',
        data: { betId: 'bet-3', profit: 90 },
        isRead: true,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        id: 'alert-3',
        userId: 'user-1',
        type: 'BANKROLL',
        priority: 'LOW',
        message: 'Daily profit target reached: €245',
        data: { dailyProfit: 245 },
        isRead: false,
        createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      },
    ];

    mockAlerts.forEach(alert => this.alerts.set(alert.id, alert));
  }

  async getAlerts(userId, { isRead, limit = 50 }) {
    let results = Array.from(this.alerts.values()).filter(a => a.userId === userId);

    if (isRead !== undefined) {
      results = results.filter(a => a.isRead === isRead);
    }

    // Sort by created date desc
    results.sort((a, b) => b.createdAt - a.createdAt);

    return results.slice(0, limit);
  }

  async getUnreadCount(userId) {
    return Array.from(this.alerts.values()).filter(
      a => a.userId === userId && !a.isRead
    ).length;
  }

  async create(data) {
    const id = `alert-${Date.now()}`;
    const alert = {
      ...data,
      id,
      isRead: false,
      createdAt: new Date(),
    };
    this.alerts.set(id, alert);
    return alert;
  }

  async update(id, data) {
    const alert = this.alerts.get(id);
    if (!alert) return null;
    
    const updated = {
      ...alert,
      ...data,
    };
    this.alerts.set(id, updated);
    return updated;
  }

  async markAllRead(userId) {
    for (const alert of this.alerts.values()) {
      if (alert.userId === userId) {
        alert.isRead = true;
      }
    }
    return true;
  }

  async delete(id) {
    return this.alerts.delete(id);
  }
}

module.exports = AlertAPI;
