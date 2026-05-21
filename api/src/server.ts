import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import * as db from './fixtures';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const BASE = '/v1';

const app = express();
app.use(cors());
app.use(express.json());

// Serve the OpenAPI spec + Swagger UI.
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8')) as Record<string, unknown>;
app.get('/openapi.yaml', (_req, res) => res.type('text/yaml').sendFile(path.join(__dirname, '..', 'openapi.yaml')));
app.get('/openapi.json', (_req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

// ---- STUB endpoints --------------------------------------------------------
// These return the sample fixtures so the API matches the contract today.
// Replace with Azure Cloud DB queries + Entra ID auth + Ferrus / WordPress
// integrations. Auth/role checks are NOT enforced here yet (POC scaffold).
const r = express.Router();

r.get('/auth/me', (_req, res) => res.json({ id: 'u1', name: 'Guest', email: '', role: 'public' }));

r.get('/directory', (_req, res) => res.json(db.directory));
r.get('/directory/:id', (req, res) => send(res, db.directory.find((m) => m._id === req.params.id)));

r.get('/events', (_req, res) => res.json(db.events));
r.get('/events/:id', (req, res) => send(res, db.events.find((e) => e._id === req.params.id)));

r.get('/meetings', (_req, res) => res.json(db.meetings));

r.get('/transparency/expenditures', (_req, res) => res.json(db.expenditures));
r.get('/transparency/major-projects', (_req, res) => res.json(db.majorProjects));

r.get('/financials', (_req, res) => res.json(db.financials));

r.get('/timekeeping/entries', (_req, res) => res.json(db.timeEntries));

r.get('/polls', (req, res) => {
  const kind = req.query.kind as string | undefined;
  res.json(kind ? db.polls.filter((p) => p.kind === kind) : db.polls);
});
r.get('/polls/:id', (req, res) => send(res, db.polls.find((p) => p._id === req.params.id)));

r.get('/notifications', (_req, res) => res.json(db.notifications));

function send(res: express.Response, value: unknown) {
  if (!value) return res.status(404).json({ message: 'Not found' });
  return res.json(value);
}

// Writes are not implemented in the scaffold — advertise the contract.
r.all(['/directory', '/events', '/meetings', '/polls', '/notifications', '/timekeeping/entries'], (req, res, next) => {
  if (req.method === 'GET') return next();
  return res.status(501).json({ message: `${req.method} ${req.path} not implemented in the stub server — see openapi.yaml`, code: 'NOT_IMPLEMENTED' });
});

app.use(BASE, r);

app.get('/', (_req, res) => res.redirect('/docs'));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Skin Tyee API (stub) on http://localhost:${PORT}  ·  docs at http://localhost:${PORT}/docs`);
});
