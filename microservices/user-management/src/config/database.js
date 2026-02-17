const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize = null;

async function connectDatabase() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'surebet_users',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  sequelize = new Sequelize(dbConfig);

  await sequelize.authenticate();
  logger.info('Database connection established');

  // Sync models (in production, use migrations instead)
  if (process.env.NODE_ENV !== 'production') {
    await sequelize.sync({ alter: true });
    logger.info('Database models synchronized');
  }

  return sequelize;
}

function getSequelize() {
  if (!sequelize) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return sequelize;
}

module.exports = { connectDatabase, getSequelize };
