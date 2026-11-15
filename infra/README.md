# Evalix on AWS

The website is always up. The run engine (the part that runs benchmarks) is a small server that is
**switched on when someone starts a run and switches itself off when idle**. Built for a hackathon demo:
5–10 light users, about $1–3 a month. Region `ap-south-1`.

```
                    CloudFront (one https address, always on)
                     │                          │
              /* (website)                  /api/*
                     ▼                          ▼
             S3: the built React app    Lambda "front desk" (always available, $0 while unused)
                                          • engine off: answers sign-in, scoreboard, run details, compare,
                                            from a copy of the database in S3
                                          • someone signed in starts a run: switches the engine on, replies
                                            "starting"; the page shows it and carries on when it is ready
                                          • engine on: passes every request to it (live stream included)
                                                  │  (http, shared secret header)
                                                  ▼
                              EC2 t4g.small "run engine" (stopped when idle)
                                backend :8000 · Bifrost :8080 · four agents :9001–9004
                                SQLite on its own disk · keys from SSM · Gemini, Tavily over the internet
                                saves the database to S3 after each benchmark and before switching off
                                switches itself off after 15 idle minutes (3 hours at most per start)
                                a nightly schedule (02:30 IST) also stops it
```

Files: `storage.yaml` (buckets, kept apart so deleting the app never deletes results) · `evalix.yaml` (engine, front
desk, CloudFront, schedule, budget) · `deploy.sh` · `push_secrets.py` · `build_desk_zip.sh` · `engine/` (what runs
on the machine) · `iam/` (the two deployer policies).
Code: `backend/app/hosting.py`, `frontend/src/pages/run/EngineNotice.tsx`.

## Deploy (you run these)

```bash
# 1. Keys → SSM (/evalix/*, SecureString). Prints names only. Run --check first to see what's missing.
uv run --project backend python infra/push_secrets.py
# 2. Everything: storage, engine code, front desk, CloudFront, web app, smoke check
infra/deploy.sh                      # first time about 10 minutes (the engine sets itself up)
# 3. Google Cloud Console → your web client → Authorized JavaScript origins → add the address deploy.sh prints
```

The keys are never in the repo or the templates. Without `GOOGLE_CLIENT_ID` the script refuses to go on, because
the hosted app would otherwise treat every visitor as the owner.

After that: `infra/deploy.sh backend` (code) · `infra/deploy.sh frontend` (web app) · `infra/deploy.sh status` ·
`infra/deploy.sh wake` / `stop`. A deploy gives a running engine the new code at once; an off engine takes it on its
next start. A terminal on the engine, no SSH key: `aws ssm start-session --target <instance id>`.

## Cost (at the higher published prices; the Mumbai t4g.small rate varies between sources)

The engine costs about $0.022 an hour while on (server plus its public IPv4 address); its disk is about $0.03 a day
always. CloudFront, Lambda, S3, SSM and the schedule stay inside AWS's free allowances at this usage.

| Usage | Engine hours/day | Per day | Per week | Per month |
| :--- | :--- | :--- | :--- | :--- |
| Nobody uses it | 0 | $0.03 | $0.21 | ~$0.90 |
| Light | 1 | $0.05 | $0.36 | ~$1.60 |
| Demo days | 3 | $0.10 | $0.67 | ~$2.90 |
| Heavy (judging week) | 8 | $0.21 | $1.45 | ~$6.20 |
| Always on, for comparison | 24 | $0.56 | $3.90 | ~$16.70 |

Gemini is billed by Google, not AWS (about $0.003 a run; a full 3-try benchmark about $0.50). Pass
`EVALIX_ALERT_EMAIL=you@example.com` to `deploy.sh` for a $5 budget alert.

## What to know

* **The first Start a run takes about a minute** (the engine boots). The page says so and carries on.
* **Safety:** the front desk and the engine both refuse any call that lacks the shared secret (`EVALIX_ORIGIN_SECRET`).
  The engine's port 8000 is open to the internet because the front desk (a Lambda) has no fixed address; the secret
  protects it, but it travels over plain http inside AWS's network. Fine for a demo; for more, put the engine behind
  TLS. The agents and Bifrost listen on the machine only.
* **Settings changes on the engine don't survive a restart.** Keys and Bifrost's config are rewritten from SSM and the
  repo at every boot. Change keys in SSM (`push_secrets.py`) and then `deploy.sh wake`/restart.
* **Results survive.** The database lives on the engine's disk, with a copy in S3 (versioned) that the front desk
  reads. A replaced engine restores it. A run cut off by a switch-off shows as a setup problem.
* **Cost guards:** switches off after 15 idle minutes, at most 3 hours per start, stopped nightly, CPU credits set to
  "standard", `t4g.micro/small/medium` only (the deployer policy refuses anything bigger).
* **Not built:** a fixed address for the engine, TLS to it, and agents hosted outside the engine.

## If it grows

A managed database (RDS or DynamoDB) in place of SQLite files, the engine as an always-on container service, one
container per agent, a custom domain. Nothing here blocks that.

## Take it down

`aws cloudformation delete-stack --stack-name evalix` removes everything but the results. `evalix-storage` keeps its
data bucket on purpose (empty and delete it by hand if you really want it gone).
