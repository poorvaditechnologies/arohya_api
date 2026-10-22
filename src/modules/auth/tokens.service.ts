import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/configuration';

export interface AccessTokenPayload {
  sub: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
}

/**
 * Wraps @nestjs/jwt with the two distinct secrets the stack requires
 * (short-lived access token vs longer-lived rotating refresh token).
 * The refresh token embeds the RefreshSession id ("sid") so a session row
 * can be loaded in O(1) without needing to scan+verify an argon2 hash
 * against every stored session.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  signAccessToken(userId: string): { token: string; expiresInSeconds: number } {
    const expiresInSeconds = this.config.get('jwt.accessExpiresInSeconds', { infer: true });
    const token = this.jwt.sign(
      { sub: userId } satisfies AccessTokenPayload,
      { secret: this.config.get('jwt.accessSecret', { infer: true }), expiresIn: expiresInSeconds },
    );
    return { token, expiresInSeconds };
  }

  signRefreshToken(userId: string, sessionId: string): { token: string; expiresAt: Date } {
    const days = this.config.get('jwt.refreshExpiresInDays', { infer: true });
    const token = this.jwt.sign(
      { sub: userId, sid: sessionId } satisfies RefreshTokenPayload,
      { secret: this.config.get('jwt.refreshSecret', { infer: true }), expiresIn: `${days}d` },
    );
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return { token, expiresAt };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.get('jwt.accessSecret', { infer: true }),
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwt.verify<RefreshTokenPayload>(token, {
      secret: this.config.get('jwt.refreshSecret', { infer: true }),
    });
  }
}
