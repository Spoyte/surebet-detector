const { GraphQLServer } = require('./server');
const { typeDefs } = require('./schema');
const { resolvers, pubsub } = require('./resolvers');

// Data sources
const BookmakerAPI = require('./datasources/bookmaker');
const MatchAPI = require('./datasources/match');
const OddsAPI = require('./datasources/odds');
const OpportunityAPI = require('./datasources/opportunity');
const BetAPI = require('./datasources/bet');
const BankrollAPI = require('./datasources/bankroll');
const AnalyticsAPI = require('./datasources/analytics');
const AlertAPI = require('./datasources/alert');
const UserAPI = require('./datasources/user');
const HealthAPI = require('./datasources/health');

module.exports = {
  GraphQLServer,
  typeDefs,
  resolvers,
  pubsub,
  dataSources: {
    BookmakerAPI,
    MatchAPI,
    OddsAPI,
    OpportunityAPI,
    BetAPI,
    BankrollAPI,
    AnalyticsAPI,
    AlertAPI,
    UserAPI,
    HealthAPI,
  },
};
