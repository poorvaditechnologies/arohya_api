import { Injectable, NestMiddleware } from '@nestjs/common';
import { ulid } from 'ulid';

// Augment the request object (works for both the Express-style and
// Fastify raw request objects Nest's app.use() hands to middleware).
export interface RequestContext {
  requestId: string;
  lang: 'en' | 'kn';
}

/**
 * Assigns a "req_" prefixed request id to every incoming request (used in
 * both the success response header and the error envelope's requestId
 * field, per the guide), and resolves the active language from
 * Accept-Language (en/kn, default en).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const requestId = `req_${ulid()}`;
    const acceptLanguage: string = (req.headers['accept-language'] ?? '').toLowerCase();
    const lang: 'en' | 'kn' = acceptLanguage.startsWith('kn') ? 'kn' : 'en';

    req.requestId = requestId;
    req.lang = lang;

    if (typeof res.setHeader === 'function') {
      res.setHeader('X-Request-Id', requestId);
    } else if (typeof res.header === 'function') {
      res.header('X-Request-Id', requestId);
    }

    next();
  }
}
