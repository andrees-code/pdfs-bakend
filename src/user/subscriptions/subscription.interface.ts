export interface Subscription {
  plan: 'free' | 'monthly' | 'yearly';
  status: 'active' | 'expired' | 'canceled';
  startDate?: Date;
  endDate?: Date;
}
