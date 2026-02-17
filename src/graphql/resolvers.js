// Use a simple event emitter for pub/sub
const EventEmitter = require('events');

class PubSub extends EventEmitter {
  asyncIterator(events) {
    const eventList = Array.isArray(events) ? events : [events];
    const queue = [];
    const resolvers = [];
    
    const handler = (data) => {
      if (resolvers.length > 0) {
        const resolver = resolvers.shift();
        resolver({ value: data, done: false });
      } else {
        queue.push(data);
      }
    };
    
    eventList.forEach(event => this.on(event, handler));
    
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        if (queue.length > 0) {
          return Promise.resolve({ value: queue.shift(), done: false });
        }
        return new Promise(resolve => resolvers.push(resolve));
      },
      return() {
        eventList.forEach(event => this.removeListener(event, handler));
        return Promise.resolve({ done: true });
      },
    };
  }
  
  publish(event, payload) {
    this.emit(event, payload);
    return Promise.resolve();
  }
}

// In-memory pubsub for development - use Redis in production
const pubsub = new PubSub();

const OPPORTUNITY_CREATED = 'OPPORTUNITY_CREATED';
const OPPORTUNITY_UPDATED = 'OPPORTUNITY_UPDATED';
const OPPORTUNITY_EXPIRED = 'OPPORTUNITY_EXPIRED';
const ODDS_UPDATED = 'ODDS_UPDATED';
const BET_PLACED = 'BET_PLACED';
const BET_SETTLED = 'BET_SETTLED';
const ALERT_CREATED = 'ALERT_CREATED';
const BANKROLL_UPDATED = 'BANKROLL_UPDATED';

// Mock data store - replace with actual database calls
const dataStore = {
  bookmakers: new Map(),
  matches: new Map(),
  odds: new Map(),
  opportunities: new Map(),
  bets: new Map(),
  alerts: new Map(),
  users: new Map(),
  bankrolls: new Map(),
};

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 15);

const resolvers = {
  DateTime: {
    __parseValue(value) {
      return new Date(value);
    },
    __serialize(value) {
      return value.toISOString();
    },
    __parseLiteral(ast) {
      return new Date(ast.value);
    },
  },

  JSON: {
    __parseValue(value) {
      return value;
    },
    __serialize(value) {
      return value;
    },
    __parseLiteral(ast) {
      return JSON.parse(ast.value);
    },
  },

  Query: {
    // Bookmakers
    bookmakers: async (_, { isActive }, { dataSources }) => {
      const bookmakers = await dataSources.bookmakerAPI.getAll();
      if (isActive !== undefined) {
        return bookmakers.filter(b => b.isActive === isActive);
      }
      return bookmakers;
    },

    bookmaker: async (_, { id }, { dataSources }) => {
      return dataSources.bookmakerAPI.getById(id);
    },

    // Matches
    matches: async (_, args, { dataSources }) => {
      return dataSources.matchAPI.getMatches(args);
    },

    match: async (_, { id }, { dataSources }) => {
      return dataSources.matchAPI.getById(id);
    },

    // Opportunities
    opportunities: async (_, { filter, limit, offset, orderBy, orderDirection }, { dataSources }) => {
      return dataSources.opportunityAPI.getOpportunities({
        filter,
        limit,
        offset,
        orderBy,
        orderDirection,
      });
    },

    opportunity: async (_, { id }, { dataSources }) => {
      return dataSources.opportunityAPI.getById(id);
    },

    opportunityCount: async (_, { filter }, { dataSources }) => {
      return dataSources.opportunityAPI.getCount(filter);
    },

    // Bets
    bets: async (_, { filter, limit, offset }, { dataSources }) => {
      return dataSources.betAPI.getBets({ filter, limit, offset });
    },

    bet: async (_, { id }, { dataSources }) => {
      return dataSources.betAPI.getById(id);
    },

    betStats: async (_, { filter }, { dataSources }) => {
      return dataSources.betAPI.getStats(filter);
    },

    // Bankroll
    bankroll: async (_, __, { dataSources, user }) => {
      return dataSources.bankrollAPI.getBankroll(user.id);
    },

    // Analytics
    analytics: async (_, { period }, { dataSources, user }) => {
      return dataSources.analyticsAPI.getAnalytics(user.id, period);
    },

    // Alerts
    alerts: async (_, { isRead, limit }, { dataSources, user }) => {
      return dataSources.alertAPI.getAlerts(user.id, { isRead, limit });
    },

    unreadAlertCount: async (_, __, { dataSources, user }) => {
      return dataSources.alertAPI.getUnreadCount(user.id);
    },

    // User
    me: async (_, __, { dataSources, user }) => {
      return dataSources.userAPI.getById(user.id);
    },

    // Health
    health: async (_, __, { dataSources }) => {
      return dataSources.healthAPI.getStatus();
    },
  },

  Mutation: {
    // Bets
    createBet: async (_, { input }, { dataSources, user }) => {
      const bet = await dataSources.betAPI.create({
        ...input,
        userId: user.id,
        status: 'PENDING',
        createdAt: new Date(),
      });
      
      await pubsub.publish(BET_PLACED, { betPlaced: bet });
      return bet;
    },

    updateBet: async (_, { id, input }, { dataSources }) => {
      const bet = await dataSources.betAPI.update(id, input);
      
      if (input.status === 'SETTLED' || input.status === 'WON' || input.status === 'LOST') {
        await pubsub.publish(BET_SETTLED, { betSettled: bet });
      }
      
      return bet;
    },

    deleteBet: async (_, { id }, { dataSources }) => {
      return dataSources.betAPI.delete(id);
    },

    // Opportunities
    bookmarkOpportunity: async (_, { id }, { dataSources, user }) => {
      return dataSources.opportunityAPI.bookmark(id, user.id);
    },

    archiveOpportunity: async (_, { id }, { dataSources }) => {
      const opportunity = await dataSources.opportunityAPI.update(id, { status: 'ARCHIVED' });
      return opportunity;
    },

    // Alerts
    markAlertRead: async (_, { id }, { dataSources }) => {
      return dataSources.alertAPI.update(id, { isRead: true });
    },

    markAllAlertsRead: async (_, __, { dataSources, user }) => {
      return dataSources.alertAPI.markAllRead(user.id);
    },

    deleteAlert: async (_, { id }, { dataSources }) => {
      return dataSources.alertAPI.delete(id);
    },

    // User Preferences
    updatePreferences: async (_, { input }, { dataSources, user }) => {
      return dataSources.userAPI.updatePreferences(user.id, input);
    },

    // Bankroll
    updateBookmakerBalance: async (_, { bookmakerId, balance }, { dataSources, user }) => {
      const result = await dataSources.bankrollAPI.updateBalance(user.id, bookmakerId, balance);
      
      const bankroll = await dataSources.bankrollAPI.getBankroll(user.id);
      await pubsub.publish(BANKROLL_UPDATED, { bankrollUpdated: bankroll });
      
      return result;
    },

    transferFunds: async (_, { fromBookmakerId, toBookmakerId, amount }, { dataSources, user }) => {
      const result = await dataSources.bankrollAPI.transfer(
        user.id,
        fromBookmakerId,
        toBookmakerId,
        amount
      );
      
      const bankroll = await dataSources.bankrollAPI.getBankroll(user.id);
      await pubsub.publish(BANKROLL_UPDATED, { bankrollUpdated: bankroll });
      
      return result;
    },
  },

  Subscription: {
    opportunityCreated: {
      subscribe: () => pubsub.asyncIterator([OPPORTUNITY_CREATED]),
    },
    
    opportunityUpdated: {
      subscribe: (_, { id }) => {
        // Filter for specific opportunity if ID provided
        return pubsub.asyncIterator([OPPORTUNITY_UPDATED]);
      },
    },
    
    opportunityExpired: {
      subscribe: () => pubsub.asyncIterator([OPPORTUNITY_EXPIRED]),
    },
    
    oddsUpdated: {
      subscribe: (_, { matchId }) => {
        return pubsub.asyncIterator([`${ODDS_UPDATED}.${matchId || '*'}`]);
      },
    },
    
    betPlaced: {
      subscribe: () => pubsub.asyncIterator([BET_PLACED]),
    },
    
    betSettled: {
      subscribe: () => pubsub.asyncIterator([BET_SETTLED]),
    },
    
    alertCreated: {
      subscribe: () => pubsub.asyncIterator([ALERT_CREATED]),
    },
    
    bankrollUpdated: {
      subscribe: (_, __, { user }) => {
        // Only subscribe to user's own bankroll updates
        return pubsub.asyncIterator([`${BANKROLL_UPDATED}.${user.id}`]);
      },
    },
  },

  // Field resolvers for nested types
  Match: {
    odds: async (parent, _, { dataSources }) => {
      return dataSources.oddsAPI.getByMatchId(parent.id);
    },
    opportunities: async (parent, _, { dataSources }) => {
      return dataSources.opportunityAPI.getByMatchId(parent.id);
    },
  },

  Opportunity: {
    match: async (parent, _, { dataSources }) => {
      return dataSources.matchAPI.getById(parent.matchId);
    },
    legs: async (parent, _, { dataSources }) => {
      return dataSources.opportunityAPI.getLegs(parent.id);
    },
  },

  Bet: {
    opportunity: async (parent, _, { dataSources }) => {
      if (!parent.opportunityId) return null;
      return dataSources.opportunityAPI.getById(parent.opportunityId);
    },
    match: async (parent, _, { dataSources }) => {
      return dataSources.matchAPI.getById(parent.matchId);
    },
    bookmaker: async (parent, _, { dataSources }) => {
      return dataSources.bookmakerAPI.getById(parent.bookmakerId);
    },
  },

  Bankroll: {
    bookmakerBalances: async (parent, _, { dataSources }) => {
      return dataSources.bankrollAPI.getBookmakerBalances(parent.userId);
    },
  },

  BookmakerBalance: {
    bookmaker: async (parent, _, { dataSources }) => {
      return dataSources.bookmakerAPI.getById(parent.bookmakerId);
    },
  },

  Alert: {
    // Resolve any nested fields if needed
  },
};

// Export pubsub for use in other modules
module.exports = { 
  resolvers, 
  pubsub,
  OPPORTUNITY_CREATED,
  OPPORTUNITY_UPDATED,
  OPPORTUNITY_EXPIRED,
  ODDS_UPDATED,
  BET_PLACED,
  BET_SETTLED,
  ALERT_CREATED,
  BANKROLL_UPDATED,
};
