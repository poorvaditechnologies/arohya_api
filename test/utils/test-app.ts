import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../../src/common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../../src/common/middleware/request-context.middleware';

/**
 * Builds a fully-wired Nest+Fastify app (same global pipes/filters/
 * interceptors/hooks as src/main.ts) for e2e tests, ready to be driven
 * with supertest against its underlying Fastify server instance.
 *
 * Intentionally talks to the REAL Neon database configured in .env — this
 * project has no separate test database, per the task's instructions to
 * exercise the real DB throughout. Tests use uniquely-generated emails/PANs
 * so repeated runs don't collide with existing rows.
 */
export async function buildTestApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  app.getHttpAdapter().getInstance().addHook('onRequest', (req: any, reply: any, done: () => void) => {
    new RequestContextMiddleware().use(req, reply, done);
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
