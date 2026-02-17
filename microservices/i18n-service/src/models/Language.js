const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  nativeName: {
    type: String,
    required: true
  },
  flag: {
    type: String,
    default: null
  },
  rtl: {
    type: Boolean,
    default: false
  },
  enabled: {
    type: Boolean,
    default: true
  },
  completionPercentage: {
    type: Number,
    default: 0
  },
  statistics: {
    totalKeys: {
      type: Number,
      default: 0
    },
    translatedKeys: {
      type: Number,
      default: 0
    },
    verifiedKeys: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    locale: String,
    dateFormat: {
      type: String,
      default: 'YYYY-MM-DD'
    },
    timeFormat: {
      type: String,
      default: 'HH:mm'
    },
    currency: {
      type: String,
      default: 'EUR'
    },
    numberFormat: {
      decimalSeparator: {
        type: String,
        default: '.'
      },
      thousandSeparator: {
        type: String,
        default: ','
      }
    }
  }
}, {
  timestamps: true
});

// Update completion percentage before saving
languageSchema.pre('save', function(next) {
  if (this.statistics.totalKeys > 0) {
    this.completionPercentage = Math.round(
      (this.statistics.translatedKeys / this.statistics.totalKeys) * 100
    );
  }
  next();
});

module.exports = mongoose.model('Language', languageSchema);
