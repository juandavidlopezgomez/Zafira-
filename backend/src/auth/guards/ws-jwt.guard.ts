import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token =
      (client.handshake.auth as Record<string, string>)?.token ??
      client.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) throw new WsException('Token no proporcionado');

    try {
      const payload = this.jwtService.verify<{ sub: string; email: string; isPremium: boolean }>(
        token,
        { secret: this.config.get<string>('JWT_SECRET') },
      );
      client.data = {
        ...client.data,
        userId: payload.sub,
        email: payload.email,
        isPremium: payload.isPremium,
      };
      return true;
    } catch {
      throw new WsException('Token inválido o expirado');
    }
  }
}
