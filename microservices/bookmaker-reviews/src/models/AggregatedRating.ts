/**
 * Aggregated Rating Model
 * 
 * Pre-computed aggregated ratings for fast queries
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IAggregatedRating extends Document {
  bookmakerId: mongoose.Types.ObjectId;
  overall: {
    average: number;
    count: number;
    distribution: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
  };
  categories: {
    oddsQuality: { average: number; count: number };
    withdrawalSpeed: { average: number; count: number };
    customerService: { average: number; count: number };
    websiteUsability: { average: number; count: number };
    bonusOffers: { average: number; count: number };
    mobileExperience: { average: number; count: number };
  };
  withdrawalStats: {
    averageTime: number; // in hours
    count: number;
    successRate: number;
  };
  lastUpdated: Date;
}

const AggregatedRatingSchema = new Schema<IAggregatedRating>({
  bookmakerId: { type: Schema.Types.ObjectId, ref: 'Bookmaker', required: true, unique: true },
  overall: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    distribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 }
    }
  },
  categories: {
    oddsQuality: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    withdrawalSpeed: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    customerService: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    websiteUsability: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    bonusOffers: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    mobileExperience: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } }
  },
  withdrawalStats: {
    averageTime: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 }
  },
  lastUpdated: { type: Date, default: Date.now }
});

export const AggregatedRating = mongoose.model<IAggregatedRating>('AggregatedRating', AggregatedRatingSchema);
