import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from '../schemas/user.schema/user.schema';
import { SubscriptionCron } from './cron/subscriptions.cron';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
  ],
  controllers: [SubscriptionsController, WebhookController
  ],
  providers: [SubscriptionsService, SubscriptionCron],
})
export class SubscriptionsModule {}
