import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppException, AppFieldError } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

interface ErrorEnvelope {
  success: false;
  message: string;
  errors: AppFieldError[];
  requestId: string;
}

/**
 * Global filter producing the guide's exact ERROR RESPONSE envelope for
 * every thrown error, including the "req_" prefixed requestId that the
 * RequestContextMiddleware attaches to every request.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request: any = ctx.getRequest();
    const reply: any = ctx.getResponse();
    const requestId: string = request?.requestId ?? 'req_unknown';

    const { status, message, errors } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(`[${requestId}] ${message}`, (exception as Error)?.stack);
    }

    const body: ErrorEnvelope = { success: false, message, errors, requestId };
    reply.status(status).send(body);
  }

  private resolve(exception: unknown): { status: number; message: string; errors: AppFieldError[] } {
    if (exception instanceof AppException) {
      const response = exception.getResponse() as { message: string; errors: AppFieldError[] };
      return { status: exception.getStatus(), message: response.message, errors: response.errors };
    }

    if (exception instanceof BadRequestException) {
      // class-validator ValidationPipe errors land here.
      const response = exception.getResponse() as { message: string | string[] };
      const rawMessages = Array.isArray(response.message) ? response.message : [response.message];
      const errors: AppFieldError[] = rawMessages.map((m) => this.toFieldError(m));
      return { status: HttpStatus.BAD_REQUEST, message: 'Validation failed', errors };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = typeof response === 'string' ? response : (response as any).message ?? exception.message;
      return {
        status,
        message: Array.isArray(message) ? message.join(', ') : message,
        errors: [{ field: 'general', code: this.codeForStatus(status), message: Array.isArray(message) ? message.join(', ') : message }],
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong. Please try again',
      errors: [{ field: 'general', code: ErrorCode.INTERNAL_ERROR, message: 'Something went wrong. Please try again' }],
    };
  }

  private toFieldError(rawMessage: string): AppFieldError {
    // class-validator messages are typically "fieldName must be ..." —
    // best-effort extraction of the field name for the contract's `field`
    // property; falls back to "general" when it can't be determined.
    const firstWord = rawMessage.split(' ')[0];
    const field = /^[a-zA-Z0-9_.]+$/.test(firstWord) ? firstWord : 'general';
    return { field, code: ErrorCode.VALIDATION_FAILED, message: rawMessage };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.ACCESS_DENIED;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RESOURCE_NOT_FOUND;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
