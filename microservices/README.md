# Surebet Detector - Microservices Architecture

This directory contains the microservices architecture for the Surebet Detector application. The monolithic application has been refactored into independently deployable services.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Odds Collector  │────▶│   Redis Cache   │
│    (Port 3000)  │     │    (Port 3001)   │     │   (Port 6379)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         │              │   RabbitMQ MQ    │
         │              │   (Port 5672)    │
         │              └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Other Services │◀────│ Arbitrage Detector│
│                 │     │    (Port 3002)   │
└─────────────────┘     └──────────────────┘
```

## Services

### 1. Odds Collector (`odds-collector/`)
- **Purpose**: Collects odds data from bookmaker APIs
- **Port**: 3001
- **Responsibilities**:
  - Connect to REST and WebSocket APIs
  - Normalize odds data from different formats
  - Cache odds in Redis
  - Publish updates to message queue

### 2. Arbitrage Detector (`arbitrage-detector/`)
- **Purpose**: Detects arbitrage opportunities from odds data
- **Port**: 3002
- **Responsibilities**:
  - Consume odds updates from queue
  - Compare odds across bookmakers
  - Calculate arbitrage opportunities
  - Publish opportunities to notification service

### 3. API Gateway (`api-gateway/`)
- **Purpose**: Entry point for all client requests
- **Port**: 3000
- **Responsibilities**:
  - Authentication and authorization
  - Rate limiting
  - Request routing
  - Response aggregation
  - SSL termination

## Infrastructure Components

- **Redis**: Caching and session storage
- **RabbitMQ**: Message queue for inter-service communication
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization

## Quick Start

### Local Development with Docker Compose

```bash
# Build and start all services
docker-compose -f docker-compose.microservices.yml up --build

# Or use the npm script
npm run docker:up
```

Services will be available at:
- API Gateway: http://localhost:3000
- RabbitMQ Management: http://localhost:15672 (surebet/surebet123)
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3003 (admin/admin)

### Kubernetes Deployment

```bash
# Apply all manifests
kubectl apply -f k8s/microservices.yaml

# Or use the npm script
npm run k8s:apply
```

## Development

### Running Individual Services

```bash
# Install dependencies
npm install

# Run odds collector
npm run dev:odds

# Run arbitrage detector
npm run dev:arbitrage

# Run API gateway
npm run dev:gateway
```

### Environment Variables

Create a `.env` file in the project root:

```env
# API Keys for bookmakers
API_KEY_PINNACLE=your_key_here
API_KEY_BETFAIR=your_key_here
API_KEY_UNIBET=your_key_here
API_KEY_BETCLIC=your_key_here
API_KEY_WINAMAX=your_key_here
API_KEY_CLOUDBET=your_key_here
API_KEY_SMARKETS=your_key_here

# JWT Secret
JWT_SECRET=your-secret-key
```

## API Endpoints

### API Gateway (Port 3000)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check for all services |
| `GET /metrics` | Prometheus metrics |
| `GET /api/dashboard` | Aggregated dashboard data |
| `GET /api/opportunities` | Active arbitrage opportunities |
| `GET /api/odds/bookmakers` | List connected bookmakers |

### Odds Collector (Port 3001)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health |
| `GET /ready` | Readiness probe |
| `GET /metrics` | Prometheus metrics |
| `GET /api/bookmakers` | List bookmakers |
| `GET /api/stats` | Collection statistics |

### Arbitrage Detector (Port 3002)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health |
| `GET /ready` | Readiness probe |
| `GET /metrics` | Prometheus metrics |
| `GET /api/opportunities` | Active opportunities |

## Message Queue Topics

| Topic | Description |
|-------|-------------|
| `odds.updates` | Raw odds updates from collectors |
| `arbitrage.opportunities` | Detected arbitrage opportunities |
| `notifications.alerts` | User notifications |

## Scaling

Each service can be scaled independently based on load:

```bash
# Scale odds collectors
kubectl scale deployment odds-collector --replicas=5 -n surebet-microservices

# Scale arbitrage detectors
kubectl scale deployment arbitrage-detector --replicas=5 -n surebet-microservices
```

## Monitoring

All services expose Prometheus metrics at `/metrics`. Key metrics include:

- `odds_collector_odds_received_total` - Total odds updates received
- `arbitrage_opportunities_detected_total` - Opportunities detected
- `gateway_http_requests_total` - HTTP request count
- `gateway_http_duration_seconds` - HTTP request latency

## Migration from Monolith

The microservices architecture replaces the monolithic `src/index.ts` with:

1. **Odds Collection** → `odds-collector/`
2. **Arbitrage Detection** → `arbitrage-detector/`
3. **API Layer** → `api-gateway/`

The original monolithic code remains in `src/` for reference during migration.