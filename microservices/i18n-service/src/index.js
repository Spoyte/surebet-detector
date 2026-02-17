const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
require('dotenv').config();

const translationRoutes = require('./routes/translations');
const languageRoutes = require('./routes/languages');
const preferenceRoutes = require('./routes/preferences');
const aiTranslateRoutes = require('./routes/aiTranslate');
const languageService = require('./services/languageService');

const app = express();
const PORT = process.env.PORT || 3007;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'i18n-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/translations', translationRoutes);
app.use('/api/languages', languageRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use('/api/ai-translate', aiTranslateRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'i18n-service',
    description: 'Internationalization service for Surebet Detector',
    version: '1.1.0',
    endpoints: {
      translations: '/api/translations',
      languages: '/api/languages',
      preferences: '/api/preferences',
      aiTranslate: '/api/ai-translate',
      health: '/health'
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/surebet_i18n';
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Initialize default languages
    await languageService.initializeLanguages();
    console.log('Languages initialized');
    
    app.listen(PORT, () => {
      console.log(`i18n Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
