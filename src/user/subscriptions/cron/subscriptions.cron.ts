import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../../interfaces/user/user-document';

@Injectable()
export class SubscriptionCron {
  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
  ) {}

  // Cada hora revisa suscripciones activas expiradas
  @Cron('0 * * * *') // minuto 0 de cada hora
  async expireSubscriptions() {
    const now = new Date();

    const result = await this.userModel.updateMany(
      {
        'subscription.status': 'active',
        'subscription.endDate': { $lt: now },
      },
      {
        $set: { 'subscription.status': 'expired' },
      },
    );

    console.log(`[Cron] Suscripciones expiradas: ${result.modifiedCount}`);
  }
}
