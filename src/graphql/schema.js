const { gql } = require('@apollo/server');

const typeDefs = gql`
  # Scalars
  scalar DateTime
  scalar JSON

  # Enums
  enum Sport {
    SOCCER
    TENNIS
    BASKETBALL
    ESPORTS
    HORSE_RACING
    CRICKET
    RUGBY
    HOCKEY
    BASEBALL
    AMERICAN_FOOTBALL
  }

  enum MarketType {
    MATCH_WINNER
    ASIAN_HANDICAP
    EUROPEAN_HANDICAP
    OVER_UNDER
    BTTS
    CORRECT_SCORE
    DOUBLE_CHANCE
    DRAW_NO_BET
    HALF_TIME_FULL_TIME
  }

  enum BetStatus {
    PENDING
    PLACED
    WON
    LOST
    VOID
    SETTLED
  }

  enum OpportunityStatus {
    ACTIVE
    EXPIRED
    PLACED
    ARCHIVED
  }

  enum Priority {
    LOW
    MEDIUM
    HIGH
    CRITICAL
  }

  # Types
  type Bookmaker {
    id: ID!
    name: String!
    code: String!
    country: String
    website: String
    apiEndpoint: String
    isActive: Boolean!
    reliabilityScore: Float
    withdrawalSpeed: Int
    customerServiceRating: Float
    oddsQualityScore: Float
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Match {
    id: ID!
    externalId: String
    sport: Sport!
    league: String!
    homeTeam: String!
    awayTeam: String!
    startTime: DateTime!
    status: String!
    isLive: Boolean!
    score: JSON
    odds: [Odd!]!
    opportunities: [Opportunity!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Odd {
    id: ID!
    matchId: ID!
    bookmaker: Bookmaker!
    marketType: MarketType!
    selection: String!
    odds: Float!
    impliedProbability: Float!
    volume: Float
    lastUpdated: DateTime!
    isLive: Boolean!
  }

  type Opportunity {
    id: ID!
    match: Match!
    type: String!
    marketType: MarketType!
    profitPercentage: Float!
    evPercentage: Float
    totalStake: Float
    currency: String
    status: OpportunityStatus!
    qualityScore: Float
    timeToEvent: Int
    legs: [OpportunityLeg!]!
    createdAt: DateTime!
    expiresAt: DateTime
    notes: String
  }

  type OpportunityLeg {
    id: ID!
    bookmaker: Bookmaker!
    selection: String!
    odds: Float!
    stake: Float
    probability: Float!
  }

  type Bet {
    id: ID!
    opportunity: Opportunity
    match: Match!
    bookmaker: Bookmaker!
    marketType: MarketType!
    selection: String!
    odds: Float!
    stake: Float!
    currency: String!
    potentialReturn: Float!
    status: BetStatus!
    placedAt: DateTime
    settledAt: DateTime
    actualReturn: Float
    profitLoss: Float
    screenshotUrl: String
    notes: String
    tags: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Bankroll {
    id: ID!
    totalBalance: Float!
    currency: String!
    bookmakerBalances: [BookmakerBalance!]!
    dailyProfitLoss: Float!
    weeklyProfitLoss: Float!
    monthlyProfitLoss: Float!
    allTimeProfitLoss: Float!
    roi: Float!
    exposureLimit: Float!
    currentExposure: Float!
    updatedAt: DateTime!
  }

  type BookmakerBalance {
    bookmaker: Bookmaker!
    balance: Float!
    available: Float!
    exposure: Float!
    lastUpdated: DateTime!
  }

  type Analytics {
    totalBets: Int!
    winRate: Float!
    averageOdds: Float!
    totalStake: Float!
    totalProfit: Float!
    roi: Float!
    sharpeRatio: Float
    maxDrawdown: Float
    profitBySport: [SportProfit!]!
    profitByBookmaker: [BookmakerProfit!]!
    profitOverTime: [TimeSeriesPoint!]!
    opportunityFrequency: [TimeSeriesPoint!]!
  }

  type SportProfit {
    sport: Sport!
    bets: Int!
    stake: Float!
    profit: Float!
    roi: Float!
  }

  type BookmakerProfit {
    bookmaker: Bookmaker!
    bets: Int!
    stake: Float!
    profit: Float!
    roi: Float!
  }

  type TimeSeriesPoint {
    date: DateTime!
    value: Float!
  }

  type Alert {
    id: ID!
    type: String!
    priority: Priority!
    message: String!
    data: JSON
    isRead: Boolean!
    createdAt: DateTime!
  }

  type User {
    id: ID!
    email: String!
    name: String
    preferences: UserPreferences!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type UserPreferences {
    minProfitPercentage: Float
    minEvPercentage: Float
    maxStake: Float
    defaultCurrency: String
    alertChannels: [String!]!
    quietHoursStart: Int
    quietHoursEnd: Int
    excludedBookmakers: [ID!]!
    favoriteSports: [Sport!]!
  }

  type HealthStatus {
    service: String!
    status: String!
    latency: Float
    lastCheck: DateTime!
    errorRate: Float
  }

  # Input Types
  input OpportunityFilter {
    sports: [Sport!]
    bookmakers: [ID!]
    marketTypes: [MarketType!]
    minProfit: Float
    maxProfit: Float
    minEv: Float
    isLive: Boolean
    status: OpportunityStatus
  }

  input BetFilter {
    status: [BetStatus!]
    bookmakers: [ID!]
    sports: [Sport!]
    dateFrom: DateTime
    dateTo: DateTime
    tags: [String!]
  }

  input CreateBetInput {
    opportunityId: ID
    matchId: ID!
    bookmakerId: ID!
    marketType: MarketType!
    selection: String!
    odds: Float!
    stake: Float!
    currency: String
    notes: String
  }

  input UpdateBetInput {
    status: BetStatus
    actualReturn: Float
    notes: String
  }

  input UserPreferencesInput {
    minProfitPercentage: Float
    minEvPercentage: Float
    maxStake: Float
    defaultCurrency: String
    alertChannels: [String!]
    quietHoursStart: Int
    quietHoursEnd: Int
    excludedBookmakers: [ID!]
    favoriteSports: [Sport!]
  }

  # Queries
  type Query {
    # Bookmakers
    bookmakers(isActive: Boolean): [Bookmaker!]!
    bookmaker(id: ID!): Bookmaker

    # Matches
    matches(
      sport: Sport
      league: String
      isLive: Boolean
      from: DateTime
      to: DateTime
      limit: Int = 50
      offset: Int = 0
    ): [Match!]!
    match(id: ID!): Match

    # Opportunities
    opportunities(
      filter: OpportunityFilter
      limit: Int = 50
      offset: Int = 0
      orderBy: String = "profitPercentage"
      orderDirection: String = "desc"
    ): [Opportunity!]!
    opportunity(id: ID!): Opportunity
    opportunityCount(filter: OpportunityFilter): Int!

    # Bets
    bets(
      filter: BetFilter
      limit: Int = 50
      offset: Int = 0
    ): [Bet!]!
    bet(id: ID!): Bet
    betStats(filter: BetFilter): BetStats!

    # Bankroll
    bankroll: Bankroll!

    # Analytics
    analytics(period: String = "30d"): Analytics!

    # Alerts
    alerts(
      isRead: Boolean
      limit: Int = 50
    ): [Alert!]!
    unreadAlertCount: Int!

    # User
    me: User!

    # Health
    health: [HealthStatus!]!
  }

  type BetStats {
    total: Int!
    won: Int!
    lost: Int!
    pending: Int!
    totalStake: Float!
    totalReturn: Float!
    profitLoss: Float!
  }

  # Mutations
  type Mutation {
    # Bets
    createBet(input: CreateBetInput!): Bet!
    updateBet(id: ID!, input: UpdateBetInput!): Bet!
    deleteBet(id: ID!): Boolean!

    # Opportunities
    bookmarkOpportunity(id: ID!): Opportunity!
    archiveOpportunity(id: ID!): Opportunity!

    # Alerts
    markAlertRead(id: ID!): Alert!
    markAllAlertsRead: Boolean!
    deleteAlert(id: ID!): Boolean!

    # User Preferences
    updatePreferences(input: UserPreferencesInput!): UserPreferences!

    # Bankroll
    updateBookmakerBalance(bookmakerId: ID!, balance: Float!): BookmakerBalance!
    transferFunds(fromBookmakerId: ID!, toBookmakerId: ID!, amount: Float!): [BookmakerBalance!]!
  }

  # Subscriptions
  type Subscription {
    opportunityCreated: Opportunity!
    opportunityUpdated(id: ID!): Opportunity!
    opportunityExpired(id: ID!): ID!
    
    oddsUpdated(matchId: ID!): [Odd!]!
    
    betPlaced: Bet!
    betSettled: Bet!
    
    alertCreated: Alert!
    
    bankrollUpdated: Bankroll!
  }
`;

module.exports = { typeDefs };
