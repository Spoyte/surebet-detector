const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const express = require('express');
const cors = require('cors');
const { json } = require('body-parser');

const { typeDefs } = require('./schema');
const { resolvers } = require('./resolvers');

// Import data source implementations
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

class GraphQLServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || 4000,
      path: config.path || '/graphql',
      subscriptionsPath: config.subscriptionsPath || '/graphql',
      ...config,
    };
    
    this.app = express();
    this.server = null;
    this.wsServer = null;
  }

  async initialize() {
    // Create executable schema
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    // Create Apollo Server
    this.server = new ApolloServer({
      schema,
      introspection: true,
      plugins: [
        {
          async serverWillStart() {
            return {
              async drainServer() {
                // Cleanup when server shuts down
              },
            };
          },
        },
      ],
    });

    await this.server.start();

    // Apply middleware
    this.app.use(
      this.config.path,
      cors(),
      json(),
      expressMiddleware(this.server, {
        context: async ({ req }) => {
          // Get user from auth token
          const user = await this.getUserFromToken(req.headers.authorization);
          
          return {
            user,
            dataSources: this.createDataSources(),
          };
        },
      })
    );

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    return this;
  }

  createDataSources() {
    return {
      bookmakerAPI: new BookmakerAPI(),
      matchAPI: new MatchAPI(),
      oddsAPI: new OddsAPI(),
      opportunityAPI: new OpportunityAPI(),
      betAPI: new BetAPI(),
      bankrollAPI: new BankrollAPI(),
      analyticsAPI: new AnalyticsAPI(),
      alertAPI: new AlertAPI(),
      userAPI: new UserAPI(),
      healthAPI: new HealthAPI(),
    };
  }

  async getUserFromToken(authHeader) {
    // TODO: Implement proper JWT validation
    // For now, return a mock user
    if (!authHeader) {
      return { id: 'anonymous', role: 'guest' };
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Mock user lookup - replace with actual auth
    return {
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
    };
  }

  async start() {
    return new Promise((resolve) => {
      const httpServer = this.app.listen(this.config.port, () => {
        console.log(`🚀 GraphQL Server ready at http://localhost:${this.config.port}${this.config.path}`);
        
        // Set up WebSocket server for subscriptions
        this.wsServer = new WebSocketServer({
          server: httpServer,
          path: this.config.subscriptionsPath,
        });

        const schema = makeExecutableSchema({
          typeDefs,
          resolvers,
        });

        useServer(
          {
            schema,
            context: async (ctx) => {
              // Get user from connection params
              const user = await this.getUserFromToken(ctx.connectionParams?.authorization);
              return {
                user,
                dataSources: this.createDataSources(),
              };
            },
          },
          this.wsServer
        );

        console.log(`📡 Subscriptions ready at ws://localhost:${this.config.port}${this.config.subscriptionsPath}`);
        
        resolve(httpServer);
      });
    });
  }

  async stop() {
    if (this.wsServer) {
      this.wsServer.close();
    }
    if (this.server) {
      await this.server.stop();
    }
  }
}

module.exports = { GraphQLServer };

// If run directly, start the server
if (require.main === module) {
  const server = new GraphQLServer();
  server.initialize().then(() => server.start());
}
