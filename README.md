# Arohya Capital API

Backend REST API for the Arohya Capital Flutter application. NestJS + Fastify, TypeScript
strict, PostgreSQL + Prisma, JWT access tokens, rotating hashed refresh tokens, secure email
OTP, Swagger, Docker. Built as a modular monolith.

The authoritative API contract lives in `Arohya_Claude_Build_Guide.md` in this same directory —
every endpoint below implements that contract verbatim (exact field names, status codes, and
response envelope shapes). See `BUILD_LOG.md` for the full phase-by-phase build history,
decisions, and verification evidence.

## Stack

- NestJS 10 on `@nestjs/platform-fastify`
- PostgreSQL (Neon) via Prisma 5
- JWT access tokens (900s) + rotating, argon2-hashed refresh tokens (JWT carrying a session id)
- argon2id-hashed OTPs, never logged or returned in production responses
- Swagger/OpenAPI at `/api/docs`
- class-validator/class-transformer DTOs, a global success/error response envelope, "req_"
  prefixed request ids, a minimal en/kn localization dictionary, page/limit pagination,
  ownership checks on every protected per-user resource

## Project layout

```
src/
  main.ts                     # Fastify bootstrap, Swagger, global pipes/filters/interceptors
  app.module.ts
  common/                     # envelope, exceptions, i18n, pagination, decorators, middleware
  config/                     # typed env configuration
  database/                   # PrismaService/PrismaModule
  security/                   # HashService (argon2), IdService (prefixed ids)
  modules/
    auth/                     # generate-otp, login, sign-up, refresh-token, logout
    financing-solutions/      # GET /financing-solutions (public catalog)
    applications/             # submit / list / detail
    dashboard/                # GET /dashboard
    loan-facilities/          # GET /loan-facilities
    users/                    # GET /profile, PATCH /profile/preferences
    support/                  # GET /support, POST /support/callback-requests
    notifications/            # list + mark-as-read
    files/                    # S3-backed file storage extension — see "File storage" below
prisma/
  schema.prisma                # all 15 models from the guide + documented additions
  migrations/                  # committed migration history (applied to the real Neon DB)
  seed.ts                       # seeds the catalog, support config, and a demo user
test/
  *.e2e-spec.ts                 # full-flow e2e tests (see Testing below)
```

## Setup

```bash
npm install
cp .env.example .env   # then fill in a real DATABASE_URL and JWT secrets
npx prisma migrate deploy   # or `npx prisma migrate dev` in local development
npm run prisma:seed
```

`.env` holds the real Neon connection string for this task and is **not** committed
(`.gitignore` excludes it); `.env.example` only has placeholders.

### File storage env vars (AWS S3)

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
AWS_BUCKET_NAME=...
```

Read via the same typed `ConfigService` pattern as every other env var (`src/config/configuration.ts`,
`config.aws.*`). See "File storage (S3)" below for the upload flow.

## Run

```bash
npm run start:dev     # watch mode
# or
npm run build && npm run start   # compiled, runs dist/src/main.js
```

The API listens on `http://localhost:3000`, mounted under `/api/v1`. Swagger UI is at
`http://localhost:3000/api/docs` (raw OpenAPI JSON at `/api/docs-json`).

### Docker

```bash
docker compose build
docker compose up
```

`docker-compose.yml` reads `DATABASE_URL` and the JWT secrets from `.env` via `env_file` — it
does not define a local Postgres container because this project targets the single real Neon
database described in the build task throughout. Point `DATABASE_URL` at any other reachable
Postgres instance to run it elsewhere.

## Testing

```bash
npm test          # unit tests (AuthService, ApplicationsService) — mocked Prisma, no network
npm run test:e2e  # full e2e flows — hits the REAL Neon DB configured in .env
```

Both scripts set `NODE_OPTIONS="--localstorage-file=/tmp/arohya-jest-localstorage"`. This is a
Node v20+ /jest-environment-node compatibility workaround — on very new Node versions, the
global `localStorage` accessor throws unless a backing file is configured, and
`jest-environment-node` touches that global during setup. It is unrelated to the application
code; see `BUILD_LOG.md` Phase 4 for details.

e2e tests create real rows in the Neon DB (unique emails per run, generated from
`Date.now()`), so they are repeatable but not isolated from the seeded data — this matches the
task's instruction to exercise the real database rather than mock it away.

- `test/auth.e2e-spec.ts` — generate-otp → sign-up → generate-otp (now 409) → generate-otp
  (login) → login (wrong OTP → right OTP) → refresh-token (rotation + reuse rejection) →
  profile requires bearer → logout.
- `test/applications.e2e-spec.ts` — financing-solutions catalog → submit application → list →
  detail (with timeline) → cross-user 403 → empty loan-facilities for a brand-new user.
- `test/files.e2e-spec.ts` — upload-url → (simulated S3 PUT) → confirm → `GET /profile`
  reflects `avatarUrl` → delete → `avatarUrl` back to `null` → 404 on re-delete. The AWS SDK is
  mocked for this spec (see BUILD_LOG.md); a one-off real round-trip against the live bucket
  was run manually as a separate verification step, not as part of the automated suite.

## Demo credentials

Seeded by `prisma/seed.ts` (`npm run prisma:seed`):

- Email: `rajesh.gowda@example.com`
- A LOGIN `OtpChallenge` is pre-created with OTP `123456` and its `otpRequestId` is printed to
  the console when the seed script runs — use that directly with `POST /login` if you seed
  fresh. If that particular challenge has since expired or been consumed (e.g. after the demo
  was already exercised during the build), just call `POST /generate-otp` with
  `{"email":"rajesh.gowda@example.com","purpose":"login"}` — in development/test mode the
  response includes a `debugOtp` field with the real one-time code, since `NODE_ENV` is not
  `production`. This demo user already has `kycStatus: verified`, a seeded "underwriting"
  application (`ARH10294`), a seeded "Working Capital Line" loan facility, and a seeded
  notification, so every endpoint is exercisable immediately after seeding.

To sign up a brand-new user instead: `POST /generate-otp` with `purpose: "signUp"`, then
`POST /sign-up` with the `debugOtp` value returned (development/test only).

## File storage (S3) — extension phase, beyond the original guide

Agreed with the user in conversation (not part of `Arohya_Claude_Build_Guide.md`'s original
17-endpoint contract); see `BUILD_LOG.md`'s "File storage extension phase" entry for the full
write-up and design decisions.

**Flow for the Flutter client (presigned URLs — files never pass through this backend):**

1. `POST /files/upload-url` with `{ ownerType, ownerId?, filename, mimeType, sizeBytes? }`
   (protected). `ownerType` is `"user_avatar"` (ownerId implicit from the JWT) or
   `"application_document"` (ownerId = the application's id, must belong to the caller).
   Returns `{ attachmentId, uploadUrl, s3Key, expiresInSeconds, maxSizeBytes }`.
2. The client does an HTTP `PUT` of the raw file bytes directly to `uploadUrl`, with header
   `Content-Type` equal to the `mimeType` it requested. `uploadUrl` expires in 5 minutes.
3. `POST /files/{attachmentId}/confirm` (protected). The backend HEAD-checks the object in S3,
   marks the attachment `confirmed`, and returns its metadata plus a fresh presigned **GET**
   URL (`url`) valid for 5 minutes — regenerate by calling confirm/profile/application-detail
   again once it expires.
4. `DELETE /files/{attachmentId}` (protected, ownership-checked) removes both the S3 object and
   the DB row.

Allowed types: `jpg`/`jpeg`/`png`/`webp`/`pdf`. Max size: 10MB, enforced both from the declared
`sizeBytes` at step 1 and the real object's `Content-Length` (via S3 `HEAD`) at step 3, so a
client that under-reports size at request time is still caught at confirm time.

`GET /profile` includes `avatarUrl` (a fresh presigned GET URL, or `null` if no avatar is set —
never stored, regenerated on every call). `GET /applications/{id}` includes a `documents` array
of that application's confirmed attachments, each with its own presigned GET `url`.

## Deliberate deviations from the guide (all documented in-code + in BUILD_LOG.md)

1. **`requestedAmount` gap** — the guide's `POST /applications` request body has no
   `requestedAmount` field, but `GET /applications` and `GET /applications/{id}` responses do.
   `Application.requestedAmount` is nullable; it stays `null` at submission and is only ever
   populated by a real (not fabricated) later underwriting step. See
   `CreateApplicationDto`/`ApplicationsService.submit()`.
2. **PAN uniqueness** — `User.pan` has a DB-level `@unique` constraint; sign-up returns
   `409 PAN_ALREADY_REGISTERED` both from an explicit pre-check and as a fallback on the
   Prisma `P2002` unique-violation error.
3. **Account lock/OTP brute-force** — two independent counters: `OtpChallenge.attemptsRemaining`
   (429 `TOO_MANY_ATTEMPTS` when one challenge's own attempts run out) and
   `User.failedOtpAttempts` (423 `ACCOUNT_LOCKED` for 15 minutes after 5 consecutive failed
   verifications across login attempts; auto-unlocks once the cool-down elapses). N=5 and
   15 minutes are both configurable via `OTP_MAX_VERIFY_ATTEMPTS`/`OTP_LOCKOUT_MINUTES`.
4. **App-generated, prefixed ids** — `User`, `Application`, `Notification`, `LoanFacility`, and
   `CallbackRequest` ids are generated in application code (`usr_`, `application_`,
   `notification_`, `facility_`, `callback_` + ulid) instead of Prisma's default `cuid()`, to
   match the guide's own example id shapes.
5. **No fabricated data anywhere** — `LoanFacilitiesService` never invents a facility for a
   user without one (empty list is the correct, tested response); `DashboardService` returns
   `activeApplication: null` for a user with no active application; `UsersService`/profile
   leave GSTIN/Account-Aggregator fields `null` until a real verification pipeline sets them.
6. **Ownership-check status code** — a resource that exists but belongs to another user returns
   `403 ACCESS_DENIED` (not `404`), consistent with the guide's own status-code table listing
   both as distinct cases. A resource that doesn't exist at all returns `404 RESOURCE_NOT_FOUND`.
7. **Email/PAN format errors use a custom code, not generic validation** — `/generate-otp`
   and `/sign-up` validate email/PAN format with a manual regex in the service layer (not
   `@IsEmail()`/DTO-level) specifically so the exact `INVALID_EMAIL`/`INVALID_PAN` codes from
   the guide are returned instead of a generic `VALIDATION_FAILED`.
8. **`debugOtp`** is only ever included when `NODE_ENV` is `development` or `test`, enforced in
   `AuthService.generateOtp()` itself (not just by convention), per the guide's explicit
   "never return the OTP in production" rule.
