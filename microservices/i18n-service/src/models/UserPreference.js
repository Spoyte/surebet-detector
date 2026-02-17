const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  language: {
    type: String,
    default: 'en'
  },
  fallbackLanguage: {
    type: String,
    default: 'en'
  },
  autoDetect: {
    type: Boolean,
    default: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  dateFormat: {
    type: String,
    default: null // Use language default
  },
  timeFormat: {
    type: String,
    default: null // Use language default
  },
  numberFormat: {
    decimalSeparator: String,
    thousandSeparator: String
  },
  currency: {
    type: String,
    default: 'EUR'
  },
  lastDetectedLanguage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserPreference', userPreferenceSchema);
