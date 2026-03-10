import { Schema, Document } from 'mongoose';

export interface UserDocument extends Document {
  username: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  avatar: string | null;
  lastLogin?: Date;

  subscription: {
    plan: 'free' | 'monthly' | 'yearly';
    status: 'active' | 'expired' | 'canceled';
    startDate?: Date;
    endDate?: Date;
  };

  // 👇 AGREGA ESTAS DOS LÍNEAS AQUÍ PARA QUE TS NO SE QUEJE
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<UserDocument>({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  avatar: { type: String, default: null },
  lastLogin: { type: Date, default: null },

  // 👇 SUSCRIPCIÓN
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'monthly', 'yearly'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'canceled'],
      default: 'active',
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  
  // 👇 Ahora esto ya no dará error
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },

}, { timestamps: true });