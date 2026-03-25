import { Subscription } from '../../subscriptions/subscription.interface';

export interface User {
  _id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  avatar: string | null;
  lastLogin?: Date;

  // 👇 NUEVO
  subscription: Subscription;

  createdAt: Date;
  updatedAt: Date;
  
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
}
