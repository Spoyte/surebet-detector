/**
 * Microservices Architecture for Surebet Detector
 * 
 * Service definitions and communication patterns for a scalable
 * microservices-based deployment.
 */

export interface ServiceDefinition {
  name: string;
  description: string;
  port: number;
  replicas: {
    min: number;
    max: number;
  };
  resources: {
    cpu: string;
    memory: string;
  };
  dependencies: string[];
  endpoints: ServiceEndpoint[];
}

export interface ServiceEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WS';
  description: string;
  auth: boolean;
}

export interface MessageQueue {
  name: string;
  type: 'pubsub' | 'queue' | 'stream';
  description: string;
  retention: string;
}

// Service Definitions
export const SERVICES: ServiceDefinition[] = [
  {
    name: 'odds-collector',
    description: 'Collects odds from bookmakers via WebSocket and REST APIs',
    port: 3001,
    replicas: { min: 3, max: 10 },
    resources: { cpu: '500m', memory: '512Mi' },
    dependencies: ['redis', 'kafka'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/metrics', method: 'GET', description: 'Prometheus metrics', auth: false },
      { path: '/collect', method: 'POST', description: 'Trigger manual collection', auth: true },
      { path: '/bookmakers', method: 'GET', description: 'List configured bookmakers', auth: true }
    ]
  },
  {
    name: 'arbitrage-detector',
    description: 'Detects arbitrage opportunities from aggregated odds',
    port: 3002,
    replicas: { min: 2, max: 6 },
    resources: { cpu: '1000m', memory: '1Gi' },
    dependencies: ['redis', 'kafka', 'odds-collector'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/metrics', method: 'GET', description: 'Prometheus metrics', auth: false },
      { path: '/opportunities', method: 'GET', description: 'List opportunities', auth: true },
      { path: '/detect', method: 'POST', description: 'Trigger detection', auth: true }
    ]
  },
  {
    name: 'api-gateway',
    description: 'API gateway and request routing',
    port: 3000,
    replicas: { min: 2, max: 5 },
    resources: { cpu: '250m', memory: '256Mi' },
    dependencies: ['redis'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/api/v1/*', method: 'GET', description: 'API routes', auth: true },
      { path: '/ws', method: 'WS', description: 'WebSocket connections', auth: true }
    ]
  },
  {
    name: 'notification-service',
    description: 'Sends alerts via Telegram, Slack, Email, etc.',
    port: 3003,
    replicas: { min: 2, max: 4 },
    resources: { cpu: '100m', memory: '128Mi' },
    dependencies: ['redis', 'kafka'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/send', method: 'POST', description: 'Send notification', auth: true },
      { path: '/templates', method: 'GET', description: 'List templates', auth: true }
    ]
  },
  {
    name: 'user-service',
    description: 'User management, authentication, and preferences',
    port: 3004,
    replicas: { min: 2, max: 4 },
    resources: { cpu: '250m', memory: '256Mi' },
    dependencies: ['postgres', 'redis'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/auth/login', method: 'POST', description: 'User login', auth: false },
      { path: '/auth/register', method: 'POST', description: 'User registration', auth: false },
      { path: '/users/me', method: 'GET', description: 'Get current user', auth: true },
      { path: '/users/preferences', method: 'PUT', description: 'Update preferences', auth: true }
    ]
  },
  {
    name: 'analytics-service',
    description: 'Historical data analysis and reporting',
    port: 3005,
    replicas: { min: 1, max: 3 },
    resources: { cpu: '500m', memory: '1Gi' },
    dependencies: ['postgres', 'clickhouse', 'redis'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/reports', method: 'GET', description: 'Generate reports', auth: true },
      { path: '/stats', method: 'GET', description: 'Get statistics', auth: true }
    ]
  },
  {
    name: 'bet-tracker',
    description: 'Tracks placed bets and settlement',
    port: 3006,
    replicas: { min: 2, max: 4 },
    resources: { cpu: '250m', memory: '256Mi' },
    dependencies: ['postgres', 'redis'],
    endpoints: [
      { path: '/health', method: 'GET', description: 'Health check', auth: false },
      { path: '/bets', method: 'GET', description: 'List bets', auth: true },
      { path: '/bets', method: 'POST', description: 'Record bet', auth: true },
      { path: '/bets/:id/settle', method: 'PUT', description: 'Settle bet', auth: true }
    ]
  }
];

// Message Queue Definitions
export const MESSAGE_QUEUES: MessageQueue[] = [
  {
    name: 'odds.updates',
    type: 'stream',
    description: 'Raw odds updates from bookmakers',
    retention: '24h'
  },
  {
    name: 'odds.aggregated',
    type: 'stream',
    description: 'Aggregated odds per event',
    retention: '1h'
  },
  {
    name: 'arbitrage.detected',
    type: 'pubsub',
    description: 'New arbitrage opportunities',
    retention: '1h'
  },
  {
    name: 'notifications.send',
    type: 'queue',
    description: 'Notification requests',
    retention: '24h'
  },
  {
    name: 'bets.placed',
    type: 'pubsub',
    description: 'Bet placement events',
    retention: '7d'
  },
  {
    name: 'bets.settled',
    type: 'pubsub',
    description: 'Bet settlement events',
    retention: '7d'
  }
];

// Service Mesh Configuration
export const SERVICE_MESH = {
  // Istio/Linkerd configuration
  mtls: {
    enabled: true,
    mode: 'STRICT' // STRICT or PERMISSIVE
  },
  trafficManagement: {
    circuitBreaker: {
      consecutiveErrors: 5,
      interval: '30s',
      baseEjectionTime: '30s'
    },
    retry: {
      attempts: 3,
      perTryTimeout: '2s',
      retryOn: '5xx,connect-failure,refused-stream'
    },
    timeout: {
      default: '10s',
      oddsCollector: '30s'
    }
  },
  rateLimiting: {
    enabled: true,
    requestsPerSecond: 100,
    burstSize: 150
  }
};

// Data Storage Configuration
export const DATA_STORAGE = {
  redis: {
    mode: 'cluster', // standalone, sentinel, cluster
    nodes: 6,
    replicas: 1,
    persistence: 'RDB' // RDB, AOF, or both
  },
  postgres: {
    version: '15',
    replicas: 3, // 1 primary + 2 replicas
    resources: { cpu: '1000m', memory: '2Gi' }
  },
  clickhouse: {
    shards: 2,
    replicas: 2,
    resources: { cpu: '2000m', memory: '4Gi' }
  },
  kafka: {
    brokers: 3,
    replicationFactor: 3,
    partitions: 12
  }
};

export default {
  SERVICES,
  MESSAGE_QUEUES,
  SERVICE_MESH,
  DATA_STORAGE
};
