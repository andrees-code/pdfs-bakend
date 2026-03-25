// src/subscriptions/webhook.controller.ts
import { Controller, Post, Req, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import Stripe from 'stripe';

@Controller('api/v1/webhooks')
export class WebhookController {
  private stripe: Stripe;

  constructor(private readonly subscriptionsService: SubscriptionsService) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Falta STRIPE_SECRET_KEY en .env');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',// versión compatible con stripe 20.1.2
    });
  }

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req,
    @Headers('stripe-signature') signature: string,
  ) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('Falta STRIPE_WEBHOOK_SECRET en .env');
    }

    let event: Stripe.Event;

    try {
      // ⚠️ TypeScript sabe que webhookSecret es string
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err: any) {
      console.error('Webhook error:', err.message);
      return { received: false };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const plan =
            session.subscription?.toString().includes('month') ? 'monthly' : 'yearly';

          // Validar que customer_email existe
          if (!session.customer_email) {
            throw new Error('customer_email no disponible en la sesión de Stripe');
          }

          await this.subscriptionsService.updateUserSubscription(
            session.customer_email,
            plan,
            'active',
          );
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;

          // Obtener email desde metadata si no tienes directamente en Subscription
          const email = sub.metadata?.email;
          if (!email) {
            console.warn('Email no encontrado en la suscripción eliminada');
            break;
          }

          // Detectar plan desde la suscripción
          const plan = sub.items.data[0]?.price.recurring?.interval === 'month' ? 'monthly' : 'yearly';

          await this.subscriptionsService.updateUserSubscription(email, plan, 'canceled');
          break;
        }
      }
    } catch (err: any) {
      console.error('Error procesando evento Stripe:', err.message);
    }

    return { received: true };
  }
}
