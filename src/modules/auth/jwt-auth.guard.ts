import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { TokensService } from './tokens.service';

/**
 * Validates `Authorization: Bearer <accessToken>` for every protected
 * endpoint (per guide: "Protected endpoints require: Authorization: Bearer
 * <accessToken>"). On success sets req.user = { id }.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}

  canActivate(context: ExecutionContext): boolean {
    const req: any = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw AppException.of(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid access token', 'authorization');
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = this.tokens.verifyAccessToken(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw AppException.of(401, ErrorCode.UNAUTHORIZED, 'Missing or invalid access token', 'authorization');
    }
  }
}
