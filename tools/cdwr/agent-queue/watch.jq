# Decision logic for the agent queue's PR watch. run.sh includes it:
#   jq -L "$HOME_DIR" 'include "watch"; ...'
# Only defs; the spec in src/commands/agent/watch.jq.spec.ts runs it through jq. jq 1.7 safe.

def trim: gsub("^\\s+|\\s+$"; "");

# Seconds since epoch from an ISO timestamp, with or without milliseconds or seconds
def epoch:
  sub("\\.[0-9]+Z$"; "Z") | sub("T(?<hm>[0-9]{2}:[0-9]{2})Z$"; "T\(.hm):00Z") | fromdateiso8601;

# --- Who wrote a Linear comment ---
# The queue writes to Linear as its own app user. Before the cutover it wrote as Håkan, so an older
# comment by him that carries the `**Agent` prefix is still the agent's. The prefix fallback can go
# 14 days after the cutover.
def agent_user_id: "bbbb4a33-e052-486e-8e0f-d3abb5c5c841";
def agent_cutover: "2026-11-10T22:00:00Z";

def agent_prefixed: (.body // "") | trim | startswith("**Agent");

# True for a comment node the agent wrote: by the queue's app user, or prefixed and older than the
# cutover. Another app user (a Linear integration) is not the agent. A node without a user (a query
# that didn't ask, an older installed lib.sh) falls back to the prefix.
def is_agent:
  if (.user | type) != "object" then agent_prefixed
  elif .user.id == agent_user_id then true
  else agent_prefixed and ((.createdAt | epoch) < (agent_cutover | epoch))
  end;

# True for the agent's comment of a kind, such as "**Agent: PR ready**": a person pasting the
# marker fakes no gate
def agent_kind($marker): is_agent and ((.body // "") | trim | startswith($marker));

# The number of a cdwr pull URL, else null
def pull_number:
  (capture("^https://github\\.com/codeware-sthlm/cdwr/pull/(?<n>[0-9]+)(?:[/?#]|$)") | .n | tonumber)? // null;

# PR number from the newest cdwr pull attachment of a Linear issue, else null
def pr_number:
  [ (.attachments.nodes // [])[] | select(.url | pull_number != null) ]
  | sort_by(.createdAt) | last
  | if . == null then null else .url | pull_number end;

# { what, status } for each row of the description's Status table (`| Step | What | Status |`),
# the rows under that header up to the first line that is not a table row. Other tables don't count.
def status_rows:
  [ foreach ((.description // "") | split("\n")[]) as $l
      ({ in: false, row: null };
       ($l | [ sub("^\\s*\\|"; "") | sub("\\|\\s*$"; "") | split("|")[] | trim ]) as $c
       | if ($l | test("^\\s*\\|") | not) then { in: false, row: null }
         elif ($c | map(ascii_downcase)) == ["step", "what", "status"] then { in: true, row: null }
         elif .in and ($c | length) >= 3 and (all($c[]; test("^:?-+:?$")) | not)
           then { in: true, row: { what: $c[1], status: $c[-1] } }
         else .row = null end;
       .row // empty) ];

# Open hand-off rows of the Status table: the What cell starts with "Hand-off" and the Status cell
# doesn't start with "Done" or "Dropped". The item is the What text after "Hand-off:", or the whole
# cell when nothing follows.
def status_handoffs:
  [ status_rows[]
    | select(.what | test("^hand-offs?\\b"; "i"))
    | select(.status | test("^(done|dropped)\\b"; "i") | not)
    | (.what | sub("^hand-offs?:?\\s*"; ""; "i")) as $t
    | if $t == "" then .what else $t end ];

# Unchecked items of the newest "PR ready" comment's "Hand-off checklist:" block. An unchecked item
# struck through (`- [ ] ~~item~~`, a reason may follow) is dropped, not waiting. A ticket that
# never got one (merged from a gate) falls back to the Status table's hand-off rows.
def handoffs:
  ([ (.comments.nodes // [])[] | select(agent_kind("**Agent: PR ready**")) ]
    | sort_by(.createdAt) | last) as $c
  | if $c == null then status_handoffs
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
            elif ($l | test("^\\s*[-*] \\[ \\] ~~")) then .
            elif ($l | test("^\\s*[-*] \\[ \\] ")) then
              .items += [ $l | capture("^\\s*[-*] \\[ \\] (?<t>.*)$").t | trim ]
            elif ($l | test("^\\s*[-*] \\[[xX]\\] ")) then .
            else .stop = true
            end)
          | .items
        end
    end;

# Reduce a GitHub pullRequest node to { state, removedAt, removedReason, unresolved,
# copilotThreads, threads, threadsTruncated, conflicting, draft, mergeable, mergeStateStatus, ci, copilot }.
# ci is the checks rollup state of the last commit (string or null). copilot is "reviewed" once
# Copilot has a review on the PR, "requested" while it is a requested reviewer, else "none".
# threads counts every unresolved review thread, whoever spoke last: main's ruleset needs them all
# resolved to merge. threadsTruncated is true when the query saw only the first page of threads, so
# threads may undercount and desk_verdict refuses to merge.
# unresolved counts open review threads a person or Copilot spoke last in, and copilotThreads the
# Copilot share of them: other bots and the agent's own replies, which leave a thread open on
# purpose, don't count.
# conflicting is true for CONFLICTING, false for MERGEABLE and null for UNKNOWN (GitHub computes
# it lazily), which step resolves to the previous value. A conflict beats failing checks: they are
# stale, and the rebase reruns them. draft and mergeable (the raw value, null when missing) and
# mergeStateStatus are only recorded: the desk reads draft and UNKNOWN as reasons not to merge.
def copilot_login: "copilot-pull-request-reviewer";

def pr_state:
  (.timelineItems.nodes // [] | last) as $r
  | ((.commits.nodes // [] | last | .commit.statusCheckRollup.state) // null) as $ci
  | [ (.reviewThreads.nodes // [])[] | select(.isResolved | not)
      | (.comments.nodes // [] | last)
      | select(. != null and ((.body // "") | startswith("**Agent") | not))
      | select(.author.__typename != "Bot" or .author.login == copilot_login) ] as $open
  | {
      state: (
        if .state == "MERGED" then "merged"
        elif .state == "CLOSED" then "closed"
        elif .mergeable == "CONFLICTING" then "conflicting"
        elif $ci == "FAILURE" or $ci == "ERROR" then "failing"
        elif .mergeQueueEntry != null then "queued"
        else "open"
        end),
      removedAt: ($r.createdAt // null),
      removedReason: ($r.reason // null),
      unresolved: ($open | length),
      copilotThreads: ([ $open[] | select(.author.login == copilot_login) ] | length),
      threads: ([ (.reviewThreads.nodes // [])[] | select(.isResolved | not) ] | length),
      threadsTruncated: (.reviewThreads.pageInfo.hasNextPage == true),
      conflicting: (if .mergeable == "CONFLICTING" then true elif .mergeable == "MERGEABLE" then false else null end),
      draft: (.isDraft == true),
      mergeable: (.mergeable // null),
      mergeStateStatus: (.mergeStateStatus // null),
      ci: $ci,
      copilot: (
        if any((.reviews.nodes // [])[]; (.author.login // "") | startswith("copilot-pull-request-reviewer")) then "reviewed"
        elif any((.reviewRequests.nodes // [])[];
                 (.requestedReviewer.login // "" | ascii_downcase) as $l
                 | ($l | startswith("copilot-pull-request-reviewer")) or $l == "copilot") then "requested"
        else "none" end)
    };

# One watch step: notices to send, whether to relabel, and the entry to store for the ticket.
# Leaving the queue by merging is also a removal event (reason "merged"); that is no notice.
# $in.agentLabel is the ticket's agent label (agent:review when absent or empty). Outside review
# a session still holds the ticket, so only a merge or a close notifies; a merge there asks for
# the relabel to agent:review until run.sh has stored `relabelled` for that PR.
# A conflict that reads UNKNOWN keeps the previous value, so the state stays conflicting and
# nothing is sent; a merged or closed PR conflicts with nothing.
def step:
  . as $in
  | $in.id as $id | $in.pr as $pr
  | (($in.agentLabel // "") | IN("", "agent:review")) as $review
  | (if $in.prev != null and $in.prev.pr == $pr then $in.prev else { state: "open", removedAt: null } end) as $prev
  | (if $in.now.state | IN("merged", "closed") then false
     elif $in.now.conflicting == null then $prev.conflicting == true
     else $in.now.conflicting end) as $conflicting
  | ($in.now + (if $conflicting then { state: "conflicting" } else {} end)) as $now
  | (if $review and $now.removedAt != null
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
       (if ($removal | length) > 0 or ($review | not) then [] else [ { level: "action", message: "\($id): PR #\($pr) has failing checks" } ] end)
     elif $now.state == "conflicting" then
       (if ($removal | length) > 0 or ($review | not) then [] else [ { level: "action", message: "\($id): PR #\($pr) conflicts with main" } ] end)
     elif $now.state == "merged" then
       (if ($in.handoffs | length) > 0
        then [ { level: "action", message: "\($id) merged: hand-offs left: \($in.handoffs | join("; "))" } ]
        else [ { level: "info", message: "\($id): PR #\($pr) merged" } ] end)
     elif $now.state == "closed" then [ { level: "info", message: "\($id): PR #\($pr) closed without merging" } ]
     else [] end) as $change
  | {
      notices: ($removal + $change),
      relabel: ($now.state == "merged" and ($review | not) and ($prev.relabelled != true)),
      # Outside review only a merge or a close is stored, so a check that failed or a removal
      # from the merge queue still notifies once the ticket reaches review. conflicting, ci,
      # copilot and threads are stored whatever the label, so the queue view sees them.
      entry: ({ pr: $pr,
                state: (if $review or ($now.state | IN("merged", "closed")) then $now.state else $prev.state end),
                removedAt: (if $review then $now.removedAt // $prev.removedAt else $prev.removedAt end),
                unresolved: ($now.unresolved // 0), copilotThreads: ($now.copilotThreads // 0),
                conflicting: $conflicting,
                draft: ($now.draft // false), mergeable: ($now.mergeable // null),
                ci: ($now.ci // null), copilot: ($now.copilot // "none"), threads: ($now.threads // 0),
                mergeStateStatus: ($now.mergeStateStatus // null), at: $in.at }
              + (if $prev.relabelled == true then { relabelled: true } else {} end))
    };

# The scheduler's verdict on a desk copilot or merge command, from the pullRequest node it just read
# (run.sh desk_pr_check): `ok <node id> <head oid>`, else why not. The desk's buttons use the same
# rules on the watch entry (apps/desk), so a refusal here means the PR changed since the desk read it.
def desk_verdict($kind):
  pr_state as $s
  | if .state != "OPEN" then "PR is \((.state // "unknown") | ascii_downcase)"
    elif $kind == "copilot" then
      if $s.copilot == "reviewed" then "Copilot has reviewed it"
      elif $s.copilot == "requested" then "Copilot review already requested"
      else "ok \(.id) \(.headRefOid)" end
    elif $kind != "merge" then "unknown kind"
    elif .isDraft == true then "PR is a draft"
    elif .mergeQueueEntry != null then "already in the merge queue"
    elif .mergeable == "CONFLICTING" then "conflicts with main"
    elif .mergeable != "MERGEABLE" then "GitHub has not checked for conflicts yet"
    elif $s.ci != "SUCCESS" then "checks \(($s.ci // "missing") | ascii_downcase)"
    elif $s.threadsTruncated then "too many review threads to check them all"
    elif $s.threads > 0 then "\($s.threads) unresolved \(if $s.threads == 1 then "thread" else "threads" end)"
    else "ok \(.id) \(.headRefOid)" end;

# The description with its first "**Next:** " line saying the PR merged at $when (ISO time) and
# what is handed off; the line is appended when there is none
def merged_next($when; $items):
  ($when | capture("^(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})T(?<hm>[0-9]{2}:[0-9]{2})")) as $t
  | ("**Next:** merged \($t.d) \($t.hm)Z; "
     + (if ($items | length) > 0 then "hand-off: \($items | join("; "))" else "no hand-offs" end)) as $line
  | (. // "" | rtrimstr("\n")) as $d
  | ($d | split("\n")) as $lines
  | ([ range(0; $lines | length) | select($lines[.] | startswith("**Next:** ")) ] | first) as $i
  | if $i != null then $lines | .[$i] = $line | join("\n")
    elif $d == "" then $line
    else $d + "\n\n" + $line
    end;

# --- Renovate PRs: a broken one becomes queue work (watch_renovate in run.sh) ---

# One step over Renovate's open PRs. Input: { prs, tickets, prev, at }: prs from `gh pr list --json
# number,title,url,headRefOid,mergeable,statusCheckRollup,commits`, tickets the `renovate`-labelled
# Linear issues with their attachments, prev the last renovate.json. Output: { state, notices }, the
# new renovate.json (one entry per open PR, keyed by its number) and the info notices to send.
# A PR is `tended` once a ticket carries it as an attachment, and is never offered again. Else
# `conflicting` when it conflicts with main and carries a commit not by Renovate (Renovate rebases
# its own unmodified branches), `failing` when a check failed, `fine` otherwise. Such a conflict
# beats failing checks, as in pr_state; an unmodified one is left to Renovate, unless its checks
# fail too. UNKNOWN mergeability keeps the previous value. A null prev (no renovate.json yet)
# sends no notices: the first run would announce every PR already broken.
def renovate_step:
  . as $in
  | ($in.prev == null) as $first
  | ($in.prev // {} | if type == "object" then . else {} end) as $prev
  | ([ ($in.tickets // [])[] | .identifier as $id
       | (.attachments.nodes // [])[] | (.url | pull_number) as $n | select($n != null)
       | { key: ($n | tostring), value: $id } ] | from_entries) as $tended
  | [ ($in.prs // [])[]
      | (.number | tostring) as $k
      | ($prev[$k] // {}) as $p
      | ([ (.statusCheckRollup // [])[]
           | select((.conclusion // "" | IN("FAILURE", "TIMED_OUT", "STARTUP_FAILURE"))
                    or (.state // "" | IN("FAILURE", "ERROR"))) ] | length > 0) as $failing
      | (any((.commits // [])[];
             [ (.authors // [])[] | (.login // ""), (.name // ""), (.email // "") ]
             | any(test("renovate"; "i")) | not)) as $modified
      | (if .mergeable == "CONFLICTING" then true elif .mergeable == "MERGEABLE" then false
         else $p.conflicting == true end) as $conflicting
      # A ticket once seen keeps tending its PR: past the query's page it would drop out
      | ($tended[$k] // $p.ticket // null) as $ticket
      | (if $ticket != null then "tended"
         elif $conflicting and $modified then "conflicting"
         elif $failing then "failing"
         else "fine" end) as $state
      | { pr: .number, title: (.title // ""), url: (.url // null), sha: (.headRefOid // null),
          state: $state, ticket: $ticket, modified: $modified, conflicting: $conflicting,
          at: (if $p.state == $state and $p.sha == .headRefOid then ($p.at // $in.at) else $in.at end),
          was: ($p.state // null) } ] as $entries
  | {
      state: ($entries | map({ key: (.pr | tostring), value: del(.was) }) | from_entries),
      notices: [ $entries[] | select($first | not) | select(.state != .was and (.state | IN("failing", "conflicting")))
                 | { level: "info",
                     message: "Renovate PR #\(.pr) \(if .state == "failing" then "has failing checks" else "conflicts with main" end): \(.title)" } ]
    };

# Keep only the watched tickets in the state object
def prune($ids): (. // {}) | with_entries(select(.key as $k | $ids | index($k) != null));

# --- Attended-session pick: what an interactive /work-queue session would take next ---
# Input is an array of Linear issue nodes; mirrors "What to take next" and "The limit" in the skill.

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

# { resolved, outcome } for a parked issue. $waits maps identifier to { state, reviewed, rollup, oid };
# a missing entry is pending. A PR that merged or closed ends the wait whatever it waited for.
# Copilot answers within 20 minutes or not at all; CI checks that haven't finished on the named
# commit within an hour resolve as a timeout, so no ticket stays parked for good.
def wait_state($now; $waits):
  parked as $p
  | ($waits[.identifier] // {}) as $w
  | if $w.state == "MERGED" then { resolved: true, outcome: "merged" }
    elif $w.state == "CLOSED" then { resolved: true, outcome: "closed" }
    elif $p.wait == "copilot" then
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

# An issue's `blocks` inverse relations, as the blocking issues
def blockers:
  [ (.inverseRelations.nodes // [])[] | select(.type == "blocks") | .issue ];

# The blockers not Done or Canceled; one that can't be read counts as open
def open_blockers:
  [ blockers[] | select((.state.type // "") | IN("completed", "canceled") | not) ];

# True when an open issue blocks this one
def blocked: open_blockers | length > 0;

# True for an open sub-issue that waits only on the label: no agent label of its own, not started,
# this repo, every blocker done and at least one of them agent work. Surfaced for Håkan, never labelled.
def to_label:
  blockers as $b
  | .parent != null
    # A closed parent is an abandoned split
    and (.parent.state.type // "" | IN("completed", "canceled") | not)
    and agent_label == null
    and (.state.type | IN("backlog", "unstarted", "triage"))
    and (other_repo | not)
    and ($b | length) > 0
    # A blocker set cut short could hide one still open: not listed rather than wrongly listed
    and (.inverseRelations.pageInfo.hasNextPage // false | not)
    and all($b[]; .state.type == "completed" or .state.type == "canceled")
    and any($b[]; agent_label != null);

# True for a written plan not yet started: a Status table whose rows are all Planned
def plan_unstarted:
  status_rows as $r
  | ($r | length) > 0 and all($r[]; .status | test("^planned\\b"; "i"));

# True when the newest comment is not the agent's
def answered:
  ((.comments.nodes // []) | sort_by(.createdAt) | last) as $c
  | $c != null and ($c | is_agent | not);

# True when a human commented after the newest PR-ready or review-addressed comment, or review
# threads are unresolved.
# Only while the PR is open: once the watch has seen it merged or closed there is nothing to address.
def review_comment:
  ((.comments.nodes // [])
   | map(select(agent_kind("**Agent: PR ready**") or agent_kind("**Agent: review addressed**")))
   | sort_by(.createdAt) | last) as $ready
  | $ready != null
    and any((.comments.nodes // [])[]; (is_agent | not) and (.createdAt | epoch) > ($ready.createdAt | epoch));

def review_feedback($watch):
  ($watch[.identifier].state // "open") as $pr
  | ($pr != "merged" and $pr != "closed")
    and (review_comment or (($watch[.identifier].unresolved // 0) > 0));

# "Copilot review" when Copilot's threads are the only review feedback, else null
def review_feedback_detail($watch):
  ($watch[.identifier] // {}) as $w
  | if (review_comment | not) and ($w.copilotThreads // 0) > 0 and ($w.copilotThreads // 0) == ($w.unresolved // 0)
    then "Copilot review" else null end;

# True for a merged ticket with a comment the agent hasn't answered: Done, the agent's work (a
# PR-ready comment or agent:review), and the newest comment not the agent's and newer than the
# merge, so a "merging" note or a gate answer before it is no pick. A first comment, a yes and a
# correction read alike; the session tells them apart from its own last reply. An open ticket is
# never one, so nothing here is listed twice.
def merged_comment:
  .state.type == "completed" and .completedAt != null
  and (agent_label == "agent:review"
       or any((.comments.nodes // [])[]; agent_kind("**Agent: PR ready**")))
  and answered
  and (((.comments.nodes // []) | sort_by(.createdAt) | last | .createdAt | epoch) > (.completedAt | epoch));

# Sort key for ready tickets: status, then priority (none last), then oldest first
def queue_order:
  [ ({ started: 0, unstarted: 1, backlog: 2, triage: 3 }[.state.type] // 4),
    (if .priority == 0 then 5 else .priority end),
    .createdAt ];

def is_open: .state.type != "completed" and .state.type != "canceled";

# True when an app added the ticket's agent:ready: the newest history entry adding it has an app
# user as its actor, the queue's own or any other integration. Only Håkan makes a ticket ready. No such entry in the page read counts as his:
# a guard that hides real work is worse than one that misses.
def ready_by_app:
  ([ (.history.nodes // [])[] | select(any((.addedLabels // [])[]; .name == "agent:ready")) ]
   | sort_by(.createdAt) | last) as $h
  | $h != null and ($h.actor.app == true or $h.actor.id == agent_user_id);

# --- Parent close: the scheduler's second Linear write (run.sh `close_parents`) ---

# True for an open parent whose agent split finished: this team and repo, no agent label of its
# own (a split clears it, so one there means a session, a question or new work holds it), a
# complete page of sub-issues all Done or Canceled, at least one Done and at least one agent work.
# A split whose sub-issues were all canceled stays for Håkan.
def parent_to_close:
  (.children.nodes // []) as $c
  | is_open
    and ((.team.key // "COD") == "COD")
    and (other_repo | not)
    and agent_label == null
    and ($c | length) > 0
    # A page cut short could hide a sub-issue still open
    and (.children.pageInfo.hasNextPage // false | not)
    and all($c[]; .state.type | IN("completed", "canceled"))
    and any($c[]; .state.type == "completed")
    and any($c[]; agent_label != null);

# The comment that goes with the close, sub-issues in number order
def close_comment:
  "**Agent: closed** all sub-issues are closed: "
  + ([ .children.nodes
       | sort_by(.identifier | capture("(?<n>[0-9]+)$").n | tonumber)[]
       | "\(.identifier) (\(if .state.type == "completed" then "Done" else "Canceled" end))" ]
     | join(", "))
  + ".";

# The state a parent closes to, from the team's states: the completed one named Done, else the
# first completed one by position; null when there is none
def done_state:
  [ .[] | select(.type == "completed") ] | sort_by(.position // 0) as $s
  | ([ $s[] | select(.name == "Done") ] + $s) | first | .id // null;

# From the PARENTS response (closed sub-issues with their parents): { state, parents: [{ id,
# identifier, comment }] }, each parent once. $closed lists the parents the scheduler closed before:
# one reopened since is Håkan's, never closed again.
def parents_to_close($closed):
  { state: ((.data.teams.nodes[0].states.nodes // []) | done_state),
    parents: ([ (.data.issues.nodes // [])[].parent | select(. != null) ]
              | unique_by(.identifier)
              | map(select(.identifier as $i | ($closed | index($i)) == null)
                    | select(parent_to_close)
                    | { id, identifier, comment: close_comment })) };

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

# The whole queue: { at, limit, session, next, held, blocked, refused, parked, renovate, table }.
# `next` is every actionable item in the order the skill takes them; `held` is what the limit keeps
# from starting; `blocked` is each answered plan not yet started that waits on its open blockers;
# `refused` is each ready ticket whose agent:ready the app added, never started; `parked` is every ticket waiting on a PR check or Copilot; `renovate` is every Renovate PR that is
# broken or tended; `table` is what waits on Håkan: before and after implementation, and sub-issues
# ready to label. $session comes from session_state, or null. $waits comes from waits.sh, keyed by
# identifier. $renovate is renovate.json (renovate_step's state); an untended broken PR is a `next`
# item `PR <n>` after merged comments, new work that the limit holds like a ready ticket.
def queue_view($now; $limit; $watch; $session; $waits; $renovate):
  map(select(other_repo | not)) as $all
  | ($all | limit_used($now; $limit)) as $lu0
  | ([ $all[] | select((agent_label == "agent:working" or agent_label == "agent:review")
                       and is_open and parked != null)
       | . + { park: parked, ws: wait_state($now; $waits) } ] | sort_by(.park.since)) as $park
  | ($park | map(.identifier)) as $parkIds
  | ([ $park[] | select(agent_label == "agent:working") ]) as $parkWorking
  # A parked working ticket holds a slot like an open review
  | ($lu0 + { used: ($lu0.used + ($parkWorking | length)) }) as $lu
  | ([ $all[] | select(agent_label == "agent:working" and is_open) | . + { claim: claim } ]) as $working
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
  # An answer on a plan not yet started waits for an open blocker to close
  | ([ $all[] | select(agent_label == "agent:needs-input" and is_open and answered) ] | sort_by(queue_order)
     | map(. + { hold: (blocked and plan_unstarted) })) as $answered
  | ($answered | map(select(.hold | not) | { ticket: .identifier, reason: "answered", detail: null })) as $ans
  | ($answered | map(select(.hold)
                     | { ticket: .identifier,
                         blockers: [ open_blockers[] | .identifier // "unknown" ] })) as $blocked
  | ([ $all[] | select(agent_label == "agent:review" and is_open and (.identifier | IN($parkIds[]) | not)
                       and review_feedback($watch)) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "review feedback", detail: review_feedback_detail($watch) })) as $fb
  # A review PR that conflicts with main is rebased; with review feedback it is listed there only
  | ($fb | map(.ticket)) as $fbIds
  | ([ $all[] | select(agent_label == "agent:review" and is_open
                       and (.identifier | IN($parkIds[]) | not) and (.identifier | IN($fbIds[]) | not)
                       and $watch[.identifier].conflicting == true
                       and (($watch[.identifier].state // "open") | IN("merged", "closed") | not)) ]
     | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "conflicts with main",
             detail: ($watch[.identifier].pr | if . == null then null else "PR #\(.)" end) })) as $conf
  # Not open review feedback: the PR merged, so the comment gets a suggestion, never a new commit
  | ([ $all[] | select(merged_comment and (.identifier | IN($parkIds[]) | not)) ]
     | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "merged comment", detail: null })) as $mc
  | ([ $all[] | select(agent_label == "agent:ready" and is_open and (blocked | not) and (ready_by_app | not)) ]
     | sort_by(queue_order) | map(.identifier)) as $rdy
  # Listed rather than dropped silently, so the desk and status show why it doesn't start
  | ([ $all[] | select(agent_label == "agent:ready" and is_open and ready_by_app) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "agent:ready set by the app" })) as $refused
  | ([ ($renovate // {} | if type == "object" then . else {} end)[]
       | select(.state | IN("failing", "conflicting", "tended")) ] | sort_by(.pr)) as $ren
  # Failing first: launch reads only the first pick, and implement-only runs take failing ones only
  | ([ $ren | map(select(.state != "tended")) | sort_by(.state != "failing")[] | { ticket: "PR \(.pr)", reason: "renovate", detail: .state } ]) as $renNext
  | ($lu.used >= $limit) as $full
  | ([ $all[] | select(agent_label == "agent:needs-input" and is_open and (answered | not)) ] | sort_by(queue_order)
     | map({ ticket: .identifier,
             kind: (if ((.comments.nodes // []) | sort_by(.createdAt) | last // {}
                        | agent_kind("**Agent: plan ready**")) then "plan" else "question" end) })) as $before
  | ($all | map({ key: .identifier, value: . }) | from_entries) as $by
  | {
      at: ($now | todateiso8601),
      limit: { used: $lu.used, max: $limit },
      session: $session,
      next: ($resolved + $fresh + $unclaimed + $stale + $ans + $fb + $conf + $mc
             + (if $full then [] else $renNext + ($rdy | map({ ticket: ., reason: "ready", detail: null })) end)),
      held: {
        tickets: (if $full then ($renNext | map(.ticket)) + $rdy else [] end),
        free: (if $full and (($rdy | length) + ($renNext | length)) > 0
               then ($lu0.open | map({ action: "review", ticket: ., pr: ($watch[.].pr // null) }))
                    + ($parkWorking | map({ action: "wait", ticket: .identifier, pr: .park.pr }))
                    + [ { action: "limit", value: ($lu.used + 1) } ]
               else [] end)
      },
      blocked: $blocked,
      refused: $refused,
      parked: ($park | map({ ticket: .identifier, wait: .park.wait, pr: .park.pr,
                             since: (.park.since | todateiso8601),
                             resolved: .ws.resolved, outcome: .ws.outcome })),
      renovate: ($ren | map({ pr, title, state, ticket })),
      table: {
        before: $before,
        label: ([ $all[] | select(to_label) ] | sort_by(queue_order)
                | map({ ticket: .identifier, parent: .parent.identifier, blockers: (blockers | map(.identifier)) })),
        after: (($lu.open | map({ ticket: ., kind: "pr", pr: ($watch[.].pr // null) }))
                + ($lu.handoffs | map({ ticket: ., kind: "handoffs", items: ($by[.] | handoffs) })))
      }
    };
def queue_view($now; $limit; $watch; $session; $waits): queue_view($now; $limit; $watch; $session; $waits; {});
def queue_view($now; $limit; $watch; $session): queue_view($now; $limit; $watch; $session; {});

# The pick: { verdict: running|run|idle, ticket, reason, detail, waiting, used, limit }, the first
# of queue_view's `next`. A resumable ticket reads as running: a session may hold it.
def attended($now; $limit; $watch; $waits; $renovate):
  queue_view($now; $limit; $watch; null; $waits; $renovate) as $q
  | ($q.table.before | map(.ticket + " input")) as $inputs
  | ($q.table.after | map(.ticket + (if .kind == "pr" then " PR" else " hand-offs" end))) as $after
  | ($q.table["label"] | map(.ticket + " label")) as $labels
  | { used: $q.limit.used, limit: $limit, waiting: ($inputs + $after + $labels) }
    + ($q.next[0] as $n
       | if $n == null then { verdict: "idle", ticket: null, reason: null, detail: null }
         elif $n.reason == "resume" then { verdict: "running", ticket: $n.ticket, reason: "working", detail: $n.detail }
         else { verdict: "run", ticket: $n.ticket, reason: $n.reason, detail: $n.detail }
         end);
def attended($now; $limit; $watch; $waits): attended($now; $limit; $watch; $waits; {});
def attended($now; $limit; $watch): attended($now; $limit; $watch; {});

# One line for the attended pick object
def attended_line:
  if .verdict == "running" then "running: \(.ticket)" + (if .detail != null then " · \(.detail)" else "" end)
  elif .verdict == "run" then
    if .reason == "take over" then "run now: take over \(.ticket) (\(.detail))"
    # The outcome decides what the session does next: advance, fix CI, or read a timeout
    elif .reason == "parked wait resolved" then "run now: \(.ticket) parked wait resolved (\(.detail))"
    elif .reason == "review feedback" and .detail != null then "run now: \(.ticket) review feedback (\(.detail))"
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
        # for three hours (a polling session re-mirrors whenever its watcher restarts, at most 110
        # minutes apart), so a host that died there holds the queue no longer; otherwise while its
        # heartbeat is fresh
        if .pidAlive == null then ((.state == "waiting" or .state == "polling") and ($now - (.lastSeen | epoch)) < 10800)
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
# spent and cap (today's implement spend and the daily cap, USD; spent is null when the ledger
# is unreadable), last ({ key, launches } of the
# previous launch, or null) }. Output: { action: launch|notify|skip, reason, key }, plus `last`,
# the state to store, only when the action is launch.
def launch($guards):
  # implement.sh takes the key's first word as the ticket, so a Renovate pick's `PR 754` is `PR-754`
  (if .ticket == null then null else "\(.ticket | gsub(" "; "-")) \(.reason)" end) as $key
  | ($guards.last // {}) as $prev
  # Counted per ticket and reason, so new work on a ticket starts fresh. A `take over` of the
  # ticket last launched is the same miss: a launched session that dies turns its pick into one.
  | (if $prev.key == $key
        or (.reason == "take over" and ($prev.key // "" | split(" ")[0]) == .ticket)
     then ($prev.launches // 0) else 0 end) as $done
  | { key: $key }
    + if .verdict != "run" or .reason == "ready" or $key == null then { action: "skip", reason: "nothing to implement" }
      # An implement-only run files a ticket for a failing Renovate PR; a conflict on a modified
      # branch is attended work
      elif .reason == "renovate" and .detail != "failing" then { action: "skip", reason: "a Renovate conflict waits for an attended session" }
      elif ($guards.session.state // "none") == "alive" or ($guards.session.state // "none") == "waiting"
        then { action: "skip", reason: "a session is alive" }
      elif $guards.locked then { action: "skip", reason: "a launched session is still running" }
      # No cap is no licence to spend: fail safe
      elif ($guards.cap | type) != "number" then { action: "notify", reason: "no daily implement cap set" }
      # run.sh passes null for a ledger it couldn't sum: fail closed, and say so
      elif ($guards.spent | type) != "number" then { action: "notify", reason: "spend ledger unreadable" }
      elif $guards.spent >= $guards.cap
        then { action: "notify", reason: "daily implement cap reached ($\($guards.spent) of $\($guards.cap))" }
      # A launch that ended without moving the pick is a miss; two misses on one key stop launching
      elif $done >= 2 then { action: "notify", reason: "\($done) launches changed nothing" }
      else { action: "launch", reason: null, last: { key: $key, launches: ($done + 1) } }
      end;
