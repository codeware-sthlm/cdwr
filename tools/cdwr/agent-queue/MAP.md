# The agent queue, mapped

![The human side on the left, the NUC on the right, and Linear, Supabase and GitHub between them; tickets, events and code each move along their own row](map.svg)

Two shores and the cloud between them. Green arrows are work moving: tickets, answers, code.
Grey arrows are signals: events and notices. Everything below is the detail behind that picture:
every machine, service and file that takes part in working a Linear ticket without a person at
the keyboard, in four views small enough to read on their own. The details behind every box are
in the [cdwr README](../README.md) (the agent queue, the NUC) and the
[work-queue skill](../../../.claude/skills/work-queue/SKILL.md).

The drawing is `map.svg` beside this file, in the site's colour tokens with fallbacks for GitHub,
and it passes the site's SVG sanitiser unchanged, so a cdwr.io page can place it as an
illustration.

The NUC runs the schedule: its container plans, launches implementing sessions and watches the
PRs. The Mac is where attended work happens, where the Desk shows the queue and where the CLI
installs and inspects the rest. The same scripts can run as a launchd job on the Mac
(`cdwr agent install`); that job is not installed today, so the NUC is the only scheduler. Linear
is the only source of truth for what a ticket is waiting on. Everything else is a cache, a log or
a key.

## 1. Landscape

Who talks to whom. Solid arrows are calls the queue makes; dashed arrows are events pushed to it.
The attended session reaches GitHub as Håkan; the container only ever as the App.

```mermaid
flowchart LR
  subgraph mac["Håkan's Mac"]
    attend["Attended session<br>/work-queue"]
    desk["Agent Desk app"]
    cli["cdwr CLI"]
  end

  subgraph nuc["NUC · agent-host"]
    container["Container cdwr-agent<br>run loop + listener"]
  end

  subgraph linear["Linear"]
    tickets["Tickets with agent:* labels"]
    lmcp["MCP server"]
  end

  subgraph github["GitHub"]
    repo["Repo cdwr<br>branches, PRs, merge queue"]
    app["App codeware-agent"]
    actions["Actions<br>CI, Copilot review, images, deploys"]
  end

  subgraph supabase["Supabase · agent-queue"]
    tables["Tables<br>runs, usage, activity, sessions,<br>queue_state, issue_events, github_events"]
    fns["Edge Functions<br>linear-webhook, github-webhook"]
    realtime["Realtime"]
  end

  anthropic["Anthropic<br>Claude Max subscription"]
  infisical["Infisical<br>project agent-host"]
  sentry["Sentry<br>cron monitor"]
  slack["Slack<br>notices"]
  fly["Fly.io<br>the sites"]

  attend --> lmcp
  attend --> repo
  attend --> anthropic
  attend --> slack
  container --> lmcp
  container -->|writes as the app| app --> repo
  container --> anthropic
  container --> tables
  container --> sentry
  container --> slack
  container -->|secrets at start| infisical
  desk --> tables
  desk --> lmcp
  cli -->|ssh over Tailscale| container
  attend -.->|session file| container
  tickets -.->|webhook| fns
  repo -.->|webhook| fns
  fns --> tables
  tables -.-> realtime
  realtime -.->|wake| container
  realtime -.->|refresh| desk
  actions --> repo
  actions -->|merged main| fly
```

## 2. What runs where

### The Mac

The attended session, the Desk and the CLI. No scheduler runs here today.

```mermaid
flowchart TB
  subgraph mac["Håkan's Mac"]
    direction TB
    subgraph attended["Attended session · cdwr agent attend"]
      cc["Claude Code · /work-queue<br>Opus or Fable orchestrates"]
      impl["implementer subagents<br>Sonnet, one step each"]
      hook["session hook<br>heartbeat file, mirrored to the NUC"]
      cc --> impl
      cc -.-> hook
    end
    deskapp["Agent Desk<br>Tauri app: queue, runs, Attended, Suggested"]
    cliapp["cdwr agent<br>attend · status · logs · deploy · mirror · desk install · usage-record"]
  end

  subgraph trees["Worktrees beside codeware-dev"]
    tq["codeware-queue<br>the attended session"]
    tn["codeware-cod-n<br>one per ticket"]
  end

  subgraph files["~/.cdwr/agent-queue"]
    f2["sessions/*.json · mirror · notify-level · logs/"]
    f3["the installed scripts, stale while no job runs"]
  end

  keychain["Keychain<br>linear-agent-queue"]
  env["tools/cdwr/.env<br>Supabase service key for usage-record"]
  ssh["ssh agent-host<br>over Tailscale"]

  cc --- tq
  impl --- tn
  hook --- f2
  hook --- ssh
  cliapp --- ssh
  cliapp --- keychain
  cliapp --- env
```

- **Attended session.** `cdwr agent attend [COD-n]` moves `codeware-queue` to `origin/main` and
  starts `/work-queue` there. Linear through the claude.ai connector, GitHub as Håkan. Its
  heartbeat file tells both schedulers a session is alive.
- **The scheduler, if wanted here.** `cdwr agent install` sets up a launchd job running the
  same `run.sh` every 10 minutes from a `codeware-agent` worktree, with the Linear key in the
  Keychain. It is not installed: `cdwr agent status` says `job: not loaded`, and the local queue
  home is paused. A pause is per host, so it holds nothing on the NUC.
- **Agent Desk.** Reads the Supabase tables with the publishable key and Linear with its own
  key; refetches an issue when Realtime says it changed. Installed from CI with
  `cdwr agent desk install`.

### The NUC

One Ubuntu box, one container, reached only over the tailnet.

```mermaid
flowchart TB
  subgraph nuc["NUC · cdwr-nuc, role agent-host"]
    direction TB
    ts["Tailscale SSH<br>tag:agent-host, user cdwr"]
    docker["Docker Engine"]
    timer["systemd timer 03:30<br>backup agent-home → /var/backups/cdwr-agent"]
    upgrades["unattended-upgrades<br>reboot 04:00"]
    subgraph opt["/opt/cdwr-agent"]
      compose["compose.yaml"]
      dotenv[".env · Infisical machine identity"]
      imageenv["image.env · AGENT_IMAGE_TAG"]
    end
    subgraph c["Container cdwr-agent · ghcr.io/codeware-sthlm/cdwr-agent"]
      direction TB
      secrets["secrets.sh<br>Infisical login, exports /agent-queue"]
      entry["entrypoint.sh<br>keys to tmpfs, clone, install, to main"]
      loop["run loop<br>run.sh: sleeps in 10 min steps,<br>fallback run every 60 min"]
      listen["cdwr agent listen<br>Realtime → SIGUSR1"]
      session["implement.sh → claude -p<br>GitHub as the App, Linear by key"]
      secrets --> entry --> loop
      entry --> listen
      listen -->|SIGUSR1| loop
      loop -->|work waits, no live session| session
    end
    subgraph vols["Volumes"]
      v1["agent-home · ~/.cdwr/agent-queue"]
      v2["worktrees · /work"]
      v3["pnpm-store"]
      v4["claude-home · ~/.claude"]
    end
    tmp["tmpfs /run/agent<br>app.pem · linear.key · app.env"]
  end

  docker --> c
  compose --- c
  c --- vols
  entry --- tmp
  timer --- v1
```

- **Secrets.** The NUC holds only the Infisical identity. The container reads production
  `/agent-queue` at start: the GitHub App, the Linear key, the Claude OAuth token, the Supabase
  keys, the Sentry DSN and the Slack webhook. A rotation takes a `docker compose restart`.
- **Each run.** Watch the PRs of `agent:review` tickets, send the activity rows, plan one
  `agent:ready` ticket if any (read-only tools, Linear the only writable server), then launch an
  implementing session when approved or answered work waits and no session is alive. Per-run
  budget and a daily cap in `implement-spend.jsonl`. The decision tree is in **Flows**.
- **Waking.** The listener subscribes to `issue_events` and `github_events` and signals the
  loop 15 s after the first event, at most once a minute. The loop still decides: pause, lock,
  live-session check and spend caps apply. Without the listener it polls every 10 minutes.
- **Updating.** `cdwr agent deploy --host agent-host` from the Mac: pause, wait for the running
  job, write the tag, pull, restart, resume. The listener runs from the checkout, so it follows
  main at the next start.

## 3. Flows

### A ticket, from label to merge

```mermaid
sequenceDiagram
  autonumber
  actor H as Håkan
  participant L as Linear
  participant S as Supabase
  participant N as NUC run loop
  participant C as Claude session
  participant G as GitHub

  H->>L: set agent:ready
  L-->>S: webhook → issue_events
  S-->>N: Realtime wakes the loop
  N->>C: plan-only run
  C->>L: plan in the description, agent:needs-input, "Agent: plan ready"
  N-->>H: Slack notice (action)
  H->>L: answer in a comment
  L-->>S: webhook
  S-->>N: wake
  N->>C: implement-only run (no live session, under the caps)
  C->>L: agent:working, claim, Status table
  C->>G: commits and PR as codeware-agent
  C->>L: Next: Waiting: copilot
  G-->>S: webhook → github_events
  S-->>N: wake
  N->>C: resume after Copilot
  C->>G: fix or dismiss each thread, push
  G-->>S: check_suite completed
  S-->>N: wake
  N->>C: resume after CI
  C->>L: agent:review, "Agent: PR ready" with the hand-off checklist
  N-->>H: Slack notice (action)
  H->>G: review, approve, merge
  G-->>S: pull_request merged
  S-->>N: wake
  N-->>H: notice with the unticked hand-offs
  G->>L: Closes COD-n → Done
  G->>G: Actions deploy the affected apps
```

In an attended session on the Mac the same steps run in one go, with the gates answered in
Linear while the session moves on to the next ticket. The NUC sees that session through its
mirrored heartbeat file and starts nothing beside it.

### What one run decides

```mermaid
flowchart TD
  tick["Tick: the loop's 10 min step,<br>the hourly fallback,<br>or SIGUSR1 from the listener"] --> paused{"paused?"}
  paused -->|yes| ok["check in ok, stop"]
  paused -->|no| lock{"lock held by a live run?"}
  lock -->|yes| skip["stop"]
  lock -->|no| watch["Watch the PRs of agent:review tickets<br>notice on failure, merge or close"]
  watch --> activity["Linear history → activity rows"]
  activity --> linearok{"Linear tools answer?"}
  linearok -->|no| nolinear["record no Linear tools,<br>one notice"]
  linearok -->|yes| pick["Compute the pick (watch.jq):<br>parked wait resolved · working · answered ·<br>review feedback · new agent:ready"]
  pick --> plan{"a new agent:ready ticket?"}
  plan -->|yes| planrun["plan-only claude run<br>writes the plan, asks in Linear"]
  plan -->|no| launch
  planrun --> launch{"approved or answered work waits,<br>no live session, under the caps,<br>fewer than 2 idle launches?"}
  launch -->|yes| implement["implement.sh<br>implement-only once, as the GitHub App"]
  launch -->|no| idle["idle"]
  implement --> rec
  idle --> suggest{"first idle run after 06:00<br>and none today?"}
  suggest -->|yes| sug["/suggest-improvement<br>one ticket or nothing today"]
  suggest -->|no| rec
  sug --> rec
  rec["runs.jsonl · telemetry rows · queue_state<br>Sentry check-in"]
```

### Why the NUC stays quiet while you work

```mermaid
sequenceDiagram
  actor H as Håkan
  participant M as Mac session
  participant K as Session hook
  participant N as NUC run loop

  H->>M: cdwr agent attend
  M->>K: session.sh register
  K->>K: ~/.cdwr/agent-queue/sessions/id.json
  loop every tool call, at least once a minute
    K->>N: scp the file into the container
  end
  N->>N: a file from another host is alive while its heartbeat is fresh
  Note over N: launches no implementing session
  H->>M: quits
  K->>N: file says ended
  Note over N: launches again when work waits
```

## 4. Hands

What only a person does, and where.

| Action                                        | Where                                                        | Effect                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Set `agent:ready` on a ticket                 | Linear                                                       | The ticket enters the queue; a sub-issue stays off until set                                        |
| Answer an `**Agent: plan ready**` or question | Linear comment                                               | The ticket resumes at the next run or session                                                       |
| Review and merge the PR                       | GitHub                                                       | Linear closes the ticket; the merge notice lists hand-offs                                          |
| Tick a hand-off item                          | The `**Agent: PR ready**` comment                            | The Desk and the merge notice stop counting it                                                      |
| Accept or discard a daily suggestion          | Linear: `agent:ready`, or cancel with one word               | Queued, or recorded as taste for later runs                                                         |
| Start attended work                           | `cdwr agent attend [COD-n]`                                  | `codeware-queue` to main, `/work-queue` in the terminal                                             |
| Hold or release the schedule                  | `cdwr agent pause` / `resume`, inside the container over ssh | Per host: the loop still ticks and checks in, starts nothing; `deploy` pauses and resumes by itself |
| Run the scheduler on the Mac as well          | `cdwr agent install`                                         | A launchd job every 10 minutes; not installed today                                                 |
| Update the NUC                                | `cdwr agent deploy --host agent-host`                        | New image tag, restart, listener to main                                                            |
| Mirror the Mac's sessions                     | `cdwr agent mirror set --host agent-host`, once              | The NUC sees attended sessions                                                                      |
| See the state                                 | `cdwr agent status [--host agent-host]`, Agent Desk          | Queue view, Attended, Suggested, listener, watched PRs                                              |
| Read a log                                    | `cdwr agent logs [--run] [--host …]`                         | Scheduler log or the latest run, local or over ssh                                                  |
| Rotate a secret                               | Infisical `/agent-queue`, then `docker compose restart`      | The container re-reads at start                                                                     |
| Deploy a webhook function                     | `supabase functions deploy …`                                | Linear or GitHub events reach the tables again                                                      |
| Install the Desk                              | `cdwr agent desk install`                                    | Newest CI build into /Applications                                                                  |

## Where state lives

| State                               | Lives in                                                           | Read by                                                  |
| ----------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| What a ticket waits on, plan, claim | The Linear ticket: labels, description, comments                   | Every session and run                                    |
| Whether a session is alive          | `~/.cdwr/agent-queue/sessions/*.json`, mirrored                    | Both run loops                                           |
| What the PR watch last sent         | `~/.cdwr/agent-queue/watch.json`                                   | run.sh, `cdwr agent status`                              |
| Spend of launched sessions          | `~/.cdwr/agent-queue/implement-spend.jsonl`                        | run.sh caps                                              |
| Run history, queue view, Attended   | Supabase `runs`, `queue_state`; `runs.jsonl` locally               | Agent Desk, status, suggest                              |
| Listener health                     | `listener.json` in the queue home                                  | The loop's sleep, status                                 |
| Linear key                          | Keychain `linear-agent-queue`; tmpfs `/run/agent`                  | lib.sh header helper                                     |
| GitHub App key                      | A `.pem` outside every checkout; tmpfs in the container            | github-app.sh                                            |
| Container secrets                   | Infisical project `agent-host`, folder `/agent-queue`              | secrets.sh at start                                      |
| The scripts that run unattended     | `/opt/agent-queue` in the image, copied to the queue home at start | Replaced by `deploy`; `install` does the same on the Mac |
