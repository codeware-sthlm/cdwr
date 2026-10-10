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

# Text after the first "**Next:** " of the description, trimmed, else null
def next_line:
  (.description // "")
  | if contains("**Next:** ") then split("**Next:** ")[1] | split("\n")[0] | trim else null end;

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

# True when a human commented after the newest PR-ready comment, or review threads are unresolved
def review_feedback($watch):
  ((.comments.nodes // []) | map(select(.body | startswith("**Agent: PR ready**"))) | sort_by(.createdAt) | last) as $ready
  | ( $ready != null
      and any((.comments.nodes // [])[]; (.body | startswith("**Agent") | not) and (.createdAt | epoch) > ($ready.createdAt | epoch)) )
    or (($watch[.identifier].unresolved // 0) > 0);

# Sort key for ready tickets: status, then priority (none last), then oldest first
def queue_order:
  [ ({ started: 0, unstarted: 1, backlog: 2, triage: 3 }[.state.type] // 4),
    (if .priority == 0 then 5 else .priority end),
    .createdAt ];

def is_open: .state.type != "completed" and .state.type != "canceled";

# What waits on Håkan: open reviews and hand-off tickets completed within 14 days, the latter capped at limit - 3
def limit_used($now; $limit):
  [ .[] | select(agent_label == "agent:review") ] as $reviews
  | [ $reviews[] | select(is_open) | .identifier ] as $open
  | [ $reviews[]
      | select(.state.type == "completed" and .completedAt != null
               and ($now - (.completedAt | epoch)) <= 14 * 86400
               and (handoffs | length) > 0)
      | .identifier ] as $hand
  | { used: (($open | length) + ([ ($hand | length), ($limit - 3) ] | min)), open: $open, handoffs: $hand };

# The pick: { verdict: running|run|idle, ticket, reason, detail, waiting, used, limit }
def attended($now; $limit; $watch):
  map(select(other_repo | not)) as $all
  | ($all | limit_used($now; $limit)) as $lu
  | ([ $all[] | select(agent_label == "agent:needs-input" and is_open and (answered | not)) ] | sort_by(queue_order) | map(.identifier + " input")) as $inputs
  | ($inputs + ($lu.open | map(. + " PR")) + ($lu.handoffs | map(. + " hand-offs"))) as $waiting
  | { used: $lu.used, limit: $limit, waiting: $waiting } as $base
  | ([ $all[] | select(agent_label == "agent:working") | . + { claim: claim } ]) as $working
  | ([ $working[] | select(.claim != null and ($now - .claim.at) < 7200) ] | sort_by(.claim.at) | last) as $fresh
  | ([ $working[] | select(.claim == null or ($now - .claim.at) >= 7200) ] | sort_by(queue_order) | first) as $stale
  | ([ $all[] | select(agent_label == "agent:needs-input" and is_open and answered) ] | sort_by(queue_order) | first) as $ans
  | ([ $all[] | select(agent_label == "agent:review" and is_open and review_feedback($watch)) ] | sort_by(queue_order) | first) as $fb
  | ([ $all[] | select(agent_label == "agent:ready" and is_open and (blocked | not)) ] | sort_by(queue_order) | first) as $rdy
  | $base + (
      if $fresh != null then { verdict: "running", ticket: $fresh.identifier, reason: "working", detail: ($fresh | next_line) }
      elif $stale != null then
        { verdict: "run", ticket: $stale.identifier, reason: "take over",
          detail: (if $stale.claim == null then "no claim" else "claim \((($now - $stale.claim.at) / 3600 | floor)) h old" end) }
      elif $ans != null then { verdict: "run", ticket: $ans.identifier, reason: "answered", detail: null }
      elif $fb != null then { verdict: "run", ticket: $fb.identifier, reason: "review feedback", detail: null }
      elif $lu.used >= $limit then { verdict: "idle", ticket: null, reason: null, detail: null }
      elif $rdy != null then { verdict: "run", ticket: $rdy.identifier, reason: "ready", detail: null }
      else { verdict: "idle", ticket: null, reason: null, detail: null }
      end);

# One line for the attended pick object
def attended_line:
  if .verdict == "running" then "running: \(.ticket)" + (if .detail != null then " · \(.detail)" else "" end)
  elif .verdict == "run" then
    if .reason == "take over" then "run now: take over \(.ticket) (\(.detail))" else "run now: \(.ticket) \(.reason)" end
  else
    "idle: " + (if (.waiting | length) > 0 then "waits on \(.waiting | join(", "))" else "nothing waiting" end)
    + "; limit \(.used)/\(.limit)"
  end;
