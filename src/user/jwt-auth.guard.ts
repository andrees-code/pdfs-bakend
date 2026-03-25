// jwt-auth.guard.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info) {
    // 'info' contiene el error real de Passport (ej. "jwt malformed", "invalid signature")
    if (err || !user) {
      console.error('MOTIVO DEL RECHAZO:', info?.message); 
      throw err || new UnauthorizedException();
    }
    return user;
  }
}