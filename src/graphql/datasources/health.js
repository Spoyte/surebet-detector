// Health Data Source
class HealthAPI {
  constructor() {
    this.services = new Map();
    this.initializeMockData();
  }

  initializeMockData() {
    const now = new Date();
    
    const mockServices = [
      { service: 'odds-aggregator', status: 'healthy', latency: 45, lastCheck: now, errorRate: 0.01 },
      { service: 'arbitrage-detector', status: 'healthy', latency: 120, lastCheck: now, errorRate: 0 },
      { service: 'websocket-server', status: 'healthy', latency: 15, lastCheck: now, errorRate: 0 },
      { service: 'notification-service', status: 'healthy', latency: 80, lastCheck: now, errorRate: 0.02 },
      { service: 'database', status: 'healthy', latency: 25, lastCheck: now, errorRate: 0 },
      { service: 'redis-cache', status: 'healthy', latency: 5, lastCheck: now, errorRate: 0 },
    ];

    mockServices.forEach(s => this.services.set(s.service, s));
  }

  async getStatus() {
    // Update latencies with some randomness
    const now = new Date();
    
    for (const service of this.services.values()) {
      service.latency = Math.round(service.latency * (0.8 + Math.random() * 0.4));
      service.lastCheck = now;
    }

    return Array.from(this.services.values());
  }

  async getServiceStatus(serviceName) {
    return this.services.get(serviceName) || null;
  }

  async updateStatus(serviceName, status, latency, errorRate) {
    const service = {
      service: serviceName,
      status,
      latency,
      lastCheck: new Date(),
      errorRate,
    };
    
    this.services.set(serviceName, service);
    return service;
  }
}

module.exports = HealthAPI;
