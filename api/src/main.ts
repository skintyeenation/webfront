import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Sync the schema BEFORE Nest starts so the BandMember table is in place
// when controllers connect. Best-effort: if DATABASE_URL is missing OR
// the sync fails, log and continue — PrismaService falls back to no-db
// mode and the api/ stays up serving the in-memory dataset.
//
// Using `prisma db push` (not `migrate deploy`) during this prototyping
// phase. `db push` requires no migration history; it directly applies
// the schema. Trade-off: no per-change SQL audit trail, no rollback.
// Once the schema stabilizes, switch to:
//   npx prisma migrate dev --name <change>   (local, generates SQL)
//   git commit prisma/migrations/             (review the SQL)
//   And in this function: `prisma migrate deploy` (applies pending).
function syncSchema() {
  if (!process.env.DATABASE_URL) {
    console.log('▸ DATABASE_URL not set — skipping prisma db push');
    return;
  }
  try {
    console.log('▸ running prisma db push…');
    execSync('npx prisma db push --skip-generate --accept-data-loss --schema=/app/prisma/schema.prisma', {
      stdio: 'inherit',
      env: process.env,
      timeout: 60_000,
    });
    console.log('  ✓ schema synced');
  } catch (e) {
    console.warn(`  ⚠ prisma db push failed; continuing in no-db fallback: ${e}`);
  }
}

async function bootstrap() {
  syncSchema();

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
