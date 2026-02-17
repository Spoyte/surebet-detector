# API Composition Layer

The API Composition Layer aggregates data from multiple microservices to provide unified, client-optimized API endpoints. This reduces the number of requests clients need to make and provides more convenient data structures for UI consumption.

## Architecture

```
┌─────────────────┐
│   API Gateway   │
└────────┬────────┘
         │
┌────────▼────────┐
│  API Composition│
│     Layer       │
└────────┬────────┘
         │
    ┌────┴────┬────────┬──────────┬─────────────┐
    │         │        │          │             │
┌───▼───┐ ┌───▼───┐ ┌──▼───┐ ┌───▼────┐ ┌──────▼──────┐
│ Odds  │ │Arb    │ │User  │ │Notif.  │ │ Analytics   │
│Coll.  │ │Detect.│ │Mgmt  │ │Service │ │  Service    │
└───────┘ └───────┘ └──────┘ └────────┘ └─────────────┘
```

## Features

- **Data Aggregation**: Combines data from multiple services in a single request
- **Caching**: In-memory caching with configurable TTL per endpoint
- **Circuit Breaker**: Prevents cascading failures when services are down
- **Retry Logic**: Automatic retry with exponential backoff
- **Batch Requests**: Efficient parallel fetching from multiple services
- **Partial Data**: Returns available data even if some services fail

## Endpoints

### Composition Routes (`/api/composite`)

| Endpoint | Description | Cache TTL |
|----------|-------------|-----------|
| `GET /opportunities-with-odds` | Opportunities enriched with full odds data | 15s |
| `GET /user-dashboard` | Complete dashboard data for a user | - |
| `GET /opportunity-details/:id` | Full opportunity details with history | 60s |
| `POST /place-bet-composite` | Place bet across multiple services | - |
| `GET /market-overview` | Market-wide statistics and trends | 60s |

### Dashboard Routes (`/api/dashboard`)

| Endpoint | Description | Cache TTL |
|----------|-------------|-----------|
| `GET /summary` | Quick dashboard summary | 30s |
| `GET /live-feed` | Real-time activity feed | 10s |
| `GET /performance` | Performance charts data | 300s |
| `GET /alerts` | Consolidated alerts | - |

### Opportunities Routes (`/api/opportunities`)

| Endpoint | Description | Cache TTL |
|----------|-------------|-----------|
| `GET /enhanced` | Opportunities with computed fields | 20s |
| `GET /:id/full` | Complete opportunity details | 60s |
| `POST /compare` | Compare multiple opportunities | - |

### Analytics Routes (`/api/analytics`)

| Endpoint | Description | Cache TTL |
|----------|-------------|-----------|
| `GET /comprehensive` | Full analytics report | 300s |
| `GET /real-time` | Real-time metrics | 10s |
| `GET /predictions` | Predictive analytics | 600s |
| `GET /bookmaker-comparison` | Bookmaker comparison | 600s |

### User Routes (`/api/user`)

| Endpoint | Description |
|----------|-------------|
| `GET /profile-complete` | Complete user profile |
| `GET /betting-summary` | Betting activity summary |
| `GET /notifications-preferences` | Notifications and preferences |
| `POST /update-profile-composite` | Update profile across services |

## Environment Variables

```env
PORT=3006
LOG_LEVEL=info
CACHE_TTL=30

# Service URLs
ODDS_COLLECTOR_URL=http://localhost:3001
ARBITRAGE_DETECTOR_URL=http://localhost:3002
USER_MANAGEMENT_URL=http://localhost:3003
NOTIFICATION_SERVICE_URL=http://localhost:3004
ANALYTICS_SERVICE_URL=http://localhost:3005
API_GATEWAY_URL=http://localhost:3000

CORS_ORIGIN=http://localhost:3000,https://app.surebet.com
```

## Running Locally

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Docker

```bash
# Build image
docker build -t surebet/api-composition .

# Run container
docker run -p 3006:3006 \
  -e ODDS_COLLECTOR_URL=http://odds-collector:3001 \
  -e ARBITRAGE_DETECTOR_URL=http://arbitrage-detector:3002 \
  surebet/api-composition
```

## Metrics

Prometheus metrics available at `/metrics`:

- `api_composition_http_requests_total` - HTTP request counter
- `api_composition_http_request_duration_seconds` - Request duration histogram
- `api_composition_cache_hits_total` - Cache hit counter
- `api_composition_service_calls_total` - Service call counter
- `api_composition_service_call_duration_seconds` - Service call duration

## Admin Endpoints

- `GET /admin/cache-stats` - View cache statistics
- `POST /admin/clear-cache` - Clear all cached data

## Circuit Breaker

The service implements circuit breaker pattern for each downstream service:

- **Threshold**: 5 failures
- **Timeout**: 30 seconds
- **Recovery**: Half-open after timeout, closes on success

## Development

### Adding a New Composite Endpoint

1. Define the route in the appropriate router file
2. Use `serviceClient.batch()` for parallel requests
3. Apply `cacheMiddleware()` for cacheable endpoints
4. Handle partial failures gracefully
5. Add computed/enriched fields as needed

Example:
```typescript
router.get('/my-composite', cacheMiddleware('my-key', 30), async (req, res) => {
  const results = await serviceClient.batch([
    { service: 'service1', endpoint: '/data1' },
    { service: 'service2', endpoint: '/data2' }
  ]);
  
  res.json({
    data1: results[0].success ? results[0].data : null,
    data2: results[1].success ? results[1].data : null,
    partialData: results.some(r => !r.success)
  });
});
```
