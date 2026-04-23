import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { LlamasService } from '../llamas/llamas.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    isPremium: boolean;
    llamasBalance: number;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly llamasService: LlamasService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El email ya está en uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
    });

    // Asignar referralCode usando los primeros 6 caracteres del UUID
    const referralCode = `REF-${user.id.substring(0, 6).toUpperCase()}`;
    await this.usersService.updateReferralCode(user.id, referralCode);

    // Crédito inicial de LLAMAS
    const initialBalance = this.configService.get<number>('LLAMAS_INITIAL_BALANCE') ?? 100;
    await this.llamasService.credit(user.id, initialBalance, 'welcome_bonus');

    const tokens = this.signTokens({ sub: user.id, email: user.email, isPremium: false });

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isPremium: false,
        llamasBalance: initialBalance,
      },
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const llamasBalance = await this.llamasService.getBalance(user.id);
    const tokens = this.signTokens({
      sub: user.id,
      email: user.email,
      isPremium: user.isPremium,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isPremium: user.isPremium,
        llamasBalance,
      },
    };
  }

  async getProfile(userId: string): Promise<{
    id: string;
    username: string;
    email: string;
    avatarUrl?: string;
    age?: number;
    isPremium: boolean;
    charismaPts: number;
    referralCode?: string;
    llamasBalance: number;
    createdAt: Date;
  }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const llamasBalance = await this.llamasService.getBalance(user.id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      age: user.age,
      isPremium: user.isPremium,
      charismaPts: user.charismaPts,
      referralCode: user.referralCode,
      llamasBalance,
      createdAt: user.createdAt,
    };
  }

  refreshAccessToken(refreshToken: string): { accessToken: string } {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') ??
          this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const accessToken = this.jwtService.sign(
      { sub: payload.sub, email: payload.email, isPremium: payload.isPremium },
      { expiresIn: '15m' },
    );
    return { accessToken };
  }

  private signTokens(payload: JwtPayload): AuthTokens {
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ??
        this.configService.get<string>('JWT_SECRET'),
    });
    return { accessToken, refreshToken };
  }
}
