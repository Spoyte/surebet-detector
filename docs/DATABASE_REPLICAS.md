# Database Read Replicas Configuration

This document describes the database read replica setup for the Surebet Detector system.

## Overview

The system uses PostgreSQL with primary-replica architecture to:
- Distribute read load across multiple servers
- Improve query response times for analytics
- Provide high availability
- Enable horizontal scaling

## Architecture

```
                    ┌─────────────────┐
                    │   Application   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌─────────┐    ┌─────────┐    ┌─────────┐
        │ Primary │───▶│ Replica │    │ Replica │
        │  (Write)│    │  (Read) │    │  (Read) │
        └─────────┘    └─────────┘    └─────────┘
              │              │              │
              └──────────────┴──────────────┘
                             │
                    ┌────────▼────────┐
                    │   Streaming     │
                    │  Replication    │
                    └─────────────────┘
```

## Configuration

### Environment Variables

```bash
# Primary Database (Write)
DB_HOST=primary.db.example.com
DB_PORT=5432
DB_NAME=surebet
DB_USER=surebet_app
DB_PASSWORD=secure-password

# Read Replicas (comma-separated)
DB_REPLICA_HOSTS=replica1.db.example.com,replica2.db.example.com
DB_REPLICA_PORTS=5432,5432

# Health Check Settings
DB_HEALTH_CHECK_INTERVAL=30000  # 30 seconds
DB_MAX_REPLICA_LAG=30           # Maximum acceptable lag in seconds
```

### Connection Pooling

| Database | Min | Max | Notes |
|----------|-----|-----|-------|
| Primary | 5 | 20 | Write operations only |
| Replicas | 10 | 30 | Read operations, higher for analytics |

## Query Routing

### Automatic Routing

The `DatabaseManager` class automatically routes queries:

```javascript
const { getDatabaseManager } = require('./config/database');
const db = getDatabaseManager();

// Write operation - goes to primary
await db.getPrimary().query('INSERT INTO odds ...');

// Read operation - goes to replica (round-robin)
const results = await db.query('SELECT * FROM odds ...', { useReplica: true });

// Force primary for critical reads
const results = await db.query('SELECT * FROM odds ...', { forcePrimary: true });
```

### Read Replica Selection

1. **Round-robin**: Distributes load evenly across healthy replicas
2. **Health-aware**: Skips unhealthy or lagging replicas
3. **Fallback**: Falls back to primary if no replicas are healthy

## Health Monitoring

### Replica Health Checks

Every 30 seconds, the system checks:
1. **Connectivity**: Can we connect to the replica?
2. **Replication Lag**: How far behind is the replica?

### Lag Thresholds

| Status | Lag | Action |
|--------|-----|--------|
| Healthy | < 5s | Use for reads |
| Warning | 5-30s | Use for reads, log warning |
| Critical | > 30s | Mark unhealthy, route to other replicas |

### Stats Endpoint

```http
GET /health/db-stats

{
  "primary": {
    "host": "primary.db.example.com",
    "status": "connected"
  },
  "replicas": [
    {
      "host": "replica1.db.example.com",
      "healthy": true,
      "queryCount": 15420,
      "lastUsed": "2024-02-18T04:15:30Z"
    },
    {
      "host": "replica2.db.example.com",
      "healthy": true,
      "queryCount": 14890,
      "lastUsed": "2024-02-18T04:15:31Z"
    }
  ]
}
```

## Setting Up Replicas

### 1. Configure Primary

```sql
-- On primary
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET hot_standby = on;

-- Create replication user
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'secure-repl-password';

-- Update pg_hba.conf
host replication replicator replica1_ip/32 scram-sha-256
host replication replicator replica2_ip/32 scram-sha-256
```

### 2. Initialize Replica

```bash
# On replica server
pg_basebackup -h primary.db.example.com -D /var/lib/postgresql/data -U replicator -v -P -W

# Create standby.signal
touch /var/lib/postgresql/data/standby.signal

# Configure primary_conninfo
echo "primary_conninfo = 'host=primary.db.example.com port=5432 user=replicator password=secure-repl-password'" >> /var/lib/postgresql/data/postgresql.conf
```

### 3. Start Replica

```bash
sudo systemctl start postgresql
```

## Monitoring Queries

### Check Replication Status

```sql
-- On primary
SELECT 
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn
FROM pg_stat_replication;

-- On replica
SELECT 
  now() - pg_last_xact_replay_timestamp() AS lag,
  pg_is_in_recovery() AS is_replica;
```

### Check Query Distribution

```sql
-- View application_name to see which queries go where
SELECT 
  application_name,
  COUNT(*) as query_count
FROM pg_stat_activity
GROUP BY application_name;
```

## Failover

### Automatic Failover (with Patroni)

For production, consider using Patroni for automatic failover:

```yaml
# patroni.yml
scope: surebet
namespace: /surebet/
name: primary

restapi:
  listen: 0.0.0.0:8008
  connect_address: primary.db.example.com:8008

etcd:
  hosts: etcd1.example.com:2379,etcd2.example.com:2379,etcd3.example.com:2379

postgresql:
  listen: 0.0.0.0:5432
  connect_address: primary.db.example.com:5432
  data_dir: /var/lib/postgresql/data
  pgpass: /tmp/pgpass
  authentication:
    replication:
      username: replicator
      password: secure-repl-password
    superuser:
      username: postgres
      password: secure-password
```

## Performance Benefits

### Before Replicas
- Single database handling all reads and writes
- Analytics queries slow down real-time operations
- Limited by single server capacity

### After Replicas
- Writes: ~1000 TPS on primary
- Reads: ~3000 TPS distributed across replicas
- Analytics queries don't impact real-time performance
- Can add more replicas as needed

## Troubleshooting

### High Replication Lag

```bash
# Check what's causing lag
SELECT 
  pid,
  now() - query_start AS duration,
  query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;
```

### Connection Issues

```bash
# Check connection counts
SELECT 
  datname,
  COUNT(*) as connections
FROM pg_stat_activity
GROUP BY datname;

# Check max connections
SHOW max_connections;
```

### Replica Not Catching Up

```sql
-- Check replication slot status
SELECT 
  slot_name,
  active,
  restart_lsn,
  confirmed_flush_lsn
FROM pg_replication_slots;
```
