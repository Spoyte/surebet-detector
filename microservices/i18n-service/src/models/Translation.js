const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    index: true
  },
  namespace: {
    type: String,
    required: true,
    default: 'common',
    index: true
  },
  language: {
    type: String,
    required: true,
    index: true
  },
  value: {
    type: String,
    required: true
  },
  context: {
    type: String,
    default: null
  },
  metadata: {
    createdBy: String,
    updatedBy: String,
    source: {
      type: String,
      enum: ['manual', 'auto', 'import', 'api'],
      default: 'manual'
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  usage: {
    count: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
translationSchema.index({ namespace: 1, key: 1, language: 1 }, { unique: true });
translationSchema.index({ language: 1, namespace: 1 });

// Method to track usage
translationSchema.methods.trackUsage = async function() {
  this.usage.count += 1;
  this.usage.lastUsed = new Date();
  await this.save();
};

module.exports = mongoose.model('Translation', translationSchema);
