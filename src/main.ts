import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);

  // Baseline security headers (CSP disabled: this is a pure JSON API with
  // no HTML views of its own apart from the Swagger UI, which ships its
  // own inline scripts/styles that a default CSP would otherwise block).
  // Cast to `any`: @nestjs/platform-fastify vendors its own copy of the
  // `fastify` types, which structurally conflicts with the top-level
  // `fastify`/`@fastify/helmet` type declarations even though both
  // resolve to compatible runtime versions — a well-known duplicate-types
  // friction point in the Fastify plugin ecosystem, not a real type error.
  await app.register(fastifyHelmet as any, { contentSecurityPolicy: false });

  // Registered as a Fastify onRequest hook (not app.use()/NestMiddleware)
  // because Nest's Fastify adapter hands app.use() the raw Node
  // IncomingMessage, which is a different object from the FastifyRequest
  // instance that ExecutionContext.getRequest() later returns inside
  // controllers/guards/filters. An onRequest hook runs on the real
  // FastifyRequest so req.requestId/req.lang set here are visible
  // everywhere else (decorators, the exception filter, etc.).
  app.getHttpAdapter().getInstance().addHook('onRequest', (req: any, reply: any, done: () => void) => {
    new RequestContextMiddleware().use(req, reply, done);
  });

  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Arohya Capital API')
    .setDescription('Backend REST API for the Arohya Capital Flutter application')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addServer(`/${config.get('apiPrefix', { infer: true })}`)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Arohya Capital API listening on :${port} (prefix /${config.get('apiPrefix', { infer: true })}), docs at /api/docs`);
}

bootstrap();
