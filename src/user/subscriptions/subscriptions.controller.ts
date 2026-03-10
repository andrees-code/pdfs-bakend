// src/subscriptions/subscriptions.controller.ts
import { Controller, Post, Body, Req, Get, Request, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

// Dejamos la ruta como la tienes (/api/api/...) ya que pediste no tocarla
@Controller('api/v1/subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // 💳 Crear sesión Stripe Checkout
  @UseGuards(JwtAuthGuard)
  @Post('create-checkout-session')
  async createCheckoutSession(
    @Req() req,
    @Body('plan') plan: 'monthly' | 'yearly',
  ) {
    if (!['monthly', 'yearly'].includes(plan)) {
      throw new BadRequestException('Plan inválido');
    }

    // ⚡️ CORRECCIÓN DE SEGURIDAD: Buscamos el ID en varias propiedades posibles
    const userId = req.user.id || req.user.userId || req.user._id;

    const session = await this.subscriptionsService.createCheckoutSession(
      userId,
      plan,
    );

    return { url: session.url };
  }

  @UseGuards(JwtAuthGuard)
  @Get('premium') 
  async getPremiumStatus(@Request() req) {
    // 🔍 DEBUG: Ver qué trae el usuario realmente
    this.logger.log(`Usuario solicitando premium: ${JSON.stringify(req.user)}`);

    // ⚡️ CORRECCIÓN PRINCIPAL AQUÍ
    // Antes usabas req.user.userId, pero en el otro método usabas req.user.id.
    // Esto asegura que lo pille sea cual sea el nombre:
    const id = req.user.id || req.user.userId || req.user._id || req.user.sub;

    if (!id) {
        throw new BadRequestException('No se pudo identificar el ID del usuario en el token');
    }

    return this.subscriptionsService.getSubscriptionStatus(id); 
  }
}