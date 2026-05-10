# AGENTS.md — ufabc-next-backend

## 1. Project Overview

TypeScript monorepo (pnpm + Turborepo) running a Fastify REST API for the UFABC Next platform. MongoDB via Mongoose for data, BullMQ on Redis for background jobs. The main app is `apps/core`; shared libraries live in `packages/`. All UFABC academic data (students, components, enrollments, teachers, histories) flows through this service. It receives webhooks from the external `ufabc-parser` scraper service and exposes APIs to the web frontend, Chrome extension, and Discord bot.

---

## 2. Stack and Commands

| Tool | Version |
|---|---|
| Node.js | ^24 |
| pnpm | ^9 (9.15.9) |
| Turborepo | catalog |
| Fastify | ^5 |
| MongoDB / Mongoose | ^8 |
| BullMQ | ^5 |
| Zod | ^3 |
| Lint | oxlint + ultracite |

```bash
# Install dependencies
pnpm install

# Start infrastructure (MongoDB + Redis + LocalStack)
pnpm services:up            # docker compose up -d

# Dev server (all packages, parallel)
pnpm dev

# Build all packages
pnpm build

# Tests (integration, needs Docker for Testcontainers)
pnpm test

# Lint + format
pnpm lint                   # oxlint via ultracite fix

# Type check
pnpm tsc

# Check dependency updates
pnpm deps-check
```

**Single package:**
```bash
cd apps/core && pnpm dev
cd apps/core && pnpm test
```

**Environment setup:**
```bash
cp apps/core/.env.example apps/core/.env.dev
# Fill in: UFABC_PARSER_URL, OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_SECRET,
#          UFABC_PARSER_REQUESTER_KEY, NEXT_AGENT_URL, ALLOWED_ORIGINS
```

---

## 3. Folder Structure

```
apps/core/src/
├── app.ts              # App factory — register v2 controllers here; do not add inline routes
├── server.ts           # Entry point — do not modify
├── constants.ts        # JOB_NAMES, webhook event names — ADD NEW CONSTANTS HERE
├── connectors/         # HTTP clients to external services (ufabc-parser, moodle, sigaa, s3)
├── controllers/        # v2 controllers registered before autoloaded routes
├── errors/             # Typed error classes
├── hooks/              # Fastify lifecycle hooks (jwt-verify, admin, board-authenticate, sessions)
├── jobs/               # BullMQ v2 job definitions — NEW JOBS GO HERE
│   ├── registry.ts     # Register all new jobs here
│   └── utils/          # Shared job utilities
├── lib/                # Service wrappers (AWS, Notion)
├── models/             # Mongoose models — one file per collection
├── plugins/
│   ├── external/       # Third-party Fastify plugins (autoloaded alphabetically)
│   ├── custom/         # App-specific plugins (autoloaded alphabetically)
│   └── v2/             # New infra plugins (redis, queue, aws, test-utils)
├── queue/              # LEGACY queue system — DO NOT ADD NEW JOBS HERE
├── routes/             # @fastify/autoload routes — one folder per resource
│   ├── autohooks.ts    # Global route hooks (JWT verification)
│   └── <feature>/
│       ├── index.ts    # Route handlers only
│       └── service.ts  # DB queries + business logic
├── schemas/            # Zod schemas for request/response validation
├── services/           # Cross-route business logic
└── utils/              # Utilities (logger, aws-client-options, resolve-stats-steps)

packages/
├── common/             # calculateCoefficients, findQuad, currentQuad, identifier
├── db/                 # Shared Mongoose client + HistoryProcessingJob, StudentSync models
├── queues/             # defineJob() JobBuilder — do not modify internals
├── testing/            # Test factories, containers, mocks
└── tsconfig/           # Shared TypeScript configs (apps.json, libs.json)
```

**Workspace imports:**
- `@next/common` — shared utilities
- `@next/db/client` — database plugin
- `@next/db/models` — model types
- `@next/queues/client` — `defineJob()`
- `@next/queues/manager` — JobManager
- `@next/testing` — test helpers
- `@/` — path alias for `apps/core/src/`

---

## 4. Code Patterns

### Route handler — correct

```typescript
// apps/core/src/routes/widgets/index.ts
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { widgetListSchema } from '@/schemas/widgets.js';
import { listWidgets } from './service.js';

const plugin: FastifyPluginAsyncZodOpenApi = async (app) => {
  app.get('/', { schema: widgetListSchema }, async (request, reply) => {
    return listWidgets(request.user.ra);
  });
};

export default plugin;
```

### Route handler — wrong

```typescript
// WRONG: inline DB query in route handler
app.get('/', async (request) => {
  return await WidgetModel.find({ ra: request.user.ra }); // belongs in service.ts
});

// WRONG: legacy type provider
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
// use fastify-zod-openapi instead
```

### Service layer

```typescript
// apps/core/src/routes/widgets/service.ts
import { WidgetModel } from '@/models/Widget.js';

export async function listWidgets(ra: number) {
  return WidgetModel.find({ ra }).lean();
}
```

### v2 Controller (route registered before autoload)

```typescript
// apps/core/src/controllers/widget-controller.ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const widgetController: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: 'GET',
    url: '/widgets/:id',
    schema: {
      params: z.object({ id: z.string() }),
      response: { 200: z.object({ name: z.string() }) },
    },
    handler: async (request, reply) => {
      // handler
    },
  });
};

export default widgetController;
// Then add to routesV2 array in app.ts
```

### New v2 Job

```typescript
// apps/core/src/jobs/widget-processing.ts
import { defineJob } from '@next/queues/client';
import { z } from 'zod';
import { JOB_NAMES } from '@/constants.js';

export const widgetProcessingJob = defineJob(JOB_NAMES.WIDGET_PROCESSING)
  .input(z.object({ widgetId: z.string() }))
  .handler(async ({ job, app }) => {
    const { widgetId } = job.data;
    // use app.db for DB access, app.manager.dispatch() for sub-jobs
    return { processed: true };
  });
```

Then in `constants.ts`:
```typescript
WIDGET_PROCESSING: 'widget_processing',
```

Then in `jobs/registry.ts`:
```typescript
[JOB_NAMES.WIDGET_PROCESSING]: widgetProcessingJob,
```

Dispatch: `await app.manager.dispatch(JOB_NAMES.WIDGET_PROCESSING, { widgetId: '...' })`

### Mongoose model

```typescript
// apps/core/src/models/Widget.ts
import { type InferSchemaType, Schema, model } from 'mongoose';

const widgetSchema = new Schema(
  {
    name: { type: String, required: true },
    ra: { type: Number, required: true },
  },
  { timestamps: true }
);

widgetSchema.index({ ra: 'asc' });

export type Widget = InferSchemaType<typeof widgetSchema>;
export type WidgetDocument = ReturnType<(typeof WidgetModel)['hydrate']>;
export const WidgetModel = model('widgets', widgetSchema);
```

### Admin-only route

```typescript
app.get('/admin-only', {
  preHandler: (request, reply) => request.isAdmin(reply),
  schema: mySchema,
}, async (request) => { ... });
```

### Hook pattern (external session validation)

1. Extend `FastifyRequest` with session type
2. Extract credentials from headers
3. Check cache (LRU or Redis), return early if valid
4. Validate against external service
5. Cache valid session, attach to request context

See `moodle-session.ts` (LRU cache) and `sigaa-session.ts` (Redis) for examples.

---

## 5. Database Access Rules

- **Never** query MongoDB directly in route `index.ts` — always extract to `service.ts`
- **Always** call `.lean()` on read queries that don't need Mongoose document methods
- **Always** define indexes in the schema file alongside the model — not in separate scripts
- **Use** `findOneAndUpdate({ ...query }, { $set: data }, { new: true })` for upserts
- **Never** use `await Model.find()` without `.limit()` on large collections (`enrollments`, `histories`)
- Models accessed via `app.db` in jobs (decorated by `@next/db`); import directly in services
- Enable container reuse in `.testcontainer.properties`: `testcontainers.reuse.enabled=true`

---

## 6. Test Requirements

- Integration tests live in `apps/core/tests/integration/`
- Tests use **real MongoDB and Redis** via Testcontainers — **never mock the database**
- Use `startTestStack()` from `@next/testing` for isolated infrastructure
- Queue workers skip automatically when `NODE_ENV=test`
- Test factories are in `packages/testing/src/factories.ts`

```bash
# Run all tests
pnpm test

# Run single test file
cd apps/core && pnpm test tests/integration/components/list.spec.ts
```

**What must be tested:**
- All new route handlers (happy path + 400/404 cases)
- Job handlers that mutate data
- Business logic with branching conditions

---

## 7. Build and Pre-Commit Checklist

```bash
pnpm tsc       # 0 errors required
pnpm lint      # 0 errors required
pnpm build     # all packages must succeed
pnpm test      # integration tests must pass
```

CI runs: build → lint → tsc (`.github/workflows/ci.yml`). Tests not yet in CI.

**Docker build (for deployment verification):**
```bash
docker build --secret id=env,src=.env -f ./Dockerfile . -t ufabc-next:latest
```

---

## 8. Environment Variables

**Required (no defaults — app fails to start without these):**
| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `UFABC_PARSER_URL` | Base URL of ufabc-parser service |
| `UFABC_PARSER_REQUESTER_KEY` | Auth key for ufabc-parser API calls |
| `NEXT_AGENT_URL` | Agent service URL |
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `OAUTH_GOOGLE_SECRET` | Google OAuth2 secret (min 16 chars) |
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |

**Optional (have defaults — review before prod):**
| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | hardcoded dev value | **MUST change in prod** |
| `WEBHOOK_API_KEY` | `webhook-api-key` | **MUST change in prod** |
| `MONGODB_CONNECTION_URL` | `mongodb://127.0.0.1:27017/ufabc-matricula` | |
| `REDIS_CONNECTION_URL` | `redis://localhost:6379` | |
| `USE_LOCALSTACK` | `true` | Set `false` in prod |
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` | Local AWS only |
| `AWS_BUCKET` | `ufabc-next` | |
| `PORT` | `5000` | |
| `BACKOFFICE_EMAILS` | — | Comma-separated admin emails |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | — | Skip for local dev |
| `NOTION_INTEGRATION_SECRET`, `NOTION_DATABASE_ID` | dev values | For help form |
| `UFABC_PARSER_WEBHOOK_SECRET` | — | HMAC validation (optional) |

**To add a new env var:** add to `configSchema` Zod object in `apps/core/src/plugins/external/config.ts`, then update `apps/core/.env.example`.

---

## 9. Absolute Rules

**NEVER:**
- Add new jobs to `apps/core/src/queue/` — legacy system; use `apps/core/src/jobs/` with `defineJob()`
- Mock MongoDB or Redis in tests — use Testcontainers with real instances
- Add raw DB queries in route `index.ts` files — always extract to `service.ts`
- Remove or alter Mongoose indexes without understanding query patterns
- Use `any` — use `unknown` with type guards or proper interfaces
- Skip `withConnection()` wrapper when defining legacy `QUEUE_JOBS`
- Call `app.job.dispatch()` for new functionality — use `app.manager.dispatch()` (v2)
- Add barrel files (index files that re-export everything)
- Use spread syntax in accumulators inside loops

**ALWAYS:**
- Use `.js` extensions in TypeScript imports (`import { foo } from './bar.js'`)
- Use `@/` alias for imports within `apps/core/src`
- Export `<Name>Model`, `type <Name>`, `type <Name>Document` from each model file
- Register new job names in `constants.ts` (JOB_NAMES) AND `jobs/registry.ts`
- Define Zod schemas in `schemas/` — not inline in route handlers
- Use `const` by default; `let` only when reassignment needed; never `var`
- Use `async/await` over promise chains
- Use `for...of` over `.forEach()` and indexed `for` loops
- Call `.lean()` on read-only Mongoose queries
- Use `unknown` with type narrowing over `any`

---

## 10. Critical Flows — Do Not Break

| Flow | Location | Risk |
|---|---|---|
| Google OAuth2 login | `routes/login/index.ts` | All users locked out |
| Webhook receiver | `controllers/ufabc-parser-webhook-controller.ts` | All component/student sync stops |
| Webhook idempotency | same file (Redis TTL check) | Duplicate job dispatches corrupt data |
| Component upsert | `jobs/components-processing.ts` | Components stale; teacher links broken |
| Enrollment upsert | `jobs/enrollments-processing.ts` | Student grade history corrupted |
| Student sync | `jobs/student-sync-processing.ts` | History and coefficients stop updating |
| JWT auth hook | `routes/autohooks.ts` | All authenticated endpoints fail |
| Plugin order in `app.ts` | `buildApp()` | Config must load before DB/Redis/Queue or startup fails |
| Levenshtein teacher match | `jobs/components-processing.ts` | New teachers silently unlinked from components |

---

## 11. Ecosystem Context

| Repo | Language | Role | Relationship |
|---|---|---|---|
| `ufabc-next-backend` (this) | TypeScript | Central API + job processor | — |
| `ufabc-next-web` | TypeScript | React/Next.js frontend | Consumes all authenticated endpoints |
| `ufabc-next-extension` | Vue | Chrome extension | Calls `/sync/enrolled`, `/entities/*` for student sync |
| `ufabc-next-server` | JavaScript | Legacy Node.js API | Predecessor; being superseded by this repo |
| `next-discord-bot` | Python | Discord bot | Consumes `/public/*` endpoints |
| `ufabc-next-tf-modules` | HCL | Infrastructure as code | Provisions AWS resources (S3, SES, etc.) used here |
| `ufabc-parser` (external) | — | UFABC scraper | Sends webhooks here; this API calls it for component/student data |

---

## 12. Contributing Workflow and PR Requirements

1. Branch from `main`
2. Make changes; follow all patterns in section 4
3. Run full checklist: `pnpm tsc && pnpm lint && pnpm build`
4. Add or update integration tests
5. Run `pnpm test`
6. Open PR against `main`
7. CI must pass (build + lint + tsc)

**PR requirements:**
- No `@ts-ignore` without an inline comment explaining why
- New endpoints must have Zod schemas in `schemas/`
- New models must have indexes defined in the schema file
- New jobs registered in both `constants.ts` and `jobs/registry.ts`
- No `.only` or `.skip` in committed test files

---

## 13. Debugging Protocol

### When tests fail
1. `pnpm services:up` — verify MongoDB, Redis, LocalStack running
2. Ensure `apps/core/.env.dev` exists with required vars
3. Run single test: `cd apps/core && pnpm test path/to/test.spec.ts`
4. Verify `testcontainers.reuse.enabled=true` in `.testcontainer.properties`
5. `docker compose down -v && pnpm services:up` if containers are corrupted

### When build fails
1. `pnpm install` to ensure workspace links are correct
2. `pnpm tsc` for detailed TypeScript errors
3. `rm -rf apps/core/dist && pnpm build` for clean build

### When runtime fails
1. Check ports 5000, 27017, 6379 are free
2. `docker ps` to confirm containers running
3. `docker compose logs [service-name]` for container errors

---

## 14. Code Quality (Ultracite/Biome)

Biome enforces formatting and linting. Most issues are auto-fixed:

```bash
pnpm dlx ultracite fix    # fix all fixable issues
pnpm dlx ultracite check  # check without fixing
```

Focus manual review on: business logic correctness, meaningful naming, architecture decisions, edge case handling, and accessibility.
