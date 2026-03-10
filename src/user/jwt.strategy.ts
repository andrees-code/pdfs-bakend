import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET no está definido en el .env');
    }

    // ✅ Usamos StrategyOptionsWithoutRequest para que TS deje de quejarse
    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: true,
    };
    console.log('LLAVE EN ESTRATEGIA:', secret)
    super(options);
  }

  async validate(payload: any) {
    // payload = { id: "...", role: "user", iat: ..., exp: ... }
    if (!payload || !payload.id) {
      throw new UnauthorizedException('Token inválido');
    }

    console.log('[JwtStrategy] payload recibido:', payload);

    // Esto se asigna a req.user
    return {
      id: payload.id,
      role: payload.role,
    };
  }
}
