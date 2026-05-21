import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('v1');

  // Serve the OpenAPI contract + Swagger UI (contract-first: the committed
  // openapi.yaml is the source of truth).
  const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8')) as any;
  const http = app.getHttpAdapter().getInstance();
  http.get('/openapi.json', (_req: any, res: any) => res.json(spec));
  http.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  http.get('/', (_req: any, res: any) => res.redirect('/docs'));

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Skin Tyee API on http://localhost:${port}  ·  docs at http://localhost:${port}/docs  ·  routes under /v1`);
}

bootstrap();
