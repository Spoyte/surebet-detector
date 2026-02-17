/**
 * Mobile API Server
 * Express middleware for mobile app API endpoints
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

class MobileApiServer {
  constructor(options = {}) {
    this.router = express.Router();
    this.dataDir = options.dataDir || './data';
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'your-secret-key';
    this.pushNotificationService = options.pushNotificationService;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Compression for mobile data savings
    this.router.use(compression());
    
    // Body parsing
    this.router.use(express.json({ limit: '10mb' }));
    
    // Mobile-specific rate limiting
    const mobileLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: (req) => req.user ? 300 : 100, // Higher limit for authenticated users
      message: { error: 'Too many requests, please try again later' },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.router.use(mobileLimiter);

    // Auth middleware
    this.router.use(this.authenticate.bind(this));
  }

  async authenticate(req, res, next) {
    const publicPaths = ['/auth/login', '/auth/refresh', '/health'];
    if (publicPaths.some(path => req.path.includes(path))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  setupRoutes() {
    // Health check
    this.router.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Auth routes
    this.setupAuthRoutes();
    
    // Opportunities routes
    this.setupOpportunityRoutes();
    
    // Bets routes
    this.setupBetRoutes();
    
    // Dashboard routes
    this.setupDashboardRoutes();
    
    // Notification routes
    this.setupNotificationRoutes();
    
    // Profile routes
    this.setupProfileRoutes();
  }

  setupAuthRoutes() {
    // Login
    this.router.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        
        // TODO: Replace with actual user database lookup
        const user = await this.getUserByEmail(email);
        
        if (!user || !await bcrypt.compare(password, user.passwordHash)) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
          { userId: user.id, email: user.email },
          this.jwtSecret,
          { expiresIn: '7d' }
        );

        const refreshToken = jwt.sign(
          { userId: user.id, type: 'refresh' },
          this.jwtSecret,
          { expiresIn: '30d' }
        );

        res.json({
          token,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            biometricEnabled: user.biometricEnabled || false,
          }
        });
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
      }
    });

    // Verify token
    this.router.post('/auth/verify', (req, res) => {
      // If we get here, token is valid (auth middleware passed)
      res.json({
        user: {
          id: req.user.userId,
          email: req.user.email,
        }
      });
    });

    // Refresh token
    this.router.post('/auth/refresh', async (req, res) => {
      try {
        const { refreshToken } = req.body;
        
        const decoded = jwt.verify(refreshToken, this.jwtSecret);
        if (decoded.type !== 'refresh') {
          return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const user = await this.getUserById(decoded.userId);
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        const newToken = jwt.sign(
          { userId: user.id, email: user.email },
          this.jwtSecret,
          { expiresIn: '7d' }
        );

        res.json({ token: newToken });
      } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
      }
    });

    // Logout
    this.router.post('/auth/logout', (req, res) => {
      // TODO: Add token to blacklist or handle server-side logout
      res.json({ success: true });
    });

    // Enable/disable biometric
    this.router.post('/auth/biometric', async (req, res) => {
      try {
        const { enabled } = req.body;
        const userId = req.user.userId;
        
        await this.updateUser(userId, { biometricEnabled: enabled });
        
        res.json({ biometricEnabled: enabled });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update biometric setting' });
      }
    });
  }

  setupOpportunityRoutes() {
    // List opportunities
    this.router.get('/opportunities', async (req, res) => {
      try {
        const { 
          cursor, 
          limit = 20, 
          minProfit = 0, 
          sport,
          market 
        } = req.query;

        // TODO: Replace with actual opportunity fetch from database
        const opportunities = await this.getOpportunities({
          cursor,
          limit: parseInt(limit),
          minProfit: parseFloat(minProfit),
          sport,
          market,
        });

        // Optimize payload for mobile
        const optimized = opportunities.items.map(opp => ({
          id: opp.id,
          homeTeam: opp.homeTeam,
          awayTeam: opp.awayTeam,
          sport: opp.sport,
          league: opp.league,
          profitPercent: opp.profitPercent,
          totalStake: opp.totalStake,
          expectedProfit: opp.expectedProfit,
          bets: opp.bets.map(bet => ({
            bookmaker: bet.bookmaker,
            odds: bet.odds,
            outcome: bet.outcome,
          })),
          startTime: opp.startTime,
          market: opp.market,
        }));

        res.json({
          items: optimized,
          nextCursor: opportunities.nextCursor,
          hasMore: opportunities.hasMore,
        });
      } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).json({ error: 'Failed to fetch opportunities' });
      }
    });

    // Get opportunity details
    this.router.get('/opportunities/:id', async (req, res) => {
      try {
        const opportunity = await this.getOpportunityById(req.params.id);
        
        if (!opportunity) {
          return res.status(404).json({ error: 'Opportunity not found' });
        }

        res.json(opportunity);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch opportunity' });
      }
    });

    // Bookmark opportunity
    this.router.post('/opportunities/:id/bookmark', async (req, res) => {
      try {
        await this.addBookmark(req.user.userId, req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to bookmark' });
      }
    });

    // Remove bookmark
    this.router.delete('/opportunities/:id/bookmark', async (req, res) => {
      try {
        await this.removeBookmark(req.user.userId, req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to remove bookmark' });
      }
    });
  }

  setupBetRoutes() {
    // List bets
    this.router.get('/bets', async (req, res) => {
      try {
        const { status, cursor, limit = 20 } = req.query;
        
        const bets = await this.getUserBets(req.user.userId, {
          status,
          cursor,
          limit: parseInt(limit),
        });

        res.json(bets);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bets' });
      }
    });

    // Place bet
    this.router.post('/bets', async (req, res) => {
      try {
        const { opportunityId, stakes } = req.body;
        
        // TODO: Implement actual bet placement logic
        const bet = await this.placeBet(req.user.userId, {
          opportunityId,
          stakes,
          placedAt: new Date().toISOString(),
        });

        res.status(201).json(bet);
      } catch (error) {
        console.error('Error placing bet:', error);
        res.status(500).json({ error: 'Failed to place bet' });
      }
    });

    // Get bet details
    this.router.get('/bets/:id', async (req, res) => {
      try {
        const bet = await this.getBetById(req.params.id, req.user.userId);
        
        if (!bet) {
          return res.status(404).json({ error: 'Bet not found' });
        }

        res.json(bet);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bet' });
      }
    });
  }

  setupDashboardRoutes() {
    // Dashboard summary
    this.router.get('/dashboard/summary', async (req, res) => {
      try {
        const summary = await this.getDashboardSummary(req.user.userId);
        res.json(summary);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard summary' });
      }
    });

    // Chart data
    this.router.get('/dashboard/chart-data', async (req, res) => {
      try {
        const { range = '30d' } = req.query;
        const data = await this.getChartData(req.user.userId, range);
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch chart data' });
      }
    });

    // Recent activity
    this.router.get('/dashboard/recent-activity', async (req, res) => {
      try {
        const activity = await this.getRecentActivity(req.user.userId, 10);
        res.json(activity);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recent activity' });
      }
    });
  }

  setupNotificationRoutes() {
    // Register push token
    this.router.post('/notifications/register', async (req, res) => {
      try {
        const { token, platform } = req.body;
        
        await this.registerPushToken(req.user.userId, token, platform);
        
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to register push token' });
      }
    });

    // Unregister push token
    this.router.delete('/notifications/unregister', async (req, res) => {
      try {
        const { token } = req.body;
        
        await this.unregisterPushToken(req.user.userId, token);
        
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to unregister push token' });
      }
    });

    // Get notification preferences
    this.router.get('/notifications/preferences', async (req, res) => {
      try {
        const prefs = await this.getNotificationPreferences(req.user.userId);
        res.json(prefs);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch preferences' });
      }
    });

    // Update notification preferences
    this.router.patch('/notifications/preferences', async (req, res) => {
      try {
        await this.updateNotificationPreferences(req.user.userId, req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update preferences' });
      }
    });
  }

  setupProfileRoutes() {
    // Get profile
    this.router.get('/profile', async (req, res) => {
      try {
        const user = await this.getUserById(req.user.userId);
        res.json({
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          biometricEnabled: user.biometricEnabled || false,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
      }
    });

    // Update profile
    this.router.patch('/profile', async (req, res) => {
      try {
        const { name } = req.body;
        await this.updateUser(req.user.userId, { name });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
      }
    });

    // Get linked accounts
    this.router.get('/profile/accounts', async (req, res) => {
      try {
        const accounts = await this.getLinkedAccounts(req.user.userId);
        res.json(accounts);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch accounts' });
      }
    });

    // Link new account
    this.router.post('/profile/accounts', async (req, res) => {
      try {
        const { bookmaker, username } = req.body;
        await this.linkAccount(req.user.userId, { bookmaker, username });
        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to link account' });
      }
    });
  }

  // Placeholder methods - implement with actual database calls
  async getUserByEmail(email) {
    // TODO: Implement with actual database
    return null;
  }

  async getUserById(userId) {
    // TODO: Implement with actual database
    return null;
  }

  async updateUser(userId, updates) {
    // TODO: Implement with actual database
  }

  async getOpportunities(filters) {
    // TODO: Implement with actual database
    return { items: [], nextCursor: null, hasMore: false };
  }

  async getOpportunityById(id) {
    // TODO: Implement with actual database
    return null;
  }

  async addBookmark(userId, opportunityId) {
    // TODO: Implement with actual database
  }

  async removeBookmark(userId, opportunityId) {
    // TODO: Implement with actual database
  }

  async getUserBets(userId, filters) {
    // TODO: Implement with actual database
    return { items: [], nextCursor: null, hasMore: false };
  }

  async placeBet(userId, betData) {
    // TODO: Implement with actual database
    return { id: 'bet-' + Date.now(), ...betData };
  }

  async getBetById(betId, userId) {
    // TODO: Implement with actual database
    return null;
  }

  async getDashboardSummary(userId) {
    // TODO: Implement with actual database
    return {
      totalProfit: 0,
      activeBets: 0,
      winRate: 0,
      totalBets: 0,
    };
  }

  async getChartData(userId, range) {
    // TODO: Implement with actual database
    return {
      labels: [],
      data: [],
    };
  }

  async getRecentActivity(userId, limit) {
    // TODO: Implement with actual database
    return [];
  }

  async registerPushToken(userId, token, platform) {
    // TODO: Implement with actual database
  }

  async unregisterPushToken(userId, token) {
    // TODO: Implement with actual database
  }

  async getNotificationPreferences(userId) {
    // TODO: Implement with actual database
    return {
      pushEnabled: true,
      minProfitPercent: 1,
      quietHoursStart: null,
      quietHoursEnd: null,
    };
  }

  async updateNotificationPreferences(userId, prefs) {
    // TODO: Implement with actual database
  }

  async getLinkedAccounts(userId) {
    // TODO: Implement with actual database
    return [];
  }

  async linkAccount(userId, accountData) {
    // TODO: Implement with actual database
  }

  getRouter() {
    return this.router;
  }
}

module.exports = MobileApiServer;
