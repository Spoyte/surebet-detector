# Mobile API Server

Express.js middleware module that exposes mobile-optimized API endpoints for the React Native app.

## Endpoints

### Authentication
- `POST /api/mobile/auth/login` - Login with email/password
- `POST /api/mobile/auth/verify` - Verify JWT token
- `POST /api/mobile/auth/refresh` - Refresh access token
- `POST /api/mobile/auth/logout` - Logout and invalidate token
- `POST /api/mobile/auth/biometric` - Enable/disable biometric auth

### Opportunities
- `GET /api/mobile/opportunities` - List arbitrage opportunities (paginated)
- `GET /api/mobile/opportunities/:id` - Get opportunity details
- `POST /api/mobile/opportunities/:id/bookmark` - Bookmark opportunity
- `DELETE /api/mobile/opportunities/:id/bookmark` - Remove bookmark

### Bets
- `GET /api/mobile/bets` - List user's bets
- `POST /api/mobile/bets` - Place a new bet
- `GET /api/mobile/bets/:id` - Get bet details
- `PATCH /api/mobile/bets/:id` - Update bet status

### Dashboard
- `GET /api/mobile/dashboard/summary` - Get dashboard summary stats
- `GET /api/mobile/dashboard/chart-data` - Get chart data for analytics
- `GET /api/mobile/dashboard/recent-activity` - Get recent activity feed

### Notifications
- `POST /api/mobile/notifications/register` - Register push notification token
- `DELETE /api/mobile/notifications/unregister` - Unregister push token
- `GET /api/mobile/notifications/preferences` - Get notification preferences
- `PATCH /api/mobile/notifications/preferences` - Update preferences

### Profile
- `GET /api/mobile/profile` - Get user profile
- `PATCH /api/mobile/profile` - Update profile
- `GET /api/mobile/profile/accounts` - Get linked bookmaker accounts
- `POST /api/mobile/profile/accounts` - Link new bookmaker account

## Features

- **Optimized Payloads**: Mobile-friendly JSON responses with only necessary fields
- **Pagination**: All list endpoints support cursor-based pagination
- **Compression**: Gzip compression for all responses
- **Caching**: Redis-based response caching for frequently accessed data
- **Offline Sync**: Queue actions when offline, sync when back online
- **Rate Limiting**: Mobile-specific rate limits (more lenient for authenticated users)

## Usage

```javascript
const mobileApi = require('./mobile-api-server');

// Add to Express app
app.use('/api/mobile', mobileApi);
```
