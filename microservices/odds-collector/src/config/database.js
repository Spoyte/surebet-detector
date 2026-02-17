const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

class DatabaseManager {
  constructor() {
    this.primary = null;
    this.replicas = [];
    this.currentReplicaIndex = 0;
  }

  async initialize() {
    // Primary (write) database
    this.primary = new Sequelize({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'surebet',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 20,
        min: 5,
        acquire: 30000,
        idle: 10000
      }
    });

    // Read replicas configuration
    const replicaHosts = process.env.DB_REPLICA_HOSTS?.split(',') || [];
    const replicaPorts = process.env.DB_REPLICA_PORTS?.split(',').map(Number) || [];

    for (let i = 0; i < replicaHosts.length; i++) {
      const replica = new Sequelize({
        host: replicaHosts[i],
        port: replicaPorts[i] || 5432,
        database: process.env.DB_NAME || 'surebet',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        dialect: 'postgres',
        logging: false, // Replicas don't log
        pool: {
          max: 30,
          min: 10,
          acquire: 30000,
          idle: 10000
        },
        dialectOptions: {
          // Mark as read-only connection
          application_name: 'surebet-read-replica'
        }
      });

      this.replicas.push({
        sequelize: replica,
        host: replicaHosts[i],
        healthy: true,
        queryCount: 0,
        lastUsed: null
      });
    }

    // Test connections
    await this.primary.authenticate();
    logger.info('Primary database connected');

    for (const replica of this.replicas) {
      try {
        await replica.sequelize.authenticate();
        replica.healthy = true;
        logger.info(`Read replica connected: ${replica.host}`);
      } catch (error) {
        replica.healthy = false;
        logger.error(`Read replica failed: ${replica.host}`, { error: error.message });
      }
    }

    // Start health check interval
    this.startHealthChecks();

    return this;
  }

  // Get primary for writes
  getPrimary() {
    return this.primary;
  }

  // Get a replica for reads (round-robin with health check)
  getReplica() {
    const healthyReplicas = this.replicas.filter(r => r.healthy);
    
    if (healthyReplicas.length === 0) {
      logger.warn('No healthy replicas available, falling back to primary');
      return this.primary;
    }

    // Round-robin selection
    const replica = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex++;
    
    replica.queryCount++;
    replica.lastUsed = new Date();

    return replica.sequelize;
  }

  // Get specific replica by index
  getReplicaByIndex(index) {
    if (index >= 0 && index < this.replicas.length && this.replicas[index].healthy) {
      return this.replicas[index].sequelize;
    }
    return this.getReplica();
  }

  // Get all healthy replicas
  getHealthyReplicas() {
    return this.replicas
      .filter(r => r.healthy)
      .map(r => r.sequelize);
  }

  // Get replica stats
  getStats() {
    return {
      primary: {
        host: process.env.DB_HOST,
        status: 'connected'
      },
      replicas: this.replicas.map(r => ({
        host: r.host,
        healthy: r.healthy,
        queryCount: r.queryCount,
        lastUsed: r.lastUsed
      }))
    };
  }

  // Health check for replicas
  async checkReplicaHealth(replica) {
    try {
      await replica.sequelize.authenticate();
      
      // Check replication lag
      const [results] = await replica.sequelize.query(`
        SELECT 
          CASE 
            WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() 
            THEN 0 
            ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
          END AS lag_seconds
      `);
      
      const lagSeconds = parseFloat(results[0]?.lag_seconds || 0);
      
      // Mark unhealthy if lag > 30 seconds
      if (lagSeconds > 30) {
        logger.warn(`Replica ${replica.host} has high lag: ${lagSeconds}s`);
        replica.healthy = false;
      } else {
        replica.healthy = true;
      }
      
      return { healthy: replica.healthy, lagSeconds };
    } catch (error) {
      replica.healthy = false;
      logger.error(`Health check failed for ${replica.host}`, { error: error.message });
      return { healthy: false, error: error.message };
    }
  }

  // Start periodic health checks
  startHealthChecks() {
    const interval = parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 30000; // 30 seconds
    
    setInterval(async () => {
      for (const replica of this.replicas) {
        await this.checkReplicaHealth(replica);
      }
    }, interval);

    logger.info(`Health checks started (interval: ${interval}ms)`);
  }

  // Execute query with automatic routing
  async query(sql, options = {}) {
    const { useReplica = true, forcePrimary = false } = options;
    
    if (forcePrimary || !useReplica) {
      return this.primary.query(sql, options);
    }
    
    const db = this.getReplica();
    return db.query(sql, options);
  }

  // Close all connections
  async close() {
    await this.primary.close();
    for (const replica of this.replicas) {
      await replica.sequelize.close();
    }
    logger.info('All database connections closed');
  }
}

// Singleton instance
let instance = null;

async function initializeDatabaseManager() {
  if (!instance) {
    instance = new DatabaseManager();
    await instance.initialize();
  }
  return instance;
}

function getDatabaseManager() {
  if (!instance) {
    throw new Error('DatabaseManager not initialized. Call initializeDatabaseManager() first.');
  }
  return instance;
}

module.exports = { 
  DatabaseManager, 
  initializeDatabaseManager, 
  getDatabaseManager 
};
