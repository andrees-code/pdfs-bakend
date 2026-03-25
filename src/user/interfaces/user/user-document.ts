import { Document } from 'mongoose';
import { User } from './user.interface';
import { Subscription } from '../../subscriptions/subscription.interface';

export interface UserDocument extends Omit<User, '_id'>, Document {
  password: string;
  subscription: Subscription;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
}
