/**
 * Bookmaker Model
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IBookmaker extends Document {
  name: string;
  displayName: string;
  website: string;
  logoUrl?: string;
  countries: string[];
  currencies: string[];
  sports: string[];
  features: {
    liveBetting: boolean;
    cashOut: boolean;
    liveStreaming: boolean;
    mobileApp: boolean;
    betBuilder: boolean;
  };
  paymentMethods: {
    method: string;
    type: 'deposit' | 'withdrawal' | 'both';
    minAmount?: number;
    maxAmount?: number;
    processingTime?: string;
  }[];
  licenses: string[];
  foundedYear?: number;
  headquarters?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BookmakerSchema = new Schema<IBookmaker>({
  name: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  website: { type: String, required: true },
  logoUrl: String,
  countries: [{ type: String }],
  currencies: [{ type: String }],
  sports: [{ type: String }],
  features: {
    liveBetting: { type: Boolean, default: false },
    cashOut: { type: Boolean, default: false },
    liveStreaming: { type: Boolean, default: false },
    mobileApp: { type: Boolean, default: false },
    betBuilder: { type: Boolean, default: false }
  },
  paymentMethods: [{
    method: { type: String, required: true },
    type: { type: String, enum: ['deposit', 'withdrawal', 'both'], required: true },
    minAmount: Number,
    maxAmount: Number,
    processingTime: String
  }],
  licenses: [{ type: String }],
  foundedYear: Number,
  headquarters: String,
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

export const Bookmaker = mongoose.model<IBookmaker>('Bookmaker', BookmakerSchema);
