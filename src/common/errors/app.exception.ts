import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface AppFieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Domain exception that carries the exact (field, code, message) triples
 * the guide's ERROR RESPONSE shape expects, plus the HTTP status to use.
 * The global HttpExceptionFilter turns this into the final envelope.
 */
export class AppException extends HttpException {
  public readonly errors: AppFieldError[];

  constructor(status: number, message: string, errors: AppFieldError[]) {
    super({ message, errors }, status);
    this.errors = errors;
  }

  static of(status: number, code: ErrorCode | string, message: string, field = 'general'): AppException {
    return new AppException(status, message, [{ field, code: String(code), message }]);
  }
}
