# Bookmaker Reviews Service

A microservice for managing bookmaker reviews, ratings, and aggregated statistics.

## Features

- **Bookmaker Profiles**: Store detailed information about each bookmaker
- **User Reviews**: Submit and manage reviews with category ratings
- **Aggregated Ratings**: Pre-computed statistics for fast queries
- **Withdrawal Tracking**: Track actual withdrawal experiences
- **Comparison Tools**: Compare bookmakers side-by-side
- **Moderation**: Review approval workflow

## API Endpoints

### Bookmakers (`/api/bookmakers`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all bookmakers with ratings |
| GET | `/:id` | Get detailed bookmaker info |
| GET | `/:id/compare` | Compare with other bookmakers |
| POST | `/` | Add new bookmaker (admin) |

### Reviews (`/api/reviews`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get reviews with filters |
| GET | `/:id` | Get single review |
| POST | `/` | Submit a review |
| PUT | `/:id` | Update a review |
| DELETE | `/:id` | Delete a review |
| POST | `/:id/helpful` | Mark as helpful |
| POST | `/:id/report` | Report a review |
| PUT | `/:id/approve` | Approve review (admin) |

### Ratings (`/api/ratings`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/summary` | Overall rating summary |
| GET | `/bookmaker/:id` | Detailed bookmaker ratings |
| GET | `/category/:category` | Top by category |
| GET | `/withdrawal-speed` | Ranked by withdrawal speed |

### Stats (`/api/stats`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/overview` | System statistics |
| GET | `/trends` | Review trends over time |
| GET | `/bookmaker/:id` | Bookmaker-specific stats |

## Data Models

### Review Categories

Each review includes ratings (1-5) for:
- **oddsQuality**: Quality of odds offered
- **withdrawalSpeed**: Speed of withdrawals
- **customerService**: Quality of support
- **websiteUsability**: Ease of use
- **bonusOffers**: Quality of promotions
- **mobileExperience**: Mobile app/site quality

### Withdrawal Experience

Users can optionally include:
- Amount and currency
- Withdrawal method
- Request and receive dates
- Status (pending/completed/rejected)

## Environment Variables

```env
PORT=3010
MONGODB_URI=mongodb://localhost:27017/surebet-reviews
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

## Running Locally

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build and start
npm run build
npm start
```

## Docker

```bash
docker build -t surebet/bookmaker-reviews .
docker run -p 3010:3010 -e MONGODB_URI=mongodb://host.docker.internal:27017/surebet-reviews surebet/bookmaker-reviews
```

## Integration with API Composition

The bookmaker reviews service integrates with the API composition layer to provide enriched data:

```typescript
// Example composition response
{
  bookmaker: {
    name: "Bet365",
    rating: { average: 4.5, count: 128 },
    categoryRatings: {
      oddsQuality: { average: 4.7, count: 120 },
      withdrawalSpeed: { average: 4.2, count: 98 }
    },
    withdrawalStats: {
      averageTime: 24.5, // hours
      successRate: 98.5
    }
  }
}
```
