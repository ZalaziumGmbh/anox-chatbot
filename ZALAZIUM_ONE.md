# Zalazium One upgrade qualification

The source branch merges AnythingLLM v1.17.0 into the existing Zalazium fork.
The previous fork delta was the two Zalazium release workflows and an embed
revision bump. Embed `a3a2fea57cfc753698110dd0973a607e3209f634` includes the
previous `4a83ad6252f03a8e79d60c2f86a9ce6030eedbd3` (42 commits ahead, none behind).
The current upstream already accepts `zalazium@zalazium.de`; no username-policy
patch is necessary.

Use Node 22 (qualified locally with 22.23.3). Local clean-account checks passed:
77 Jest suites / 1609 tests, frontend production build, embedded-widget build,
40 fresh Prisma migrations, a repeated migration pass, and synthetic email-admin
creation, multi-user setup, repeated initialization and password rotation through
the application models. Run `server/scripts/zalazium-one-smoke.cjs` only as a
non-root user with `ONE_SYNTHETIC_TEST=1` against a fresh synthetic database.
It refuses an existing user dataset. It is a qualification test, not a live
bootstrap command. Test credentials have no operational use.

Upstream workflows retain their original purpose but run only in the upstream
repository. The dedicated Zalazium qualification workflow executes installs,
tests and builds as `tester` with a clean environment and no founder credentials.
The changed DEV workflow targets `:zalazium-one-dev`, which freezes old `:dev`
publication when merged. The production workflow is unchanged. Keep this PR a
draft until isolated image builds, immutable rollback tags and compatibility
promotion gates are ready; source tests alone do not authorize deployment.

Pending acceptance includes the actual container build/start, RAM-only mutable
configuration, HTTP admin/bootstrap closure, forced session invalidation during
rotation, vector ingestion/retrieval, widget authorization/origins, image/storage
compatibility and live persistence/recovery. Upstream password changes do not
automatically prove existing JWTs are revoked. Disable telemetry and unverified
provider routes. Test with synthetic documents only; import no production data.
