// src/subscriptions/subscriptions.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { UserDocument } from '../interfaces/user/user-document';
import { calculateEndDate } from './subscriptions.utils';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;

  constructor(@InjectModel('User') private userModel: Model<UserDocument>) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Falta STRIPE_SECRET_KEY en .env');
    }
    // ⚡ Usar la versión literal compatible con stripe 20.x
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
    });
  }

  // Suscripción manual (opcional mantener)
  async subscribe(userId: string, plan: 'monthly' | 'yearly') {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const startDate = new Date();
    const endDate = calculateEndDate(plan);

    user.subscription = {
      plan,
      status: 'active',
      startDate,
      endDate,
    };

    await user.save();

    return {
      message: 'Suscripción activada',
      subscription: user.subscription,
    };
  }

  // 🔹 Crear sesión Stripe Checkout
  async createCheckoutSession(userId: string, plan: 'monthly' | 'yearly') {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const priceId =
      plan === 'monthly'
        ? process.env.STRIPE_PRICE_MONTHLY
        : process.env.STRIPE_PRICE_YEARLY;

    if (!priceId) throw new BadRequestException('Plan no configurado en Stripe');

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/perfil?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/perfil?canceled=true`,
    });

    return { url: session.url };
  }

  // 🔹 Actualizar suscripción desde webhook Stripe
  async updateUserSubscription(
    email: string,
    plan: 'monthly' | 'yearly',
    status: 'active' | 'canceled',
  ) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const startDate = new Date();
    const endDate = calculateEndDate(plan);

    user.subscription = { plan, status, startDate, endDate };
    await user.save();

    return user.subscription;
  }

  async getSubscriptionStatus(userId: string) {
    const user = await this.userModel.findById(userId);
    
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Si no tiene objeto subscription, asumimos free
    if (!user.subscription) {
      return { plan: 'free', status: 'active' };
    }

    // Verificamos si ha caducado (opcional, pero recomendado)
    const now = new Date();
    if (user.subscription.endDate && new Date(user.subscription.endDate) < now) {
       // Si caducó, podrías devolver free o status expired
       return { plan: 'free', status: 'expired' };
    }

    return {
      plan: user.subscription.plan,
      status: user.subscription.status,
      endDate: user.subscription.endDate
    };
  }


}
