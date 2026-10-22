import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResult<T = unknown> {
  message: string;
  data: T;
}

export interface SuccessEnvelope<T = unknown> {
  success: true;
  message: string;
  data: T;
}

/**
 * Wraps every controller return value `{ message, data }` into the guide's
 * exact SUCCESS RESPONSE shape: { success: true, message, data }.
 * Controllers are expected to return ApiResult<T>; this keeps the envelope
 * concern out of every service/controller method body.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<ApiResult<T>, SuccessEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<ApiResult<T>>): Observable<SuccessEnvelope<T>> {
    return next.handle().pipe(
      map((result) => {
        // Defensive: if a handler forgets the { message, data } shape and
        // just returns raw data, still produce a valid envelope.
        if (result && typeof result === 'object' && 'message' in result && 'data' in (result as object)) {
          const r = result as ApiResult<T>;
          return { success: true, message: r.message, data: r.data };
        }
        return { success: true, message: 'OK', data: result as unknown as T };
      }),
    );
  }
}
