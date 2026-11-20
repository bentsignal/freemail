# Moving to a production Convex deployment (2026-11-20)

Freemail ran on one Convex deployment, `dazzling-dog-633`, a dev deployment
that served production. This is the plan for moving Shawn's data to a real
production deployment, written before anything changed. The outcome is at
the end.

## Where things go

| Deployment             | Type and reference   | After the move                                              |
| ---------------------- | -------------------- | ----------------------------------------------------------- |
| `colorful-ostrich-734` | prod, `production`   | Production: Shawn's mail, the website, both phone apps      |
| `dazzling-dog-633`     | dev, `dev/shawn`     | Paused and untouched, the rollback copy. Shawn deletes it   |
| a new dev deployment   | dev, `dev/agents`    | Development: a fake owner and seeded mail, for local work   |

`colorful-ostrich-734` already existed. A `convex deploy` in July created
it, and it held July's functions, eight environment variables, and no rows
except seven expired Better Auth verification codes. The move reuses it
because it is the project's default production deployment, the one
`convex deploy` targets.

## What pointed at `dazzling-dog-633`

| Thing                                 | Where it lives                                                                 | What the move does                                      |
| ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Data, files, Better Auth tables       | the deployment                                                                 | snapshot export, import into production                 |
| 23 environment variables              | the deployment                                                                 | copied to production, `ENVIRONMENT` becomes `production` |
| Website                               | `shared/config/src/urls.ts`, built into the Vercel bundle                      | code change, `vercel deploy --prod`                     |
| Freemail and Freemail Dev             | `urls.ts`, `eas.json`, the `webcredentials:` associated domain                 | code change, new builds of both                         |
| CLI                                   | `apps/cli/src/config.ts`                                                       | code change                                             |
| Hosted mail in, and SES delivery events | two SNS subscriptions to `/providers/hosted/sns` on the Convex site URL      | subscribe production, unsubscribe the old endpoint      |
| Gmail and Microsoft OAuth callbacks   | redirect URIs in Google Cloud and Microsoft Entra                              | Shawn adds the production URIs (needed only to connect or reconnect an account) |
| Notes' sign-in emails                 | `TRANSACTIONAL_MAIL_URL` on Notes' production deployment                       | Shawn points it at production                           |
| Push notifications                    | Expo push tokens in the data, no Convex URL                                    | nothing; the quick-action URL comes with the new build  |
| Crons and scheduled functions         | `crons.ts`; pending scheduled functions aren't in an export                    | crons start on deploy and recover stale work            |
| Scripts, skills, docs                 | `scripts/backend.sh`, `scripts/hosted-mail.mjs`, `.agents/skills`, `docs/`     | this PR                                                 |

Gmail, Microsoft 365, and iCloud sync from cursors stored in the data, with
no webhook, so they resume in production from where the export left them.
Vercel's two environment variables (`NITRO_PRESET`, `VITE_NODE_ENV`) don't
name a deployment.

## What Convex export and import do

From the Convex docs (backup and restore, import, pause deployment) and a
rehearsal on a scratch deployment:

- A snapshot export is a consistent copy of every table, the component
  tables under `_components/`, and file storage. It has no environment
  variables, code, or pending scheduled functions.
- An import keeps each document's `_id` and `_creationTime`, and each
  file's storage ID, so references still resolve. It replaces tables
  atomically.
- A paused deployment refuses function calls, skips crons, and queues
  scheduled functions. `POST /api/v1/pause_deployment` pauses it and
  nothing is lost by unpausing.

## The cutover

Mail must not be lost or handled twice. Two rules follow. `dazzling-dog-633`
stops completely before the final export, so nothing can change in it
afterwards. Production starts only once it holds that export, so the two
never run crons, sync, or send at the same time.

Before the freeze, with no effect on the running app:

1. Export `dazzling-dog-633` to `~/Backups/freemail/convex-migration-2026-11-20/`.
2. Rehearse the import on a scratch dev deployment, kept paused so none of
   its functions run, compare row counts, and delete it.
3. Merge the code change.
4. Copy the environment variables to production with
   `ENVIRONMENT=production`, deploy `main` there, and pause it.
5. Build the new Freemail IPA and the Freemail Dev client.
6. Subscribe an SQS queue to both SNS topics. It keeps a signed copy of
   every notification SES publishes during the gap.

The freeze, a few minutes:

7. Pause `dazzling-dog-633`. The website and the installed apps stop
   working here.
8. Export it again. This is the copy that moves.
9. Import it into production with `--replace-all` and compare row counts
   for every table, component table, and file storage against the export.
10. Unpause production. Its crons sync Gmail, Microsoft 365, and iCloud
    from the exported cursors and recover any send or classification that
    was in flight.
11. Subscribe production's `/providers/hosted/sns` to both topics and
    remove the old subscriptions.
12. `vercel deploy --prod`, then install the new builds.

Hosted mail that SES accepted during the gap is in S3 (`inbound/<id>`) and
its notification is in the SQS queue. Step 13 posts each queued inbound
notification that production doesn't have to production's webhook. The SNS
signature is still valid, and ingest is keyed by the SES message ID, so a
message can't be stored twice. Delivery events aren't idempotent, so only
those dated after the pause are replayed.

Then verify: the website loads, the auth endpoints answer, a test message
to a hosted address arrives, the S3 listing since the pause matches
production, and attachments open.

## Rolling back

Until Shawn installs the new Freemail build, his phone still points at
`dazzling-dog-633`. To go back: pause production, unpause
`dazzling-dog-633`, subscribe its endpoint to the two SNS topics again,
and `vercel rollback`. Mail that reached only production in the meantime
would have to be replayed from S3 the same way.

## Sign-in after the move

- Sessions move with the Better Auth tables and `BETTER_AUTH_SECRET`.
- Website passkeys belong to `PASSKEY_RP_ID`, which doesn't change.
- App passkeys belong to the Convex site host
  ([AUTH.md](../services/convex/AUTH.md)), so the ones registered for
  `dazzling-dog-633.convex.site` can't sign in to production. The apps stay
  signed in through their stored session, and a new app passkey is added in
  Settings.
