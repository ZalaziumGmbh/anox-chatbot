# Zalazium One managed DEV runtime

The isolated DEV image is based on the reviewed AnythingLLM 1.17.0 merge. Source
qualification, fresh/repeated Prisma migration, frontend/embed builds and actual
container HTTP qualification must pass before publishing an immutable
`one-<revision>` candidate. Existing DEV consumers and production publication are
unchanged; candidate publication does not promote an automatic update channel.

`ONE_MANAGED_RUNTIME=true` makes the Docker entrypoint initialize the requested
email administrator before opening HTTP. It only creates an account on an empty
installation, preserves existing passwords/users, and refuses incomplete or
unexpected existing admin state. `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`,
`SIG_KEY`, `SIG_SALT` and `LITE_LLM_API_KEY` must be supplied through the deployment's
RAM credential loader. Admin provider changes are refused in this mode and the
normal environment dump is disabled, keeping credentials out of persistent image
layers. Other installations retain the upstream behavior by default.

Mount application storage at `/app/server/storage` for UID 1000. Set
`ONE_COMKEY_DIR=/tmp/comkey` and provide writable tmpfs at `/tmp`; ephemeral
server/collector signing keys are recreated on each start. Keep telemetry disabled
and use only the internal LiteLLM route and approved local embeddings.

Password rotation uses the authenticated admin user API. Recreate the service
with a newly generated JWT signing secret to revoke existing sessions; retain
`SIG_KEY` and `SIG_SALT` so encrypted application data remains readable. Updating
the bootstrap password alone never resets an existing account.

The image test covers real admin role, protected routes, closed onboarding,
workspace persistence, password rotation and old-session rejection. Document
retrieval, embedding, widget authorization and live provider compatibility are
additional acceptance checks and remain pending until tested on the new host.
