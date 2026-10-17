# Decision logic for the agent queue's PR watch. run.sh includes it:
#   jq -L "$HOME_DIR" 'include "watch"; ...'
# Only defs; the spec in src/commands/agent/watch.jq.spec.ts runs it through jq. jq 1.7 safe.

def trim: gsub("^\\s+|\\s+$"; "");

# PR number from the newest cdwr pull attachment of a Linear issue, else null
def pr_number:
  [ (.attachments.nodes // [])[]
    | select(.url | test("^https://github\\.com/codeware-sthlm/cdwr/pull/[0-9]+")) ]
  | sort_by(.createdAt) | last
  | if . == null then null
    else .url | capture("^https://github\\.com/codeware-sthlm/cdwr/pull/(?<n>[0-9]+)").n | tonumber
    end;

# Unchecked items of the newest "PR ready" comment's "Hand-off checklist:" block
def handoffs:
  ([ (.comments.nodes // [])[] | select(.body | startswith("**Agent: PR ready**")) ]
    | sort_by(.createdAt) | last) as $c
  | if $c == null then []
    else
      ($c.body | split("\n")) as $lines
      | ([ range(0; $lines | length)
           | select($lines[.] | trim | gsub("^\\*\\*|\\*\\*$"; "") | ascii_downcase == "hand-off checklist:") ]
         | first) as $i
      | if $i == null then []
        else
          reduce $lines[$i + 1:][] as $l ({ items: [], stop: false };
            if .stop then .
            elif ($l | test("^\\s*$")) then .
            elif ($l | test("^\\s*[-*] \\[ \\] ")) then
              .items += [ $l | capture("^\\s*[-*] \\[ \\] (?<t>.*)$").t | trim ]
            elif ($l | test("^\\s*[-*] \\[[xX]\\] ")) then .
            else .stop = true
            end)
          | .items
        end
    end;

# Reduce a GitHub pullRequest node to { state, removedAt, removedReason, unresolved }.
# unresolved counts open review threads a person spoke last in: bots (Copilot) and the agent's
# own replies, which leave a thread open on purpose, don't count.
def pr_state:
  (.timelineItems.nodes // [] | last) as $r
  | ((.commits.nodes // [] | last | .commit.statusCheckRollup.state) // null) as $ci
  | {
      state: (
        if .state == "MERGED" then "merged"
        elif .state == "CLOSED" then "closed"
        elif $ci == "FAILURE" or $ci == "ERROR" then "failing"
        elif .mergeQueueEntry != null then "queued"
        else "open"
        end),
      removedAt: ($r.createdAt // null),
      removedReason: ($r.reason // null),
      unresolved: [ (.reviewThreads.nodes // [])[] | select(.isResolved | not)
                    | (.comments.nodes // [] | last)
                    | select(. != null and .author.__typename != "Bot"
                             and ((.body // "") | startswith("**Agent") | not)) ] | length
    };

# One watch step: notices to send and the entry to store for the ticket.
# Leaving the queue by merging is also a removal event (reason "merged"); that is no notice.
def step:
  . as $in
  | $in.id as $id | $in.pr as $pr | $in.now as $now
  | (if $in.prev != null and $in.prev.pr == $pr then $in.prev else { state: "open", removedAt: null } end) as $prev
  | (if $now.removedAt != null
        and ($prev.removedAt == null or $now.removedAt > $prev.removedAt)
        and ($now.state != "merged" and $now.state != "closed")
        and (($now.removedReason // "") | ascii_downcase) != "merged"
     then
       [ { level: "action",
           message: "\($id): PR #\($pr) left the merge queue (\(
             if ($now.removedReason // "") == "" then "no reason given"
             else $now.removedReason | ascii_downcase | gsub("_"; " ") end))" } ]
     else [] end) as $removal
  | (if $now.state == $prev.state then []
     elif $now.state == "failing" then
       (if ($removal | length) > 0 then [] else [ { level: "action", message: "\($id): PR #\($pr) has failing checks" } ] end)
     elif $now.state == "merged" then
       (if ($in.handoffs | length) > 0
        then [ { level: "action", message: "\($id) merged: hand-offs left: \($in.handoffs | join("; "))" } ]
        else [ { level: "info", message: "\($id): PR #\($pr) merged" } ] end)
     elif $now.state == "closed" then [ { level: "info", message: "\($id): PR #\($pr) closed without merging" } ]
     else [] end) as $change
  | {
      notices: ($removal + $change),
      entry: { pr: $pr, state: $now.state, removedAt: ($now.removedAt // $prev.removedAt),
               unresolved: ($now.unresolved // 0), at: $in.at }
    };

# Keep only the watched tickets in the state object
def prune($ids): (. // {}) | with_entries(select(.key as $k | $ids | index($k) != null));

# --- Attended-session pick: what an interactive /work-queue session would take next ---
# Input is an array of Linear issue nodes; mirrors "What to take next" and "The limit" in the skill.

# Seconds since epoch from an ISO timestamp, with or without milliseconds or seconds
def epoch:
  sub("\\.[0-9]+Z$"; "Z") | sub("T(?<hm>[0-9]{2}:[0-9]{2})Z$"; "T\(.hm):00Z") | fromdateiso8601;

# { id, at } from the first "**Claim:** <id> · <path> · <time>" line of the description, else null
def claim:
  [ (.description // "") | split("\n")[]
    | capture("^\\s*\\*\\*Claim:\\*\\* (?<id>.+?) · (?<path>.+) · (?<at>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z)\\s*$") ]
  | first
  | if . == null then null else { id, at: (.at | epoch) } end;

# Text of the first description line that starts with "**Next:** ", trimmed, else null
def next_line:
  [ (.description // "") | split("\n")[] | select(startswith("**Next:** ")) | ltrimstr("**Next:** ") | trim ]
  | first;

# { wait: copilot|ci, pr, sha, since } from a
# "**Next:** Waiting: <copilot|CI> · PR #<n>[ @ <sha>] · since <time>" line: the ticket is parked
# on an external wait. A CI wait names the pushed commit, so checks of the commit before it
# don't count; a CI marker without one resolves only by timing out. Linear stores `PR #123` as `PR [owner/repo#123](url)` once the PR is attached, so
# both read. Else null.
# Linear rewrites a bare `PR #123` once the PR is attached, into `[owner/repo#123](url)` or into
# a link titled with the PR's name, which drops the number. The skill writes the marker as a code
# span, which Linear leaves alone; the older forms still read where the number survived.
def parked:
  [ next_line // empty
    | ltrimstr("`") | rtrimstr("`")
    | capture("^Waiting: (?<wait>[A-Za-z]+) · PR (?:#|\\[[^\\]#]*#)?(?<pr>[0-9]+)(?:\\]\\([^)]*\\))?(?: @ (?<sha>[0-9a-f]{7,40}))? · since (?<at>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z)$")
    | { wait: (.wait | ascii_downcase), pr: (.pr | tonumber), sha: (.sha // null), since: (.at | epoch) }
    | select(.wait == "copilot" or .wait == "ci") ]
  | first;

# { resolved, outcome } for a parked issue. $waits maps identifier to { reviewed, rollup, oid };
# a missing entry is pending. Copilot answers within 20 minutes or not at all; CI checks that
# haven't finished on the named commit within an hour resolve as a timeout, so no ticket stays
# parked for good.
def wait_state($now; $waits):
  parked as $p
  | ($waits[.identifier] // {}) as $w
  | if $p.wait == "copilot" then
      if $w.reviewed == true then { resolved: true, outcome: "reviewed" }
      elif ($now - $p.since) >= 1200 then { resolved: true, outcome: "no review" }
      else { resolved: false, outcome: null }
      end
    else
      ($p.sha != null and (($w.oid // "") | startswith($p.sha))) as $head
      | if $head and $w.rollup == "SUCCESS" then { resolved: true, outcome: "success" }
        elif $head and ($w.rollup == "FAILURE" or $w.rollup == "ERROR") then { resolved: true, outcome: "failure" }
        elif ($now - $p.since) >= 3600 then { resolved: true, outcome: "timeout" }
        else { resolved: false, outcome: null }
        end
    end;

# The issue's agent:* label name, else null
def agent_label:
  [ (.labels.nodes // [])[].name | select(startswith("agent:")) ] | first;

# True when the ticket belongs to another repo
def other_repo:
  [ (.labels.nodes // [])[].name ] | any(. == "nx-plugins" or . == "enjinex");

# True when an open issue blocks this one
def blocked:
  [ (.inverseRelations.nodes // [])[]
    | select(.type == "blocks" and (.issue.state.type != "completed" and .issue.state.type != "canceled")) ]
  | length > 0;

# True when the newest comment is not the agent's
def answered:
  ((.comments.nodes // []) | sort_by(.createdAt) | last) as $c
  | $c != null and (($c.body | trim | startswith("**Agent")) | not);

# True when a human commented after the newest PR-ready or review-addressed comment, or review
# threads are unresolved.
# Only while the PR is open: once the watch has seen it merged or closed there is nothing to address.
def review_feedback($watch):
  ((.comments.nodes // [])
   | map(select(.body | startswith("**Agent: PR ready**") or startswith("**Agent: review addressed**")))
   | sort_by(.createdAt) | last) as $ready
  | ($watch[.identifier].state // "open") as $pr
  | ($pr != "merged" and $pr != "closed")
    and (( $ready != null
           and any((.comments.nodes // [])[]; (.body | startswith("**Agent") | not) and (.createdAt | epoch) > ($ready.createdAt | epoch)) )
         or (($watch[.identifier].unresolved // 0) > 0));

# Sort key for ready tickets: status, then priority (none last), then oldest first
def queue_order:
  [ ({ started: 0, unstarted: 1, backlog: 2, triage: 3 }[.state.type] // 4),
    (if .priority == 0 then 5 else .priority end),
    .createdAt ];

def is_open: .state.type != "completed" and .state.type != "canceled";

# What waits on Håkan after implementation: open reviews count toward the limit; hand-off
# tickets completed within 14 days are listed but don't count
def limit_used($now; $limit):
  [ .[] | select(agent_label == "agent:review") ] as $reviews
  | [ $reviews[] | select(is_open) | .identifier ] as $open
  | [ $reviews[]
      | select(.state.type == "completed" and .completedAt != null
               and ($now - (.completedAt | epoch)) <= 14 * 86400
               and (handoffs | length) > 0)
      | .identifier ] as $hand
  | { used: ($open | length), open: $open, handoffs: $hand };

# The whole queue: { at, limit, session, next, held, parked, table }. `next` is every actionable
# item in the order the skill takes them; `held` is what the limit keeps from starting; `parked`
# is every ticket waiting on a PR check or Copilot; `table` is what waits on Håkan, before and
# after implementation. $session comes from session_state, or null. $waits comes from
# waits.sh, keyed by identifier.
def queue_view($now; $limit; $watch; $session; $waits):
  map(select(other_repo | not)) as $all
  | ($all | limit_used($now; $limit)) as $lu0
  | ([ $all[] | select((agent_label == "agent:working" or agent_label == "agent:review")
                       and is_open and parked != null)
       | . + { park: parked, ws: wait_state($now; $waits) } ] | sort_by(.park.since)) as $park
  | ($park | map(.identifier)) as $parkIds
  | ([ $park[] | select(agent_label == "agent:working") ]) as $parkWorking
  # A parked working ticket holds a slot like an open review
  | ($lu0 + { used: ($lu0.used + ($parkWorking | length)) }) as $lu
  | ([ $all[] | select(agent_label == "agent:working") | . + { claim: claim } ]) as $working
  | ([ $working[] | select(.claim != null and ($now - .claim.at) < 7200 and (.identifier | IN($parkIds[]) | not)) ]
     | sort_by(.claim.at) | reverse
     | map({ ticket: .identifier, reason: "resume", detail: next_line })) as $fresh
  # No readable claim is no proof the session is gone: the skill takes over only a claim 2 h old
  | ([ $working[] | select(.claim == null and (.identifier | IN($parkIds[]) | not)) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "resume", detail: "no claim line" })) as $unclaimed
  | ([ $working[] | select(.claim != null and ($now - .claim.at) >= 7200) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "take over",
             detail: "claim \((($now - .claim.at) / 3600 | floor)) h old" })) as $stale
  # A stale parked ticket is taken over, not listed twice
  | ($stale | map(.ticket)) as $staleIds
  | ([ $park[] | select(.ws.resolved and (.identifier | IN($staleIds[]) | not))
       | { ticket: .identifier, reason: "parked wait resolved", detail: .ws.outcome } ]) as $resolved
  | ([ $all[] | select(agent_label == "agent:needs-input" and is_open and answered) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "answered", detail: null })) as $ans
  | ([ $all[] | select(agent_label == "agent:review" and is_open and (.identifier | IN($parkIds[]) | not)
                       and review_feedback($watch)) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "review feedback", detail: null })) as $fb
  | ([ $all[] | select(agent_label == "agent:ready" and is_open and (blocked | not)) ] | sort_by(queue_order)
     | map(.identifier)) as $rdy
  | ($lu.used >= $limit) as $full
  | ([ $all[] | select(agent_label == "agent:needs-input" and is_open and (answered | not)) ] | sort_by(queue_order)
     | map({ ticket: .identifier,
             kind: (if ((.comments.nodes // []) | sort_by(.createdAt) | last | .body // "" | trim
                        | startswith("**Agent: plan ready**")) then "plan" else "question" end) })) as $before
  | ($all | map({ key: .identifier, value: . }) | from_entries) as $by
  | {
      at: ($now | todateiso8601),
      limit: { used: $lu.used, max: $limit },
      session: $session,
      next: ($resolved + $fresh + $unclaimed + $stale + $ans + $fb
             + (if $full then [] else $rdy | map({ ticket: ., reason: "ready", detail: null }) end)),
      held: {
        tickets: (if $full then $rdy else [] end),
        free: (if $full and ($rdy | length) > 0
               then ($lu0.open | map({ action: "review", ticket: ., pr: ($watch[.].pr // null) }))
                    + ($parkWorking | map({ action: "wait", ticket: .identifier, pr: .park.pr }))
                    + [ { action: "limit", value: ($lu.used + 1) } ]
               else [] end)
      },
      parked: ($park | map({ ticket: .identifier, wait: .park.wait, pr: .park.pr,
                             since: (.park.since | todateiso8601),
                             resolved: .ws.resolved, outcome: .ws.outcome })),
      table: {
        before: $before,
        after: (($lu.open | map({ ticket: ., kind: "pr", pr: ($watch[.].pr // null) }))
                + ($lu.handoffs | map({ ticket: ., kind: "handoffs", items: ($by[.] | handoffs) })))
      }
    };
def queue_view($now; $limit; $watch; $session): queue_view($now; $limit; $watch; $session; {});

# The pick: { verdict: running|run|idle, ticket, reason, detail, waiting, used, limit }, the first
# of queue_view's `next`. A resumable ticket reads as running: a session may hold it.
def attended($now; $limit; $watch; $waits):
  queue_view($now; $limit; $watch; null; $waits) as $q
  | ($q.table.before | map(.ticket + " input")) as $inputs
  | ($q.table.after | map(.ticket + (if .kind == "pr" then " PR" else " hand-offs" end))) as $after
  | { used: $q.limit.used, limit: $limit, waiting: ($inputs + $after) }
    + ($q.next[0] as $n
       | if $n == null then { verdict: "idle", ticket: null, reason: null, detail: null }
         elif $n.reason == "resume" then { verdict: "running", ticket: $n.ticket, reason: "working", detail: $n.detail }
         else { verdict: "run", ticket: $n.ticket, reason: $n.reason, detail: $n.detail }
         end);
def attended($now; $limit; $watch): attended($now; $limit; $watch; {});

# One line for the attended pick object
def attended_line:
  if .verdict == "running" then "running: \(.ticket)" + (if .detail != null then " · \(.detail)" else "" end)
  elif .verdict == "run" then
    if .reason == "take over" then "run now: take over \(.ticket) (\(.detail))"
    # The outcome decides what the session does next: advance, fix CI, or read a timeout
    elif .reason == "parked wait resolved" then "run now: \(.ticket) parked wait resolved (\(.detail))"
    else "run now: \(.ticket) \(.reason)" end
  else
    "idle: " + (if (.waiting | length) > 0 then "waits on \(.waiting | join(", "))" else "nothing waiting" end)
    + "; limit \(.used)/\(.limit)"
  end;

# --- Session heartbeat: is an attended /work-queue session running? ---
# Input is an array of session files, each with pidAlive and watcherAlive added by run.sh
# (both null for a session mirrored from another host).

# { state: alive|waiting|stopped|none, detail, id, ticket, lastSeen } from the session files.
# Alive: not ended, process up, and a watcher running, an open prompt (however old), or a
# recent heartbeat from a turn that hasn't stopped. A stopped turn with no watcher wakes no one.
def session_state($now):
  [ .[] | select(.state != "ended") ] as $open
  | [ $open[] | select(
        # A mirrored session from another host has no pid to check: alive at a prompt or while polling
        # (run.sh deletes day-old files), otherwise while its heartbeat is fresh
        if .pidAlive == null then .state == "waiting" or .state == "polling"
                                  or (.state != "stopped" and ($now - (.lastSeen | epoch)) < 900)
        else .pidAlive
             and (.watcherAlive or .state == "waiting"
                  or (.state != "stopped" and ($now - (.lastSeen | epoch)) < 900))
        end) ] as $alive
  | ($alive | sort_by(.lastSeen | epoch) | last) as $s
  | if $s != null then
      { id: $s.id, ticket: ($s.ticket // null), lastSeen: ($s.lastSeen // null) }
      + if $s.state == "waiting" then { state: "waiting", detail: $s.detail }
        else { state: "alive", detail: (if $s.watcherAlive then "polling" else $s.state end) }
        end
    elif any($open[]; .pidAlive) then { state: "stopped", detail: null, id: null, ticket: null, lastSeen: null }
    else { state: "none", detail: null, id: null, ticket: null, lastSeen: null }
    end;

# Short text for the session_state object
def session_prefix:
  if .state == "alive" then "session \(.detail)"
  elif .state == "waiting" then "session waiting (\(.detail))"
  elif .state == "stopped" then "session stopped"
  else "no session"
  end;

# --- Implementing launch: should the scheduler start a /work-queue implement-only session? ---
# Input: the attended pick. $guards: { session (session_state), locked (implement.lock held),
# spent and cap (today's implement spend and the daily cap, USD), last ({ key, launches } of the
# previous launch, or null) }. Output: { action: launch|notify|skip, reason, key }, plus `last`,
# the state to store, only when the action is launch.
def launch($guards):
  (if .ticket == null then null else "\(.ticket) \(.reason)" end) as $key
  | ($guards.last // {}) as $prev
  # Counted per ticket and reason, so new work on a ticket starts fresh. A `take over` of the
  # ticket last launched is the same miss: a launched session that dies turns its pick into one.
  | (if $prev.key == $key
        or (.reason == "take over" and ($prev.key // "" | split(" ")[0]) == .ticket)
     then ($prev.launches // 0) else 0 end) as $done
  | { key: $key }
    + if .verdict != "run" or .reason == "ready" or $key == null then { action: "skip", reason: "nothing to implement" }
      elif ($guards.session.state // "none") == "alive" or ($guards.session.state // "none") == "waiting"
        then { action: "skip", reason: "a session is alive" }
      elif $guards.locked then { action: "skip", reason: "a launched session is still running" }
      # No cap is no licence to spend: fail safe
      elif ($guards.cap | type) != "number" then { action: "notify", reason: "no daily implement cap set" }
      elif ($guards.spent // 0) >= $guards.cap
        then { action: "notify", reason: "daily implement cap reached ($\($guards.spent) of $\($guards.cap))" }
      # A launch that ended without moving the pick is a miss; two misses on one key stop launching
      elif $done >= 2 then { action: "notify", reason: "\($done) launches changed nothing" }
      else { action: "launch", reason: null, last: { key: $key, launches: ($done + 1) } }
      end;
