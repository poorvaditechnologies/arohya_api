# Arohya Capital API — Build Log

Build started: 2026-10-22

## Phase 1 — Foundation (2026-10-22)

### Files created
- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`
- `.env` (real Neon DATABASE_URL + dev secrets, NOT committed), `.env.example` (placeholders only), `.gitignore`
- `prisma/schema.prisma` — all 15 models from guide section 4 (User, UserConsent, OtpChallenge,
  RefreshSession, FinancingProduct, Application, ApplicationAddress, ApplicationTimeline,
  LoanFacility, UserPreference, SupportChannel, RelationshipManager, CallbackRequest,
  Notification, AuditEvent), plus enums.

### Non-obvious decisions documented in-code (see schema.prisma comments)
1. `User.failedOtpAttempts`, `accountStatus`, `lockedUntil` added — needed to implement the
   guide's explicit 423 ACCOUNT_LOCKED behavior (deviation note #3). N = 5 failed OTP verify
   attempts triggers a 15-minute lock (`OTP_MAX_VERIFY_ATTEMPTS=5`, `OTP_LOCKOUT_MINUTES=15` in .env).
2. `User.pan` has a DB-level `@unique` constraint — enforces deviation note #2
   (PAN_ALREADY_REGISTERED 409).
3. `OtpChallenge.otpHash` stores only an argon2 hash, never the plaintext OTP — per guide's
   "Important" notes under endpoint 1 (never log/return/persist the OTP in prod).
4. `RefreshSession.tokenHash` stores only an argon2 hash of the refresh token (rotating hashed
   refresh tokens per stack requirement). `replacedBySessionId` added to support rotation/reuse
   detection.
5. `Application.requestedAmount` is nullable — see deviation note #1 below (gap between
   POST /applications request, which has no requestedAmount field, and GET responses, which do).
   Decision: stays null at submission; to be populated by a later underwriting step. No
   fabricated amount is invented.
6. `OtpChallenge.requestIp` added to support "rate-limit OTP generation by email and IP" from
   the guide — not an explicit model field in guide section 4 but required by the explicit
   behavioral requirement in endpoint 1.

### Verification
- `npm install` — succeeded, 766 packages installed (some deprecation warnings, no install errors).
- `npx prisma migrate dev --name init --skip-seed` — ran against the REAL Neon Postgres
  instance given in the task (ep-dry-river-b5h4ig3g-pooler...neon.tech/neondb). Output:
  `Applying migration 20261022125709_init` ... `Your database is now in sync with your schema.`
  Migration file committed at `prisma/migrations/20261022125709_init/migration.sql`.
- Verified live DB state by running a one-off Node script with `@prisma/client` querying
  `information_schema.tables`: confirmed all 15 application tables + `_prisma_migrations`
  exist in the `neondb` public schema on Neon.

Next: Nest+Fastify app bootstrap, global envelope/exception filter, request-id middleware, Swagger.

## Phase 1b — Nest/Fastify bootstrap + global plumbing (2026-10-22)

### Files created
- `src/main.ts` — Fastify adapter bootstrap, global prefix `api/v1`, global ValidationPipe,
  global `HttpExceptionFilter`, global `ResponseEnvelopeInterceptor`, Swagger at `/api/docs`.
- `src/common/filters/http-exception.filter.ts`, `src/common/interceptors/response-envelope.interceptor.ts`
  — implement the guide's exact success/error envelope shapes.
- `src/common/errors/app.exception.ts`, `error-codes.ts` — typed domain exceptions carrying
  (field, code, message) triples.
- `src/common/middleware/request-context.middleware.ts` — generates `req_<ulid>` request ids
  and resolves en/kn language from `Accept-Language`.
- `src/common/i18n/*` — minimal en/kn dictionary + `I18nService`.
- `src/common/dto/pagination-query.dto.ts` — shared page/limit DTO + `buildPagination()`.
- `src/common/decorators/{lang,current-user}.decorator.ts`.
- `src/database/prisma.{service,module}.ts`, `src/security/{hash,id}.service.ts` + `security.module.ts`.

### Bug found and fixed during verification
Initially wired request-id/lang resolution as an Express-style `app.use()` middleware. On
Fastify, `app.use()` hands middleware the raw Node `IncomingMessage`, which is a **different
object** from the `FastifyRequest` that `ExecutionContext.getRequest()` returns inside
controllers/guards/filters — so `req.requestId` set in the middleware never appeared later,
and the error envelope's `requestId` came out as a fallback `"req_unknown"`. Fixed by
registering a Fastify `onRequest` hook via `app.getHttpAdapter().getInstance().addHook(...)`
instead, which runs on the real `FastifyRequest` instance. Verified with curl afterward —
`requestId` in the error envelope now matches the `X-Request-Id` response header.

### Verification
- `npx nest build` — compiled with zero errors.
- Started the compiled app (`node dist/main.js`) against the real Neon DB and curled it:
  - `POST /api/v1/generate-otp` (signUp) → 200, exact contract shape incl. dev-only `debugOtp`.
  - `POST /api/v1/sign-up` with that OTP → 201, exact contract shape (accessToken/refreshToken/
    user with panMasked, kycStatus "pending").
  - `POST /api/v1/generate-otp` (login) + `POST /api/v1/login` → 200, exact contract shape.
  - `POST /api/v1/auth/refresh-token` → 200, new rotated token pair.
  - `POST /api/v1/auth/logout` (Bearer auth) → 200, `{ success:true, message, data:null }`.
  - Error path: bad `otpRequestId` → 400 `OTP_REQUEST_MISMATCH` with exact error envelope
    including a real `req_...` requestId.
  - Missing bearer token on `/auth/logout` → 401 `UNAUTHORIZED` envelope.
  - `Accept-Language: kn` on an error path → Kannada message returned, code unchanged.
  - `GET /api/docs` → 200 (Swagger UI); `GET /api/docs-json` → 200 with all 5 auth paths listed.
- Confirmed in Neon (via Prisma) that the new user row, its `UserConsent`, `OtpChallenge`
  (CONSUMED), and rotated `RefreshSession` rows were all persisted correctly.

### Decisions worth noting
- Email format validation for `/generate-otp` is done with a manual regex in `AuthService`
  (not `@IsEmail()` on the DTO) so the exact `INVALID_EMAIL` code from the guide is returned
  instead of a generic class-validator `VALIDATION_FAILED`. Same approach for PAN format in
  sign-up (`INVALID_PAN`).
- Two independent OTP failure counters: `OtpChallenge.attemptsRemaining` (429
  `TOO_MANY_ATTEMPTS` when a single challenge's attempts are exhausted) vs.
  `User.failedOtpAttempts` (423 `ACCOUNT_LOCKED` after 5 consecutive failed verifications
  across challenges, 15-minute lockout). See long comment above
  `AuthService.verifyOtpOrFail`.
- Refresh tokens are JWTs carrying `{ sub, sid }` where `sid` is the `RefreshSession.id`, so a
  session can be loaded in O(1); the raw token is additionally argon2-hashed and stored as
  `RefreshSession.tokenHash` as defense-in-depth against DB leaks, and rotation revokes the old
  session row and mints a new one.
- Entity-provided User/Application/Notification/LoanFacility/CallbackRequest ids are generated
  by the app (`usr_`, `application_`, `notification_`, `facility_`, `callback_` prefixes via
  `IdService`, using ulid) instead of Prisma's default `cuid()`, to match the guide's example id
  shapes.

### Fixed path bug
`nest build` (with `sourceRoot: "src"` in nest-cli.json) emits to `dist/src/main.js`, not
`dist/main.js`. Updated `package.json`'s `start`/`start:prod` scripts to `node dist/src/main`
and verified the corrected path actually launches.

## Phase 2 — Catalog + Applications (2026-10-22)

### Files created
- `src/modules/financing-solutions/{financing-solutions.module,controller,service}.ts`,
  `dto/query-financing-solutions.dto.ts` — GET /financing-solutions (public, no auth —
  the guide does not mark endpoint 6 "Protected"), with `applicationEnabled`/`category`/
  `page`/`limit` filters, `active:true` only, sorted by `sortOrder`.
- `src/modules/applications/{applications.module,controller,service}.ts`,
  `dto/create-application.dto.ts` — POST/GET /applications, GET /applications/{id}.
- `src/common/utils/application-status.util.ts` — status/timeline-status wire+label mappers
  and the 4 fixed tracker steps (Application Submitted / Syndicate Underwriting / Document
  Verification / Final Decision) shared by every product type (loans, SHCG, insurance alike).
- `prisma/seed.ts` — full seed script (see below).

### GAP #1 implementation (requestedAmount)
`CreateApplicationDto` has no `requestedAmount` field (matches the guide's POST body exactly).
`ApplicationsService.submit()` sets `requestedAmount: null` explicitly with an inline comment
explaining the decision: we never fabricate an amount from the product's `amountLabel` range,
since the guide forbids invented underwriting/amount logic. `requestedAmount` is populated only
by a real later underwriting step (none exists yet, by design) — GET responses correctly show
`null` for a freshly submitted application and a real number for the seeded "underwriting"
demo application.

### Ownership-check decision
`ApplicationsService.detail()` returns 404 RESOURCE_NOT_FOUND for a nonexistent id and 403
ACCESS_DENIED (not 404) when the application exists but belongs to a different user — the
guide's own status-code table lists both 403 "Access denied" and 404 "Resource not found" as
distinct cases, so this is treated as a deliberate choice rather than ambiguity.

### Seed script (prisma/seed.ts)
Seeds, against the real Neon DB:
1. All 8 financing products verbatim from guide endpoint 6.
2. 1 RelationshipManager + 3 SupportChannel rows verbatim from guide endpoint 14.
3. One demo User `rajesh.gowda@example.com` (id `usr_demo_rajesh`) with UserConsent,
   UserPreference, KYC already VERIFIED, GSTIN/AA fields populated (clearly seed/dev fixtures,
   not runtime-fabricated data) — plus one demo Application (`underwriting`, matches guide
   endpoint 8/9 example exactly), one demo LoanFacility ("Working Capital Line", matches
   endpoint 11 example), one demo Notification (matches endpoint 16 example).
4. A pre-created LOGIN `OtpChallenge` for the demo user with OTP `123456`, printed once to the
   console at the end of the seed run, so `/login` can be exercised immediately without a live
   `/generate-otp` round-trip. Demo credentials also recorded in the FINAL section of this file.

### Verification
- `npx nest build` — one real bug caught: `sameAsPermanent` was being set twice (explicit +
  object spread) in `ApplicationsService.submit()` (TS2783) — fixed by removing the duplicate.
  Clean build afterward.
- `npx prisma db seed` — ran against the real Neon DB; console output confirmed all seed steps
  and printed the demo OTP/otpRequestId.
- Started `node dist/src/main.js` and curled:
  - `GET /financing-solutions` → 200, `initialVisibleCount: 5`, all 8 products in `sortOrder`,
    exact field set.
  - `GET /financing-solutions?category=insurance` → 200, correctly filtered to just
    "Insurance".
  - Logged in as the demo user with the pre-seeded OTP → 200, correct user payload
    (kycStatus "verified").
  - `POST /applications` (Home Loan, demo user) → 201, exact contract shape, `applicationNumber
    "ARH10002"`, `requestedAmount` correctly absent from the request and `null` in later reads.
  - `GET /applications?page=1&limit=20` → 200, both the new submission (`requestedAmount: null`)
    and the seeded underwriting demo application (`requestedAmount: 2500000`) returned with
    correct pagination meta.
  - `GET /applications/application_demo_01` as the owner → 200, full timeline with
    completed/active/pending steps.
  - Same URL as a *different* logged-in user (phase2.tester) → 403 `ACCESS_DENIED`.
  - `GET /applications/does_not_exist` → 404 `RESOURCE_NOT_FOUND`.
- Confirmed in Neon that the new application, its two `ApplicationAddress` rows, and its 4
  `ApplicationTimeline` rows were persisted.

Next: dashboard, loan-facilities, profile (+preferences), support (+callback-requests), notifications.

## Phase 3 — Remaining endpoints (2026-10-22)

### Files created
- `src/modules/users/{users.module,controller,service}.ts`, `dto/update-preferences.dto.ts`
  — GET /profile, PATCH /profile/preferences.
- `src/modules/dashboard/{dashboard.module,controller,service}.ts` — GET /dashboard.
- `src/modules/loan-facilities/{loan-facilities.module,controller,service}.ts` —
  GET /loan-facilities.
- `src/modules/support/{support.module,controller,service}.ts`,
  `dto/create-callback-request.dto.ts` — GET /support, POST /support/callback-requests.
- `src/modules/notifications/{notifications.module,controller,service}.ts` —
  GET /notifications, PATCH /notifications/{id}/read.
- `src/app.module.ts` updated to wire all 9 feature modules together. All 17 endpoints from
  the guide are now mapped (confirmed via Nest's route-mapping startup log).

### Decisions worth noting
- Dashboard `tierLabel` ("Fiduciary Tier 1 Verified" etc.) is a presentation label derived
  purely from the real `kycStatus` enum already stored on the user — not a fabricated
  bureau/underwriting tier. See `TIER_LABEL` map in `dashboard.service.ts`.
  `activeApplication` is the most recently updated application in a non-terminal status
  (SUBMITTED/UNDERWRITING/DOCUMENT_VERIFICATION/APPROVED); returns `null` (never a fabricated
  placeholder) when the user has none.
  `unreadNotificationCount` is a real DB count.
- `LoanFacilitiesService.list()` has a comment making the "no fake facilities" rule explicit:
  it only ever reflects real `LoanFacility` rows for that user — nothing is synthesized.
- Notifications `PATCH /:id/read` reuses the same 403 (wrong owner) vs 404 (no such row)
  distinction as applications.
- Support config (`GET /support`) treats `RelationshipManager`/`SupportChannel` as global
  (not per-user) config rows, matching the guide's framing ("so phone numbers... can change
  without an app update") rather than a user-specific support assignment.

### Verification
- `npx nest build` — two real type errors caught and fixed in `dashboard.service.ts`
  (an `ApplicationStatus[]` vs `string[]` mismatch on the Prisma `in` filter, surfaced because
  the `as unknown as string[]` cast was wrong) — fixed by typing `ACTIVE_STATUSES` as
  `ApplicationStatus[]` directly. Clean build afterward.
- Started `node dist/src/main.js` against the real Neon DB; Nest's startup log confirmed all 17
  routes are mapped. Curled every new endpoint as the seeded demo user
  (`rajesh.gowda@example.com`):
  - `GET /dashboard` → 200, exact shape, `activeApplication` correctly picked the freshly
    submitted Home Loan application (status "submitted"), `unreadNotificationCount: 1`.
  - `GET /loan-facilities` → 200, returns the one real seeded facility with exact field set.
  - `GET /profile` → 200, exact shape incl. `gstinMasked: "AAACB****F1Z5"` matching the guide's
    own example exactly.
  - `PATCH /profile/preferences` `{biometricEnabled:false}` → 200, `{biometricEnabled:false}`.
  - `GET /support` → 200, RM + 3 channels, exact field set and ordering.
  - `POST /support/callback-requests` → 201, exact shape.
  - `GET /notifications` → 200, `unreadCount:1`, exact shape.
  - `PATCH /notifications/notification_demo_01/read` → 200, `{id, read:true}`.
  - Ownership: logged in as a second user (`phase2.tester@example.com`, no seed data) and
    confirmed: `GET /loan-facilities` → 200 with `items: []` (empty, NOT fabricated — proves
    the "no fake facilities" rule); `GET /dashboard` → `activeApplication: null`,
    `unreadNotificationCount: 0`; `PATCH /notifications/notification_demo_01/read` (someone
    else's notification) → 403 `ACCESS_DENIED`.
- Confirmed in Neon that the new `CallbackRequest` row and the notification's `read=true`
  update were persisted.

Next: automated tests (e2e + unit), README, Dockerfile/docker-compose, final Swagger check.

## Phase 4 — Tests (2026-10-22)

### Files created
- `src/modules/auth/auth.service.spec.ts` — unit tests for `AuthService`: email/format validation,
  rate limiting, ACCOUNT_NOT_FOUND / ACCOUNT_ALREADY_EXISTS, OTP verification failure path,
  account lockout after N failed attempts, lockout rejection + auto-unlock after cool-down,
  successful login token issuance. 17 assertions total across auth+applications unit specs.
- `src/modules/applications/applications.service.spec.ts` — unit tests for `ApplicationsService`:
  unknown/inactive product → 404, applicationEnabled=false → 422, requestedAmount stays null at
  submission (GAP #1), ownership 404 vs 403, timeline mapping for the owner.
- `test/utils/test-app.ts` — shared e2e bootstrap (same global pipes/filters/interceptors/hooks
  as `src/main.ts`), driving the real Fastify instance with supertest.
- `test/auth.e2e-spec.ts` — full auth flow against the real Neon DB: generate-otp(signUp) →
  sign-up → generate-otp(signUp) again now 409 → generate-otp(login) → login with wrong OTP
  (400) → login with right OTP → refresh-token (rotation) → old token rejected → profile
  requires bearer → logout.
- `test/applications.e2e-spec.ts` — catalog + submit → list → detail → cross-user 403 →
  empty loan-facilities for a brand-new user, against the real Neon DB.
- `test/jest-e2e.json` — e2e Jest config (30s `testTimeout`, since each test makes several
  real network round trips to Neon plus argon2 hashing).

### Environment issue found and fixed
Node v25.2.0 (installed on this machine) makes the global `localStorage` accessor throw
`SecurityError: Cannot initialize local storage without a --localstorage-file path` unless a
backing file is given — `jest-environment-node` touches that global while setting up the test
environment, so every Jest run failed immediately with no tests executed. Fixed by adding
`NODE_OPTIONS="--localstorage-file=/tmp/arohya-jest-localstorage"` to the `test`/`test:watch`/
`test:cov`/`test:e2e` npm scripts, and running with `--runInBand` (parallel workers were
opening/locking the same localStorage SQLite backing file, causing a separate "database is
locked" failure). This is purely a Node-version/Jest-tooling quirk, unrelated to the
application code, and is documented in the README's Testing section too.

### Other bugs fixed while writing tests
- `import * as request from 'supertest'` fails to compile/typecheck under this project's
  `esModuleInterop`+strict TS settings ("this expression is not callable") — fixed to a default
  import (`import request from 'supertest'`).
- Default Jest 5s test timeout was too short for e2e tests making several sequential real
  network round-trips to the Neon pooler plus argon2id hashing (sign-up alone does 2 OTP
  hashes + 1 refresh-token hash + several queries) — raised to 30s via `testTimeout` in
  `jest-e2e.json` rather than mocking the DB away, since the whole point of these e2e tests is
  to exercise the real database end-to-end.

### Verification
- `npm test` → **17/17 unit tests passed** (`auth.service.spec.ts`, `applications.service.spec.ts`).
- `npm run test:e2e` → **17/17 e2e tests passed** against the real Neon DB, in two full runs
  after the timeout fix (both auth.e2e-spec.ts and applications.e2e-spec.ts green,
  ~50s total wall time). Confirmed no leftover Node/Jest processes after the run
  (`ps aux | grep jest` empty).

Next: Dockerfile, docker-compose.yml, README.md, final Swagger / docker-compose-build check.

## Phase 5 — Docker, README, final checks (2026-10-22)

### Files created
- `Dockerfile` — 4-stage build (deps → build/`prisma generate`+`nest build` → prod-deps →
  runtime), copies the generated `.prisma`/`@prisma` client output and `prisma/` (for
  migrations/seed) into a slim `node:20-bookworm-slim` runtime image, `CMD node dist/src/main.js`.
- `.dockerignore` — excludes `node_modules`, `dist`, `.git`, and **`.env`** from the build
  context so the real credential is never baked into an image layer.
- `docker-compose.yml` — single `api` service, `env_file: .env`, port 3000. No local Postgres
  service is defined — intentional, since the task targets the one real Neon database
  throughout rather than a disposable local one; swap `DATABASE_URL` to point elsewhere if
  needed.
- `README.md` — setup/run/test instructions, demo credentials, full list of deviations
  (mirrors this file's decisions, condensed for a first-time reader).
- `.eslintrc.js`, `.prettierrc` — minimal lint/format config matching the `lint`/`format`
  scripts already in `package.json`.
- `src/main.ts` — wired up `@fastify/helmet` (was an installed-but-unused dependency from the
  initial scaffold) for baseline security response headers; CSP disabled since Swagger UI
  needs inline scripts/styles that a default CSP would block.

### Verification
- `npx nest build` — clean after the helmet change (one real TS error fixed: `@fastify/helmet`'s
  bundled Fastify types structurally conflict with `@nestjs/platform-fastify`'s own vendored
  Fastify types — a known duplicate-types friction point in the Fastify plugin ecosystem; cast
  to `any` at the `app.register` call site, which is the standard workaround, with a comment
  explaining why).
- Ran the compiled app again and curled `/api/docs`: helmet response headers present
  (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, etc.), Swagger UI
  still renders (200), `/financing-solutions` still 200 — no regression.
- `GET /api/docs-json` → confirmed **all 17 operations across 16 paths** are registered
  (`/applications` carries both `GET` and `POST`).
- Re-ran the full test suite after the helmet change: `npm test` → 17/17 unit tests pass;
  `npm run test:e2e` → 17/17 e2e tests pass against the real Neon DB.
- `docker compose config` → validated: resolves the Dockerfile path, env vars (incl. the real
  `DATABASE_URL` from `.env`), and port mapping correctly with no errors.
- **`docker compose build` could NOT be executed in this environment.** Docker Desktop
  (already installed on this machine) was started programmatically (`open -a Docker`), but its
  backend process repeatedly failed to come up: its own logs
  (`~/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log`) show an
  error dialog that required an interactive "Quit" action, plus repeated `context deadline
  exceeded` timeouts reaching `desktop.docker.com` (update/telemetry endpoints) — i.e. Docker
  Desktop needs GUI interaction and outbound network access this non-interactive sandboxed
  session doesn't have. `docker info` never returned successfully after ~15+ minutes of
  waiting/retrying across multiple attempts.
  - **Mitigation / why this doesn't block confidence in the Dockerfile**: every command the
    Dockerfile runs (`npm install`, `npx prisma generate`, `npm run build` i.e. `nest build`,
    `node dist/src/main.js`) was already run and verified directly on the host in earlier
    phases, against the same `package.json`/`prisma/schema.prisma`/`dist` output. The
    Dockerfile was reviewed stage-by-stage for correctness (asset copying, `.dockerignore`
    correctly excluding `.env`, multi-stage layering), and `docker compose config` confirms the
    compose file itself is well-formed. Building/running the actual image remains unverified
    and should be the first thing checked in an environment with a working Docker daemon.

Next: none — see FINAL section below.

---

# FINAL

## What was built
A complete, runnable NestJS + Fastify backend for Arohya Capital implementing all 17 endpoints
from `Arohya_Claude_Build_Guide.md` under `/api/v1`, with exact request/response envelopes,
status codes, and field names; Prisma schema with all 15 guide models (+ documented additions)
migrated onto the real Neon Postgres database; a seed script seeding the 8-product catalog,
support config, and a demo user; JWT auth with rotating hashed refresh tokens and hashed email
OTP with lockout; ownership checks; en/kn localization; pagination; Swagger at `/api/docs`;
unit + e2e tests (34 total, all passing against the real DB); Dockerfile + docker-compose.yml
(build verification blocked by sandbox/Docker Desktop limitations — see Phase 5 above).

## Run it
```bash
npm install
npx prisma migrate deploy   # against DATABASE_URL in .env
npm run prisma:seed
npm run build
npm run start                # or: npm run start:dev
# Swagger UI: http://localhost:3000/api/docs
```

## Test it
```bash
npm test          # unit tests, no network
npm run test:e2e  # e2e tests against the real Neon DB
```

## Demo credentials
- Email: `rajesh.gowda@example.com`
- Run `npm run prisma:seed` to (re-)create a LOGIN `OtpChallenge` with OTP `123456`
  (`otpRequestId` printed to the console at the end of the seed run).
- If that specific challenge has already been consumed/expired, call
  `POST /api/v1/generate-otp` with `{"email":"rajesh.gowda@example.com","purpose":"login"}` —
  in development/test mode (`NODE_ENV` ≠ `production`) the response includes a `debugOtp`
  field with the real one-time code.
- This user already has `kycStatus: verified`, a seeded in-progress application (`ARH10294`),
  a seeded active loan facility ("Working Capital Line"), and a seeded notification, so every
  endpoint is immediately exercisable after seeding.

## Deliberate deviations (reasons)
See the "Deliberate deviations from the guide" section of `README.md` for the full list with
rationale: (1) `requestedAmount` null-until-underwriting, (2) PAN uniqueness +
`PAN_ALREADY_REGISTERED`, (3) dual OTP-failure counters (`TOO_MANY_ATTEMPTS` vs
`ACCOUNT_LOCKED`, N=5, 15 min cooldown), (4) app-generated prefixed ids instead of Prisma
`cuid()`, (5) no fabricated data anywhere (empty facilities list, null `activeApplication`,
null GSTIN/AA fields until real verification), (6) 403 vs 404 ownership-check distinction,
(7) custom regex-based `INVALID_EMAIL`/`INVALID_PAN` codes instead of generic validation
errors, (8) `debugOtp` gated to non-production `NODE_ENV` in code, not just convention.
Additionally: Docker image build/run was not verified end-to-end in this sandbox because
Docker Desktop's daemon could not start here (see Phase 5); the Dockerfile/compose files are
otherwise complete and statically validated.

## Phase 6 — File storage extension (S3, presigned URLs) (2026-10-22)

**Scope note:** this phase is *not* part of `Arohya_Claude_Build_Guide.md`'s original
17-endpoint contract. It was agreed with the user directly in conversation: add AWS
S3-backed file storage (avatars, application documents, and a reusable generic mechanism)
on top of the existing API, following the same conventions (response envelope, error
shape, ownership checks, Swagger style) established in Phases 1–5.

### What was added
- `src/config/configuration.ts` — typed `aws: { accessKeyId, secretAccessKey, region,
  bucketName }` block, read from `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`/
  `AWS_BUCKET_NAME` via the existing `ConfigService` pattern. `.env.example` got matching
  placeholder entries (never real values).
- `prisma/schema.prisma` — new polymorphic `Attachment` model (`ownerType`: `USER_AVATAR` |
  `APPLICATION_DOCUMENT`, `ownerId`, `uploadedByUserId`, `s3Key` (unique), `originalFilename`,
  `mimeType`, `sizeBytes`, `status`: `PENDING` | `CONFIRMED`, `uploadedAt`, `confirmedAt`) plus
  `User.avatarAttachmentId` (nullable pointer to the user's current avatar attachment).
  Migration `20261022140017_add_attachments_and_avatar` created with `prisma migrate dev` and
  applied to the real Neon DB (confirmed via `prisma migrate status` → "Database schema is up
  to date!").
- `src/modules/files/` — new module:
  - `storage.service.ts` — thin wrapper around `@aws-sdk/client-s3` +
    `@aws-sdk/s3-request-presigner` (`createPresignedPutUrl`, `createPresignedGetUrl`,
    `headObject`, `deleteObject`). Kept separate from business logic so tests can mock just
    the AWS SDK boundary.
  - `files.service.ts` — all business logic: mime/size allow-list validation, ownership
    checks, the upload-url/confirm/delete flow, plus `getAvatarUrl(userId)` and
    `getApplicationDocuments(applicationId)` helpers consumed by `UsersService` and
    `ApplicationsService`.
  - `files.controller.ts` — `POST /files/upload-url`, `POST /files/{attachmentId}/confirm`,
    `DELETE /files/{attachmentId}`, all `@UseGuards(JwtAuthGuard)` + full Swagger
    (`@ApiOperation`/`@ApiResponse` with example envelopes) matching the existing style.
  - `dto/create-upload-url.dto.ts` — validated request body (`ownerType` in
    `['user_avatar','application_document']`, `filename`, `mimeType`, optional `sizeBytes`
    capped at 10MB via `@Max`).
- Wired `FilesModule` into `AppModule`, and into `UsersModule`/`ApplicationsModule` (both now
  import it) so:
  - `GET /profile` returns `avatarUrl` — a presigned GET URL regenerated on every call
    (never stored), or `null` if the user has no confirmed avatar.
  - `GET /applications/{id}` returns a `documents` array of that application's *confirmed*
    attachments, each with its own presigned GET URL.
- `src/common/errors/error-codes.ts` — new codes: `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`,
  `ATTACHMENT_NOT_FOUND`, `UPLOAD_NOT_FOUND_IN_S3`, `ATTACHMENT_ALREADY_CONFIRMED`.
- Tests: `src/modules/files/storage.service.spec.ts` (mocks `S3Client`/`getSignedUrl`),
  `src/modules/files/files.service.spec.ts` (mocks Prisma + the storage service; covers
  validation, ownership, avatar-pointer swap, confirm/delete flows), and
  `test/files.e2e-spec.ts` (full upload-url → confirm → delete e2e against the real Neon DB,
  with the AWS SDK mocked — see design decision below). Updated
  `applications.service.spec.ts`'s constructor call for the new `FilesService` dependency.
- `README.md` — new S3 env vars section and a "File storage (S3)" section describing the
  upload flow for the Flutter/mobile team. `BUILD_LOG.md` (this entry).

### Design decisions ("your call" items, documented per the task)
1. **Presigned PUT, not presigned POST policy.** A single signed PUT URL is simpler for a
   Flutter client (one `http.put(bytes)` call) than constructing a multipart POST with a
   policy-document's conditions array. The tradeoff — S3 doesn't enforce size/content-type on
   a bare presigned PUT the way a POST policy can — is covered by validating
   mimeType/declared-size at `upload-url` time AND re-validating the real object's
   `Content-Length`/type via an S3 `HEAD` request at `confirm` time, so a client that lies in
   the initial request is still caught before the attachment is marked `confirmed`.
2. **Mocking the AWS SDK in automated tests, not hitting the real bucket.** Both the Jest
   unit tests and `test/files.e2e-spec.ts` mock `@aws-sdk/client-s3`'s `S3Client` and
   `@aws-sdk/s3-request-presigner`'s `getSignedUrl`, so the automated suite runs fast,
   deterministic, and never touches the real bucket. The e2e spec still exercises the real
   Neon DB end-to-end (same as other e2e specs) — only the S3 leg is faked, by simulating the
   client's `PUT` with a direct `PutObjectCommand` call through the mocked client and letting
   `confirm`'s real `HEAD` check run against that mock. A **separate, one-off real round-trip**
   against the live S3 bucket was then run manually (not part of the test suite) as this
   task's final verification step — see below.
3. **Ownership model for the polymorphic `Attachment`.** Rather than modeling `ownerId` as a
   Prisma relation (impossible for a polymorphic FK pointing at two different tables), ownership
   is enforced in `FilesService`: `uploadedByUserId` is the authoritative "who may
   confirm/delete/view this attachment" check for every `ownerType`, and for
   `application_document` the *creation* step additionally re-checks that the target
   `Application.userId` matches the caller (so a user can only attach documents to their own
   applications in the first place).
4. **Avatar pointer swap, not a history table.** Confirming a new `user_avatar` attachment
   overwrites `User.avatarAttachmentId`; the previous attachment row is left as an orphaned
   `CONFIRMED` attachment (not auto-deleted) rather than deleting it, since nothing in the
   requirements asked for old-avatar cleanup and deleting it automatically could surprise a
   client mid-retry. `DELETE /files/{id}` on the *current* avatar clears the pointer back to
   `null`.

### Verification
- `npm run build` — succeeds.
- `npx prisma migrate dev --name add_attachments_and_avatar` applied against the real Neon DB;
  `npx prisma migrate status` → "Database schema is up to date!".
- `npm test` — 33/33 passing (4 suites, including the two new files-module specs).
- `npm run test:e2e` — 24/24 passing (3 suites, including the new `files.e2e-spec.ts`).
- Started the built app (`node dist/src/main`) and fetched `/api/docs-json`: all three new
  endpoints present with summaries —
  `POST /api/v1/files/upload-url`, `POST /api/v1/files/{attachmentId}/confirm`,
  `DELETE /api/v1/files/{attachmentId}`.
- **Real S3 round-trip** (not mocked): generated a real presigned PUT URL for
  `_healthcheck/arohya-s3-test-<timestamp>.txt` against the real bucket/credentials in `.env`,
  `PUT` the bytes with `fetch` (200), `HEAD`-verified the object landed with the right
  `ContentLength`, generated a presigned GET URL and fetched it back (200, body matched byte-
  for-byte), then deleted the object. The bucket was left clean (no lingering test objects).

### Deviations/notes
- `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` were not previously a dependency;
  added via `npm install` (AWS SDK v3, modular clients — the modern/maintained SDK generation).
- No new localization dictionary entries were added for the file-storage error messages;
  they follow the existing codebase's convention of inline English messages for error paths
  that don't have a dedicated i18n key yet (several existing `AppException.of(...)` calls in
  `ApplicationsService`/`FilesService` do the same, e.g. the 422 "not currently accepting
  applications" message) — translating them is a straightforward follow-up if kn-translated
  error copy is required for this phase specifically.

## Phase: real OTP email delivery (SMTP via nodemailer)

### Problem
`generate-otp` only ever returned `debugOtp` in the response; there was no actual email-sending
code anywhere in the codebase. Outside of reading `debugOtp` directly from the API response,
no OTP ever reached the user, so login/sign-up looked broken end-to-end.

### What changed
- `src/config/configuration.ts` — added a typed `email` block (`host`, `port`, `secure`, `user`,
  `password`, `from`) reading `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_SECURE`/`EMAIL_USER`/
  `EMAIL_PASSWORD`/`EMAIL_FROM`, same pattern as the existing `aws`/`jwt`/`otp` blocks.
- `src/common/mail/mail.service.ts` (new) — thin `MailService` wrapper around
  `nodemailer.createTransport`, mirroring `StorageService`'s role for S3: all SMTP wiring lives
  here, kept out of `AuthService`. Exposes `sendOtpEmail(to, otp, purpose, expiresInSeconds, lang)`,
  rendering a plain-text + basic HTML body localized en/kn (same `Lang` type as `I18nService`).
- `src/common/mail/mail.module.ts` (new) — exports `MailService`; imported by `AuthModule`.
- `src/modules/auth/auth.module.ts` — imports `MailModule`.
- `src/modules/auth/auth.service.ts` — `generateOtp` now calls `this.mail.sendOtpEmail(...)` right
  after the OTP challenge is persisted, in addition to (not instead of) the existing
  `debugOtp`-outside-production behavior. The call is wrapped in try/catch: an SMTP failure is
  logged via Nest's `Logger` and swallowed, never turned into a 500 — the OTP challenge is already
  valid in the DB regardless of whether the email made it out.
- `src/modules/auth/auth.controller.ts` — `@ApiOperation` on `POST /auth/generate-otp` now notes
  that a real OTP email is sent via SMTP (not just returned via `debugOtp` in dev), and that a
  failed send is logged without failing the request. No schema/response example changes — the
  response contract is unchanged.
- `package.json` — added `nodemailer` (dependency) and `@types/nodemailer` (devDependency).
- `.env.example` — added placeholder `EMAIL_*` vars (never the real password).
- `README.md` — new "Email/OTP delivery env vars (SMTP)" section.
- Tests: `src/common/mail/mail.service.spec.ts` (mocks `nodemailer#createTransport`/`sendMail`;
  covers subject/body localization and transport-failure propagation) and new cases in
  `src/modules/auth/auth.service.spec.ts` asserting `generateOtp` calls `MailService.sendOtpEmail`
  with the right args, and that a rejected `sendOtpEmail` still yields a normal success response.
  `MailService` is mocked in `auth.service.spec.ts`'s constructor so the broader auth suite never
  attempts a real send.

### Verification
- `npm run build` — succeeds.
- `npm test` — 38/38 passing (5 suites, including the new `mail.service.spec.ts` and the two new
  `auth.service.spec.ts` cases).
- **Real SMTP send** (not mocked): ran a one-off throwaway script using the live `.env` SMTP
  credentials to send one real email from `noreply@navayuga.com` (envelope from) via
  `manjunath.naik@floworx.io`'s Gmail SMTP auth to `manjunath.naik@floworx.io` itself (never to a
  third party). Gmail accepted it: `250 2.0.0 OK ... - gsmtp`, `accepted:
  ["manjunath.naik@floworx.io"]`, `rejected: []`. The credentials are valid and able to send. The
  throwaway script was deleted immediately after (`send-test-otp-email.throwaway.js`, not
  committed).

### Deviations/notes
- **`EMAIL_FROM` domain mismatch.** `EMAIL_USER` (the SMTP-authenticated account) is
  `manjunath.naik@floworx.io`, but `EMAIL_FROM` (the envelope/header From shown to recipients) is
  `noreply@navayuga.com` — a different domain Gmail doesn't own/verify. Gmail still relayed the
  test send successfully (SMTP AUTH only checks the authenticated account, not the From header),
  but mail sent "from" a domain the sending account doesn't control is exactly the pattern SPF/
  DKIM/DMARC alignment checks exist to catch — recipient mail servers (especially corporate ones)
  may silently spam-box or reject it even though Gmail's own SMTP accepted it. For production,
  recommend either: (a) set `EMAIL_FROM` to an address on a domain `EMAIL_USER` actually sends for
  (e.g. `noreply@floworx.io` or a Gmail alias), or (b) if `navayuga.com` is the real intended brand
  domain, send through an account/provider authorized for that domain (Google Workspace mailbox on
  navayuga.com, or a transactional provider like SES/SendGrid/Postmark with `navayuga.com`
  SPF/DKIM records configured) — plain Gmail SMTP from a personal/workspace account is adequate for
  dev/testing but not recommended as the long-term production path for deliverability and sending
  limits.
