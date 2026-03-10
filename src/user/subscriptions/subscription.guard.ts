import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../interfaces/user/user-document';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const user = await this.userModel.findById(userId);
    if (!user || !user.subscription) {
      throw new ForbiddenException('Sin suscripción');
    }

    const { status, endDate } = user.subscription;

    if (status !== 'active') {
      throw new ForbiddenException('Suscripción inactiva');
    }

    if (endDate && new Date(endDate) < new Date()) {
      throw new ForbiddenException('Suscripción expirada');
    }

    // 👉 disponible para controllers
    req.subscription = user.subscription;

    return true;
  }
}
