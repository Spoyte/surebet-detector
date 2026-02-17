/**
 * Review Model
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  bookmakerId: mongoose.Types.ObjectId;
  userId: string;
  userName?: string;
  rating: number; // 1-5 overall rating
  categories: {
    oddsQuality: number; // 1-5
    withdrawalSpeed: number; // 1-5
    customerService: number; // 1-5
    websiteUsability: number; // 1-5
    bonusOffers: number; // 1-5
    mobileExperience: number; // 1-5
  };
  title: string;
  content: string;
  pros: string[];
  cons: string[];
  withdrawalExperience?: {
    amount: number;
    currency: string;
    method: string;
    requestedAt: Date;
    receivedAt?: Date;
    status: 'pending' | 'completed' | 'rejected';
  };
  isVerified: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  reportedCount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  bookmakerId: { type: Schema.Types.ObjectId, ref: 'Bookmaker', required: true, index: true },
  userId: { type: String, required: true, index: true },
  userName: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  categories: {
    oddsQuality: { type: Number, min: 1, max: 5 },
    withdrawalSpeed: { type: Number, min: 1, max: 5 },
    customerService: { type: Number, min: 1, max: 5 },
    websiteUsability: { type: Number, min: 1, max: 5 },
    bonusOffers: { type: Number, min: 1, max: 5 },
    mobileExperience: { type: Number, min: 1, max: 5 }
  },
  title: { type: String, required: true, maxlength: 200 },
  content: { type: String, required: true, maxlength: 5000 },
  pros: [{ type: String, maxlength: 200 }],
  cons: [{ type: String, maxlength: 200 }],
  withdrawalExperience: {
    amount: Number,
    currency: String,
    method: String,
    requestedAt: Date,
    receivedAt: Date,
    status: { type: String, enum: ['pending', 'completed', 'rejected'] }
  },
  isVerified: { type: Boolean, default: false },
  helpfulCount: { type: Number, default: 0 },
  unhelpfulCount: { type: Number, default: 0 },
  reportedCount: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, {
  timestamps: true
});

// Compound index to prevent duplicate reviews
ReviewSchema.index({ bookmakerId: 1, userId: 1 }, { unique: true });

export const Review = mongoose.model<IReview>('Review', ReviewSchema);
