# User Management Service

Microservice for handling user authentication, authorization, and profile management in the Surebet Detector system.

## Features

- **User Registration & Login**: Secure email/password authentication
- **JWT Authentication**: Stateless token-based auth with refresh
- **Two-Factor Authentication**: TOTP-based 2FA with backup codes
- **Role-Based Access Control**: User, Premium, and Admin roles
- **Account Security**: Login attempt limiting, account locking
- **Profile Management**: Update profile, change password
- **Admin Functions**: User management, role assignment

## Environment Variables

```bash
# Server
PORT=3002
NODE_ENV=production
LOG_LEVEL=info

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=surebet_users
DB_USER=postgres
DB_PASSWORD=your-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://app.surebet-detector.com
```

## API Endpoints

### Authentication

#### Register
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",
  "twoFactorCode": "123456"  // Optional, required if 2FA enabled
}
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Authorization: Bearer {token}
```

### Two-Factor Authentication

#### Setup 2FA
```http
POST /api/v1/auth/2fa/setup
Authorization: Bearer {token}
```

#### Verify and Enable 2FA
```http
POST /api/v1/auth/2fa/verify
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "123456"
}
```

#### Disable 2FA
```http
POST /api/v1/auth/2fa/disable
Authorization: Bearer {token}
Content-Type: application/json

{
  "password": "securepassword123"
}
```

### User Profile

#### Get Profile
```http
GET /api/v1/users/me
Authorization: Bearer {token}
```

#### Update Profile
```http
PUT /api/v1/users/me
Authorization: Bearer {token}
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "timezone": "Europe/Paris",
  "currency": "EUR",
  "language": "fr"
}
```

#### Change Password
```http
PUT /api/v1/users/me/password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

### Admin Endpoints

#### List Users
```http
GET /api/v1/users?page=1&limit=20&search=john&role=user
Authorization: Bearer {admin_token}
```

#### Get User by ID
```http
GET /api/v1/users/{id}
Authorization: Bearer {admin_token}
```

#### Update User Role
```http
PUT /api/v1/users/{id}/role
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "role": "premium"  // user, premium, admin
}
```

#### Deactivate User
```http
DELETE /api/v1/users/{id}
Authorization: Bearer {admin_token}
```

### Health Checks
```http
GET /health
GET /health/ready
```

## Database Schema

### Users Table
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique email |
| password | VARCHAR(255) | Hashed password |
| firstName | VARCHAR(100) | First name |
| lastName | VARCHAR(100) | Last name |
| phoneNumber | VARCHAR(20) | Phone number |
| isActive | BOOLEAN | Account status |
| isEmailVerified | BOOLEAN | Email verification status |
| twoFactorEnabled | BOOLEAN | 2FA status |
| twoFactorSecret | VARCHAR(255) | TOTP secret |
| role | ENUM | user, premium, admin |
| timezone | VARCHAR(50) | User timezone |
| currency | VARCHAR(3) | Preferred currency |
| language | VARCHAR(10) | Preferred language |
| lastLoginAt | TIMESTAMP | Last login time |
| loginAttempts | INTEGER | Failed login count |
| lockUntil | TIMESTAMP | Account lock expiry |
| createdAt | TIMESTAMP | Creation time |
| updatedAt | TIMESTAMP | Last update time |

## Running Locally

```bash
npm install
npm run dev
```

## Docker

```bash
docker build -t surebet-user-management .
docker run -p 3002:3002 --env-file .env surebet-user-management
```

## Security Features

- Password hashing with bcrypt (10 rounds)
- JWT tokens with expiration
- Rate limiting on auth endpoints
- Account lockout after 5 failed attempts
- Two-factor authentication with TOTP
- Backup codes for 2FA recovery
- Input validation with Joi
- Helmet.js for security headers

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   API Gateway   │────▶│  User Management    │────▶│  PostgreSQL  │
└─────────────────┘     │  Service            │     └──────────────┘
                        │  - Auth             │
                        │  - Profile          │     ┌──────────────┐
                        │  - Admin            │────▶│    Redis     │
                        └─────────────────────┘     └──────────────┘
```
