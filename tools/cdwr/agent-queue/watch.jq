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

# The agent's newest "**Agent: PR ready**" comment of a Linear issue node, else null. The hand-off
# checklist and the Apply list are both read from it.
def pr_ready_comment:
  [ (.comments.nodes // [])[] | select(agent_kind("**Agent: PR ready**")) ]
  | sort_by(.createdAt) | last;

# The indexes of the item lines of the Apply list block in $lines (a comment body split at newlines).
# The header is the first line that, trimmed and without its leading and trailing `**`, reads
# `apply list:` in any case. After it blank lines are skipped, a `- [ ]` / `- [x]` line is an item and
# any other line ends the block. [] without a header.
def apply_block_indexes($lines):
  ([ range(0; $lines | length)
     | select($lines[.] | trim | gsub("^\\*\\*|\\*\\*$"; "") | ascii_downcase == "apply list:") ]
   | first) as $i
  | if $i == null then []
    else
      reduce range($i + 1; $lines | length) as $n ({ idx: [], stop: false };
        if .stop then .
        elif ($lines[$n] | test("^\\s*$")) then .
        elif ($lines[$n] | test("^\\s*[-*] \\[( |x|X)\\] ")) then .idx += [ $n ]
        else .stop = true
        end)
      | .idx
    end;

# One Apply list item line as { text, spec, kind, args, afterDeploy, checked, dropped, outcome }.
# text is what follows the box, trimmed; spec and outcome are its parts around the first " · "
# (outcome null without one). kind is the first token of spec, args the rest, less a last token
# `after-deploy` that sets afterDeploy. dropped is an unchecked item struck through with `~~`.
def apply_parse($line):
  ($line | capture("^\\s*[-*] \\[(?<b> |x|X)\\] (?<t>.*)$")) as $m
  | ($m.t | trim) as $text
  | (($text | capture("^(?<s>.*?) · (?<o>.*)$")) // null) as $parts
  | (if $parts == null then $text else $parts.s | trim end) as $spec
  | ([ $spec | scan("\\S+") ]) as $tok
  | (($tok | last) == "after-deploy") as $after
  | (if $after then $tok[:-1] else $tok end) as $rest
  | { text: $text, spec: $spec, kind: $rest[0], args: $rest[1:], afterDeploy: $after,
      checked: ($m.b != " "),
      dropped: ($m.b == " " and ($text | startswith("~~"))),
      outcome: (if $parts == null then null else $parts.o | trim end) };

# The items of the Apply list block in the newest PR-ready comment, [] without a comment or a block
def apply_items:
  pr_ready_comment as $c
  | if $c == null then []
    else
      (($c.body // "") | split("\n")) as $lines
      | [ apply_block_indexes($lines)[] | apply_parse($lines[.]) ]
    end;

# What run.sh snapshots at merge, from a Linear issue node: { commentId, items } of the Apply list
# items that are pending (open, so not checked or dropped, and without an outcome), each as
# { spec, kind, args, afterDeploy, status: "pending" }. null when no item is pending.
def apply_input:
  pr_ready_comment as $c
  | [ apply_items[] | select(.checked or .dropped | not) | select(.outcome == null)
      | { spec, kind, args, afterDeploy, status: "pending" } ] as $p
  | if ($p | length) == 0 then null else { commentId: $c.id, items: $p } end;

# Unchecked items of a comment body's checklist block: the line $heading (bold or not, any case),
# then `- [ ] <item>` lines up to the first line that is not an item. An unchecked item struck
# through (`- [ ] ~~item~~`, a reason may follow) is dropped, not waiting. No such block: [].
def checklist($heading):
  split("\n") as $lines
  | ([ range(0; $lines | length)
       | select($lines[.] | trim | gsub("^\\*\\*|\\*\\*$"; "") | ascii_downcase == $heading) ]
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
    end;

# Unchecked items of the newest "PR ready" comment's "Hand-off checklist:" block. A ticket that
# never got one (merged from a gate) falls back to the Status table's hand-off rows.
def checklist_handoffs:
  pr_ready_comment as $c
  | if $c == null then status_handoffs else $c.body // "" | checklist("hand-off checklist:") end;

# Unchecked items of the newest "PR ready" comment's "After the merge, the agent checks:" block:
# checks an implementing run makes once the PR merged and the hand-offs are done
def merge_checks:
  pr_ready_comment as $c
  | if $c == null then [] else $c.body // "" | checklist("after the merge, the agent checks:") end;

# What waits for a person after the merge: the open hand-off checklist items, plus every open Apply
# list item whatever its outcome (the NUC applies it, or refused it and left it unchecked)
def handoffs:
  checklist_handoffs + [ apply_items[] | select(.checked or .dropped | not) | .spec ];

# Reduce a GitHub pullRequest node to { state, removedAt, removedReason, unresolved,
# copilotThreads, threads, threadsTruncated, conflicting, draft, mergeable, mergeStateStatus, ci,
# mergeCommit, copilot }. mergeCommit is the merge commit's oid, null while unmerged.
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
      oid: (.headRefOid // null),
      mergedAt: (.mergedAt // null),
      mergeCommit: (.mergeCommit.oid // null),
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
# $in.parked is the ticket's parked wait (parked, or null). askCopilot asks run.sh to request
# Copilot; run.sh stores the outcome as the entry's copilotAsked { at, ok, why }, which is kept
# while the PR stays the same, so the request is made once per PR.
# $in.apply is apply_input (null when no Apply list item is pending), $in.left the checklist
# hand-offs (checklist_handoffs) and $in.mergedAt when GitHub merged the PR (may be null). The step
# that first sees the PR merged with pending items snapshots them into entry.apply, with the merge
# commit, and sends no merge notice: run.sh sends one when the list has run (apply_summary). Once
# stored, entry.apply is kept while the PR stays the same, as copilotAsked is.
# $in.title is the PR's title, carried only into own: the events run.sh keeps in own.jsonl.
def step:
  . as $in
  | $in.id as $id | $in.pr as $pr
  | (($in.agentLabel // "") | IN("", "agent:review")) as $review
  | (if $in.prev != null and $in.prev.pr == $pr then $in.prev else { state: "open", removedAt: null } end) as $prev
  | (if $in.now.state | IN("merged", "closed") then false
     elif $in.now.conflicting == null then $prev.conflicting == true
     else $in.now.conflicting end) as $conflicting
  | ($in.now + (if $conflicting then { state: "conflicting" } else {} end)) as $now
  # Only on the step that sees the merge: a list posted after it is never applied
  | ($now.state == "merged" and $prev.state != "merged" and $prev.apply == null
     and (($in.apply.items // []) | length) > 0) as $snap
  | ($prev.autoMerge // null) as $am0
  | ($review and $now.removedAt != null
     and ($prev.removedAt == null or $now.removedAt > $prev.removedAt)
     and ($now.state != "merged" and $now.state != "closed")
     and (($now.removedReason // "") | ascii_downcase) != "merged") as $removed
  | (if ($now.removedReason // "") == "" then "no reason given"
     else $now.removedReason | ascii_downcase | gsub("_"; " ") end) as $why
  # A PR the watch enqueued once gets one retry when a session can fix the cause: a conflict
  # through the conflict pick, failing checks through the merge-queue pick, both on a new head. Any
  # other reason (the queue cleared, a ruleset, a rollback) and a second removal are Håkan's.
  | ($conflicting or ($why | test("fail|conflict|check|timeout"))) as $fixable
  | ($removed and $am0 != null and ($am0.tries // 0) == 1 and $am0.held == null) as $first
  | ($first and $fixable) as $retry
  | (if $removed | not then []
     elif $retry then [ { level: "info", message: "\($id): PR #\($pr) left the merge queue (\($why)), retrying once" } ]
     elif $first then [ { level: "action", message: "\($id): PR #\($pr) left the merge queue (\($why)), the merge is yours" } ]
     elif $am0 != null and ($am0.tries // 0) >= 2 and $am0.held == null
       then [ { level: "action", message: "\($id): PR #\($pr) left the merge queue again (\($why)), the merge is yours" } ]
     else [ { level: "action", message: "\($id): PR #\($pr) left the merge queue (\($why))" } ] end) as $removal
  | (if $am0 == null then null
     elif $retry then $am0 + { removed: { at: $now.removedAt, reason: $why, oid: ($now.oid // null) } }
     elif $first then $am0 + { held: "merge queue refused: \($why)" }
     elif $removed and ($am0.tries // 0) >= 2 then $am0 + { held: "merge queue refused twice" }
     else $am0 end) as $am
  # The watch's own merge (merge_verdict, computed by the caller as $in.merge): at most two
  # enqueues per PR, never twice on one head, never after a hand-over to Håkan
  | ($in.merge // null) as $mv
  | ($mv != null and ($mv.verdict // "" | startswith("ok ")) and $review and $now.state == "open"
     and ($am == null or (($am.tries // 0) < 2 and $am.held == null and $am.oid != $now.oid))) as $enqueue
  # A PR-ready comment that says it merges on its own, refused for a reason that lasts: told once a head
  | ($mv != null and $mv.claimed == true and $review and ($enqueue | not)
     and ($mv.verdict // "" | startswith("ok ") | not) and ($mv.transient != true)
     and ($am == null or $am.held == null)
     and ($now.state | IN("merged", "closed") | not)
     and $prev.mergeHeld != ($now.oid // "")) as $heldNow
  | (if $snap or $now.state == $prev.state then []
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
  | (if $heldNow then [ { level: "action", message: "\($id): PR #\($pr) held: \($mv.verdict)" } ] else [] end) as $held
  # What the watch did on its own, for own_actions: a PR it enqueued first seen merged, its removal
  # from the queue, and a claimed merge it held. Each event_id is the same on a repeated step.
  # A merge after the watch handed it to Håkan (held) is his, not the queue's
  | ((if $now.state == "merged" and $prev.state != "merged" and ($am0.tries // 0) >= 1 and $am0.held == null
      then [ { event_id: "merge:\($id):\($pr):merged", result: "merged", reason: null } ] else [] end)
     + (if $removed and $am0 != null
        then [ { event_id: "merge:\($id):\($pr):left:\($now.removedAt)", result: "left-queue",
                 reason: (if $retry then "\($why), retrying once" else $why end) } ] else [] end)
     + (if $heldNow
        then [ { event_id: "merge:\($id):\($pr):held:\($now.oid // "")", result: "held", reason: $mv.verdict } ]
        else [] end)
     | map({ kind: "merge", ticket: $id, pr: $pr, title: ($in.title // null), target: null, at: $in.at } + .)) as $own
  | {
      notices: ($removal + $change + $held),
      own: $own,
      relabel: ($now.state == "merged" and ($review | not) and ($prev.relabelled != true)),
      # run.sh enqueues with the node id and head oid of the verdict. On success the entry's
      # autoMerge stands; on failure run.sh stores autoMergeFailed instead, so that head is not tried again.
      enqueue: $enqueue,
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
                mergeStateStatus: ($now.mergeStateStatus // null), oid: ($now.oid // null),
                mergedAt: ($now.mergedAt // $prev.mergedAt // null),
                mergeCommit: ($now.mergeCommit // $prev.mergeCommit // null), at: $in.at }
              + (if $prev.relabelled == true then { relabelled: true } else {} end)
              + (if $prev.copilotAsked != null then { copilotAsked: $prev.copilotAsked } else {} end)
              + (if $snap then
                   { apply: { commentId: $in.apply.commentId, mergedAt: ($in.mergedAt // null),
                              sha: ($now.mergeCommit // null), at: $in.at, left: ($in.left // []),
                              items: $in.apply.items, invalid: null, done: false } }
                 elif $prev.apply != null then { apply: $prev.apply }
                 else {} end)
              + (if $enqueue then { autoMerge: (($am // {}) + { at: $in.at, tries: (($am.tries // 0) + 1), oid: $now.oid })
                                                | del(.removed, .failed) }
                 elif $am != null then { autoMerge: $am } else {} end)
              + (if $prev.deploy != null then { deploy: $prev.deploy } else {} end)
              + (if $heldNow then { mergeHeld: ($now.oid // "") }
                 elif $prev.mergeHeld != null then { mergeHeld: $prev.mergeHeld } else {} end)),
      autoMergeFailed: (if $enqueue then (($am // { tries: 0 }) + { at: $in.at, oid: $now.oid, failed: true }) else null end)
    }
  # The scheduler asks Copilot once per PR, while the ticket is parked on Copilot for this open PR
  # and nobody has asked yet: GitHub's automatic review skips a PR the app opened
  | .askCopilot = ($in.parked.wait == "copilot" and $in.parked.pr == $pr
                   and ($in.now.state | IN("merged", "closed") | not)
                   and ($in.now.copilot // "none") == "none" and .entry.copilotAsked == null);

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

# The scheduler's verdict on a desk restart or gate command, from the `cdwr --dry-run --json`
# envelope it just ran (run.sh desk_platform_check): `ok`, else why not. $args is the command's args
# as the desk sent them: restart `{tenant, app, sha}` (sha null when the desk showed none), gate
# `{tenant, action}`. The dry run reads the live state, so a refusal means it changed since.
def platform_verdict($kind; $args):
  (.plan.json // null) as $j
  | if .ok != true then "the dry run failed: \((.error.message // "no reason") | tostring | .[0:120])"
    elif $j == null then "the dry run carried no state"
    elif $j.environment != "production" then "not a production target"
    elif $kind == "restart" then
      ($j.machines // []) as $m
      | ([ $m[] | .sha | select(. != null) ] | unique) as $shas
      | if $j.app != $args.app then "the dry run read \($j.app), not \($args.app)"
        elif ($m | length) == 0 then "\($args.app) has no machines"
        elif $args.sha == null then "ok"
        elif any($shas[]; . as $s | $s | startswith($args.sha) or ($args.sha | startswith($s)) | not)
          then "\($args.app) runs \($shas | map(.[0:7]) | join(", ")) now, not \($args.sha[0:7])"
        else "ok" end
    elif $kind == "gate" then
      ($j.apps // []) as $a
      | [ $a[] | select(.onFly != "unreachable") ] as $live
      | [ $a[] | select((.flyError // "") != "") ] as $failed
      | if $j.tenant != $args.tenant then "the dry run read \($j.tenant), not \($args.tenant)"
        elif ($a | length) == 0 then "Infisical lists no app for \($args.tenant)"
        # Which side failed: Infisical listed apps, but Fly refused to read them
        elif ($live | length) == 0 and ($failed | length) > 0 then
          "Fly refused \($failed[0].flyApp): \($failed[0].flyError)"
          + (if ($failed | length) > 1 then " (+\(($failed | length) - 1) more)" else "" end)
          | if length > 160 then .[0:159] + "…" else . end
        elif ($live | length) == 0 then "\($args.tenant) has no deployed app"
        elif $args.action == "close" and all($live[]; .onFly == "set") and all($a[]; .inInfisical)
          then "already closed"
        elif $args.action == "open" and all($live[]; .onFly != "set") and all($a[]; .inInfisical | not)
          then "already open"
        elif ($args.action | IN("open", "close") | not) then "unknown action"
        else "ok" end
    else "unknown kind" end;

# The scheduler's verdict on one Apply list item, from the `cdwr --dry-run --json` envelope it just
# ran for it (run.sh): `ok`, else why not. $item is { kind, args }. The first three checks are
# platform_verdict's; the secret kinds read their own environment and folder. scale answers `already <n>` when the app runs that many machines: a success
# run.sh ticks without applying. supabase-migration's `already applied` is a refusal.
def apply_verdict($item):
  (.plan.json // null) as $j
  | ($item.args // []) as $a
  | if .ok != true then "the dry run failed: \((.error.message // "no reason") | tostring | .[0:120])"
    # A secret command with nothing to change ends with `nothing` and no plan: that is its tick
    elif $j == null and ($item.kind | startswith("secret-")) and ((.nothing // "") | strings | startswith("already "))
      then .nothing
    elif $j == null then "the dry run carried no state"
    elif ($item.kind | startswith("secret-") | not) and $j.environment != "production" then "not a production target"
    elif $item.kind | startswith("secret-") then
      if $j.environment != $a[0] then "the dry run read \($j.environment), not \($a[0])"
      elif $j.folder != $a[1] then "the dry run read \($j.folder), not \($a[1])"
      elif $item.kind == "secret-copy" then
        if $j.from != $a[2] then "the dry run read \($j.from), not \($a[2])"
        elif $j.to != $a[3] then "the dry run read \($j.to), not \($a[3])"
        elif $j.state == "absent" then "ok"
        elif $j.state == "same" then "already copied"
        elif $j.state == "different" then "\($a[3]) at \($a[1]) already holds another value"
        else "the dry run carried no state" end
      elif $item.kind == "secret-rewrite" then
        if $j.key != $a[2] then "the dry run read \($j.key), not \($a[2])"
        elif $j.shape.passwordKept != true then "the rewrite would change the password"
        elif $j.state == "same" then "already rewritten"
        elif $j.state == "absent" then "\($a[2]) is absent at \($a[1])"
        elif $j.state == "different" then "ok"
        else "the dry run carried no state" end
      elif $item.kind == "secret-set" then
        if $j.key != $a[2] then "the dry run read \($j.key), not \($a[2])"
        elif $j.value != $a[3] then "the dry run read another value"
        elif $j.state == "same" then "already set"
        else "ok" end
      else "unknown kind" end
    elif $item.kind == "restart" then
      if $j.app != $a[0] then "the dry run read \($j.app), not \($a[0])"
      elif (($j.machines // []) | length) == 0 then "\($a[0]) has no machines"
      else "ok" end
    elif $item.kind == "scale" then
      if $j.app != $a[0] then "the dry run read \($j.app), not \($a[0])"
      elif $j.count == (($a[1] | tonumber?) // null) then "already \($j.count)"
      else "ok" end
    elif $item.kind == "deploy-workflow" then
      if $j.app != $a[0] then "the dry run read \($j.app), not \($a[0])"
      else "ok" end
    elif $item.kind == "supabase-migration" then
      if $j.file != $a[0] then "the dry run read \($j.file), not \($a[0])"
      elif $j.applied == true then "already applied"
      elif $j.dryRun != "ok" then "the dry run did not pass"
      else "ok" end
    else "unknown kind" end;

# A PR-ready comment body with the first Apply list item line whose spec is $spec, unchecked and
# without an outcome rewritten to `<indent and bullet> [x] <spec> · <outcome>` (`[ ]` when $ticked
# is false). Every other byte stays; unchanged when no line matches.
def apply_mark($spec; $outcome; $ticked):
  . as $body
  | ($body | split("\n")) as $lines
  | ([ apply_block_indexes($lines)[]
       | select(apply_parse($lines[.]) | .spec == $spec and (.checked | not) and .outcome == null) ]
     | first) as $i
  | if $i == null then $body
    else
      ($lines[$i] | capture("^(?<p>\\s*[-*]) \\[ \\] ")) as $m
      | $lines | .[$i] = "\($m.p) [\(if $ticked then "x" else " " end)] \($spec) · \($outcome)"
      | join("\n")
    end;

# The notice for an Apply list that has run, from the watch entry's `apply` ({ items, left, invalid,
# … }): { level, message }. An invalid list names why nothing ran; a refused item names where it
# stopped, what was applied before it and what is left for the person; otherwise the applied items
# are listed, with their outcome when it says `already …`.
def apply_summary($id):
  (.items // []) as $items
  | (.left // []) as $left
  | ([ $items[] | select(.status == "applied")
       | .spec + (if (.outcome // "") | startswith("already") then " (\(.outcome))" else "" end) ]) as $applied
  | ([ $items[] | select(.status == "refused") ] | first) as $r
  | if .invalid != null then
      { level: "action", message: "\($id): apply list not applied: \(.invalid)" }
    elif $r != null then
      { level: "action",
        message: ("\($id): apply list stopped at \($r.spec): \(($r.outcome // "") | sub("^refused: "; ""))"
                  + (if ($applied | length) > 0 then "; applied \($applied | join(", "))" else "" end)
                  + (if ($left | length) > 0 then "; left for you: \($left | join("; "))" else "" end)) }
    else
      { level: (if ($left | length) > 0 then "action" else "info" end),
        message: ("\($id) merged: applied \($applied | join(", "))"
                  + (if ($left | length) > 0 then "; left for you: \($left | join("; "))" else "; nothing left for you" end)) }
    end;

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

# { id, at } from the first "**Claim:** <id> · <path> · <time>" line of the description, else null.
# The first " · <time>" after the path counts; a note after it is tolerated.
def claim:
  [ (.description // "") | split("\n")[]
    | capture("^\\s*\\*\\*Claim:\\*\\* (?<id>.+?) · (?<path>.+?) · (?<at>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z)(\\s.*)?$") ]
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
# Copilot answers within 20 minutes or not at all, counted from the scheduler's request when the
# watch entry ($watch) holds one that GitHub took for this PR, else from `since`; CI checks that
# haven't finished on the named commit within an hour resolve as a timeout, so no ticket stays
# parked for good.
def copilot_asked($watch):
  parked as $p
  | ($watch[.identifier] // {}) as $e
  | if $p != null and $e.pr == $p.pr then $e.copilotAsked // null else null end;

def wait_state($now; $waits; $watch):
  parked as $p
  | ($waits[.identifier] // {}) as $w
  | copilot_asked($watch) as $asked
  | if $w.state == "MERGED" then { resolved: true, outcome: "merged" }
    elif $w.state == "CLOSED" then { resolved: true, outcome: "closed" }
    elif $p.wait == "copilot" then
      (if $asked.ok == true then ($asked.at | epoch) else $p.since end) as $from
      | if $w.reviewed == true then { resolved: true, outcome: "reviewed" }
        elif ($now - $from) >= 1200 then { resolved: true, outcome: "no review" }
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
def wait_state($now; $waits): wait_state($now; $waits; {});

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

# The report's lines: the description before its `## Plan` heading, so a plan's own "Open questions"
# never count
def report:
  ((.description // "") | split("\n")) as $l
  | ([ range(0; $l | length) | select($l[.] | test("^##\\s+plan\\s*$"; "i")) ] | first) as $i
  | if $i == null then $l else $l[:$i] end;

# True when the report asks Håkan first: a line `**Ask me before implementing**`, or a heading or
# bold line starting "Open question". Such a ticket keeps the plan gate, and a split part is listed
# for him to label rather than labelled.
def asks_first:
  any(report[]; trim | test("^\\*\\*ask me before implementing\\b"; "i")
                       or test("^(#+\\s*|\\*\\*)open questions?\\b"; "i"));

# True for an open sub-issue whose split is ready for it: not started, this repo, every blocker
# done and at least one of them agent work. Whether it carries an agent label is left to the caller.
def split_ready:
  blockers as $b
  | .parent != null
    # A closed parent is an abandoned split
    and (.parent.state.type // "" | IN("completed", "canceled") | not)
    and (.state.type | IN("backlog", "unstarted", "triage"))
    and (other_repo | not)
    and ($b | length) > 0
    # A blocker set cut short could hide one still open: not listed rather than wrongly listed
    and (.inverseRelations.pageInfo.hasNextPage // false | not)
    and all($b[]; .state.type == "completed" or .state.type == "canceled")
    and any($b[]; agent_label != null);

# True when the queue's own `**Agent: labelled ready**` comment is on the ticket: label_parts
# labelled it once, whichever host did
def labelled_by_queue: any((.comments.nodes // [])[]; agent_kind("**Agent: labelled ready**"));

# A split part the scheduler labels agent:ready itself (run.sh `label_parts`): no agent label yet,
# never labelled by the queue before, and nothing in its report asks Håkan first
def parts_to_label: split_ready and agent_label == null and (labelled_by_queue | not) and (asks_first | not);

# A split part listed for Håkan to label: no agent label, and its report asks him first
def to_label: split_ready and agent_label == null and asks_first;

# True for a written plan not yet started: a Status table whose rows are all Planned
def plan_unstarted:
  status_rows as $r
  | ($r | length) > 0 and all($r[]; .status | test("^planned\\b"; "i"));

def is_open: .state.type != "completed" and .state.type != "canceled";

# True when an app added the ticket's agent:ready: the newest history entry adding it has an app
# user as its actor, the queue's own or any other integration. Only Håkan makes a ticket ready, with
# one exception: the queue's own label on a sub-issue that carries its `**Agent: labelled ready**`
# comment and asks nothing first (run.sh `label_parts`). Not split_ready: a blocker's label cleared
# after the part was labelled would refuse it. No such entry in the page read counts as his: a guard that hides real
# work is worse than one that misses.
def ready_by_app:
  ([ (.history.nodes // [])[] | select(any((.addedLabels // [])[]; .name == "agent:ready")) ]
   | sort_by(.createdAt) | last) as $h
  | $h != null and ($h.actor.app == true or $h.actor.id == agent_user_id)
    and (($h.actor.id == agent_user_id and .parent != null and labelled_by_queue and (asks_first | not)) | not);

# True for a plan the agent approved itself that waits for an implementing run: an open, unblocked
# agent:ready ticket whose Status rows are all Planned, whose newest agent comment is
# `**Agent: plan approved**`, and whose report doesn't ask Håkan first
def plan_approved:
  any((.labels.nodes // [])[].name; . == "agent:ready") and is_open
  and (blocked | not) and (ready_by_app | not) and plan_unstarted and (asks_first | not)
  and ([ (.comments.nodes // [])[] | select(is_agent) ] | sort_by(.createdAt) | last
       | . != null and agent_kind("**Agent: plan approved**"));

# True for an open agent:ready ticket that already has a written plan nothing will take: a planning
# run has nothing to add, and an approved plan is implement work
def ready_planned:
  any((.labels.nodes // [])[].name; . == "agent:ready") and is_open and (status_rows | length) > 0
  and (plan_approved | not);

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

# --- Auto-merge: the watch merges an agent PR on no hold path itself (run.sh watch_prs) ---

# [{ glob, reason }] from the text of hold-paths.txt: one `<glob>  # <reason>` per line, with
# blank and `#` lines skipped. A line in any other form is an error, never a hold dropped unseen
def hold_globs:
  [ split("\n")[] | trim | select(. != "" and (startswith("#") | not))
    | . as $line
    | ([ capture("^(?<glob>[^\\s#]+)(?:\\s*#\\s*(?<reason>.*))?$") ] | first
       // error("hold-paths.txt: unreadable line: \($line)"))
    | { glob, reason: ((.reason // "") | trim) } ];

# An anchored regex for a hold glob: `**/` is any run of directories, `**` any path, `*` any run
# without `/`, `?` one character but `/`; everything else is literal
def glob_re:
  "^"
  + ([ scan("\\*\\*/|\\*\\*|\\*|\\?|[^*?]+")
       | if . == "**/" then "(?:.*/)?"
         elif . == "**" then ".*"
         elif . == "*" then "[^/]*"
         elif . == "?" then "[^/]"
         else gsub("(?<c>[.+^$(){}|\\[\\]\\\\])"; "\\\(.c)") end ] | join(""))
  + "$";

# { path, glob, reason } for each changed path a hold glob matches, in path order
def hold_matches($files; $holds):
  [ ($files | unique)[] as $p | $holds[] as $h | select($p | test($h.glob | glob_re))
    | { path: $p, glob: $h.glob, reason: $h.reason } ];

# The PR-ready comment's Merge line for the matches: the first one named, the rest counted
def merge_line($m):
  if ($m | length) == 0 then "Merge: merging on its own: no hold path"
  else "Merge: held: \($m[0].path) matches \($m[0].glob)"
       + (if $m[0].reason != "" then " (\($m[0].reason))" else "" end)
       + (if ($m | length) > 1 then ", +\(($m | length) - 1) more" else "" end)
  end;

# The session's Merge line from raw lines: hold-paths.txt, then the review diff (review-diff.sh).
# Lines before the first `diff --git` are the hold list; after it only the headers count, both
# sides of a rename. A diff with no file in it holds.
#   jq -nrR -L <wt>/tools/cdwr/agent-queue 'include "watch"; hold_check_lines([inputs])' <hold list> <diff>
def hold_check_lines($lines):
  ([ range(0; $lines | length) | select($lines[.] | startswith("diff --git ")) ] | first) as $i
  | if $i == null then "Merge: held: no changed file in the diff"
    else
      ($lines[:$i] | join("\n") | hold_globs) as $holds
      | [ $lines[$i:][] | select(startswith("diff --git ")) ] as $headers
      | [ $headers[] | capture("^diff --git a/(?<a>.*) b/(?<b>.*)$") | .a, .b ] as $files
      # A header in another form (no prefix, quoted paths) holds rather than passing unread
      | if ($holds | length) == 0 then "Merge: held: the hold list is empty"
        elif ($files | length) < 2 * ($headers | length) then "Merge: held: a diff header could not be read"
        else merge_line(hold_matches($files; $holds)) end
    end;

# True when the report says `**Ask me before merging**` on a line of its own
def asks_before_merging:
  any(report[]; trim | test("^\\*\\*ask me before merging\\b"; "i"));

# True for a line of the comment's body that starts with $prefix: bold or not (`**Merge:** …` too),
# as a list item or not
def body_line($prefix):
  (.body // "") | split("\n")
  | any(.[]; trim | sub("^[-*]\\s+"; "") | gsub("\\*\\*"; "") | trim | ascii_downcase | startswith($prefix));

# The watch's own verdict on merging a PR by itself, from the pullRequest node it just read, the
# ticket and the parsed hold list: { verdict, claimed, transient }. verdict is `ok <node id> <head
# oid>` or why not. claimed is true when the PR-ready comment says it merges on its own: that is
# the session's consent, never authority, so every rule is checked again here. transient is true
# for a reason that settles by itself or has a notice of its own (pending checks, a conflict).
# Once Håkan comments after the PR-ready comment the merge is his, even after review addressed.
def merge_verdict($node; $holds):
  desk_verdict("merge") as $d
  | ($node | pr_ready_comment) as $c
  | ([ (.files.nodes // [])[] | .path | select(type == "string") ]) as $files
  | (($c != null) and ($c | body_line("merge: merging on its own"))) as $claimed
  | (if ($d | startswith("ok ") | not) then $d
     elif ($node | agent_label) != "agent:review" then "the ticket is not agent:review"
     elif $c == null then "no PR-ready comment"
     elif ($c | body_line("code review:") | not) then "the PR-ready comment has no Code review line"
     elif ($claimed | not) then "the PR-ready comment does not say it merges on its own"
     # A parked wait is a session mid-round: a push is coming, or CI runs on the head it just pushed
     elif ($node | parked) != null then "the ticket is parked on a wait"
     elif any(($node.comments.nodes // [])[]; (is_agent | not) and (.createdAt | epoch) > ($c.createdAt | epoch))
       then "Håkan commented after the PR-ready comment"
     elif ($node | asks_before_merging) then "the report says Ask me before merging"
     # Credentials stay Håkan's: a secret write applied after a self-merge would bypass him
     elif any(($node | apply_items)[]; (.dropped | not) and ((.kind // "") | startswith("secret-")))
       then "the Apply list writes a secret"
     elif .reviewDecision == "CHANGES_REQUESTED" then "a review requested changes"
     elif .files == null then "the PR's files were not read"
     elif .files.pageInfo.hasNextPage == true then "too many changed files to check them all"
     elif ($files | length) == 0 then "no changed files read"
     elif ($holds | length) == 0 then "the hold list is empty"
     # GitHub gives a renamed file's new path only, so a move out of a held directory can't be seen
     elif any((.files.nodes // [])[]; .changeType == "RENAMED") then "a file was renamed, and GitHub doesn't give its old path"
     else (hold_matches($files; $holds) as $m
           | if ($m | length) > 0 then merge_line($m) | sub("^Merge: held: "; "") else $d end)
     end) as $v
  | { verdict: $v, claimed: $claimed,
      transient: (($v | startswith("ok ") | not)
                  # Review feedback is a session's pick, and Håkan knows his own comment
                  and ($v | test("^(PR is |checks |GitHub has not checked|already in the merge queue|conflicts with main|[0-9]+ unresolved thread|too many review threads|Håkan commented|the ticket is parked|the ticket is not agent:review)"))) };

# The settled outcome of the production deploy after a self-merge, from the Fly Deployment push
# runs for the merge commit and the annotations of that run's jobs: success, failure, skipped (the
# deploy guard's "is older than" warning, COD-845), superseded (cancelled: the push concurrency
# group cancels a pending run when a newer merge queues, and that run deploys this code too), else
# pending, or unknown 3 hours after the merge
def deploy_state($runs; $notes; $mergedAt; $now):
  ([ ($runs.workflow_runs // [])[] ] | sort_by(.created_at // "") | last) as $r
  | if $r == null or $r.status != "completed" then
      (if $mergedAt != null and ($now - ($mergedAt | epoch)) > 10800 then "unknown" else "pending" end)
    elif $r.conclusion == "cancelled" then "superseded"
    elif ($r.conclusion // "") | IN("failure", "timed_out", "startup_failure") then "failure"
    elif any(($notes // [])[]; (.annotation_level // "") == "warning" and ((.message // "") | test("is older than")))
      then "skipped"
    elif $r.conclusion == "success" then "success"
    else "unknown" end;

# True for a watch entry whose PR the watch enqueued at least once; a refused enqueue is no try
def self_merged: (.autoMerge.tries // 0) >= 1;

# --- What the queue did on its own (own_actions), as the review lists it ---

# An own result that went wrong or waits on Håkan; OWN_TROUBLE in @codeware/shared/util/agent-review
# holds the same list for the desk
def own_trouble: IN("left-queue", "held", "refused", "failure", "skipped", "unknown", "rolled-back", "stuck");

# A timestamp as "20 Nov", from its first 19 characters read as UTC; null when it doesn't parse
def own_day: (.[0:19] + "Z" | epoch? // null) | if . == null then null else strftime("%d %b") | ltrimstr("0") end;

# The daily notice from a stored reviews row: the counts of what the queue did on its own since the
# review before, up to five items that went wrong or wait on Håkan, and where to read the rest
def own_notice($desk):
  (if $desk == "" then "See the desk." else "See \($desk)" end) as $see
  | .own as $o
  | if $o == null then "Review stored, but what the queue did on its own was not read. \($see)"
    else (($o.since // "" | own_day) // "the review before") as $day
    | if ($o.items | length) == 0 then "Nothing on its own since \($day). \($see)"
      else
        ([ $o.items[]
           | if .kind == "merge" and .result == "merged" then "merged"
             elif .kind == "apply" and .result == "applied" then "applied"
             elif .kind == "deploy" and .result == "success" then "deployed"
             elif .kind == "self-deploy" and .result == "ok" then "self-deployed"
             else .result end ]
         | group_by(.) | map("\(length) \(.[0])") | join(", ")) as $counts
        | [ $o.items[] | select(.result | own_trouble) ] as $bad
        | ([ $bad[0:5][]
             | "\(.ticket // .target // "the agent") \(.kind) \(.result)\(if .reason then " (\(.reason[0:80]))" else "" end)" ]
           + (if ($bad | length) > 5 then [ "\(($bad | length) - 5) more" ] else [] end)) as $named
        | "On its own since \($day): \($counts)."
          + (if ($named | length) > 0 then " Needs a look: \($named | join("; "))." else "" end)
          + " \($see)"
      end
    end;

# True while a ticket that merged on its own keeps agent:review for its deploy, so it stays
# watched: up to 3 hours while the deploy is not read, and until Håkan clears the label once it
# failed, was skipped or never settled (the self-merge-deploy gap)
def deploy_hold($now; $watch):
  (($watch // {})[.identifier] // {}) as $w
  | ($w.deploy.state // "pending") as $s
  | ($w | self_merged) and $w.state == "merged"
    and (($s | IN("failure", "skipped", "unknown"))
         or ($s == "pending" and ($w.mergedAt == null or ($now - ($w.mergedAt | epoch)) <= 10800)));

# The merge-queue pick: a PR the watch enqueued once left the queue without a conflict, on the
# head it left with; a new head (the fix) clears it
def merge_queue_failed($watch):
  (($watch // {})[.identifier] // {}) as $w
  | agent_label == "agent:review" and is_open
    and $w.autoMerge.removed != null and ($w.autoMerge.tries // 0) == 1 and $w.autoMerge.held == null
    and $w.conflicting != true and (($w.state // "open") | IN("merged", "closed") | not)
    and $w.autoMerge.removed.oid != null and $w.autoMerge.removed.oid == $w.oid;

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

# True for a merged ticket with checks left for the agent: Done within 14 days, unchecked items under
# its PR-ready comment's "After the merge, the agent checks:", every hand-off ticked or dropped (a
# deploy among them comes first), and 15 minutes past the merge, so the deploy it starts has landed.
# An `**Agent: checks**` after the merge ends it, even when its checklist edit failed.
def merge_checks_due($now):
  .state.type == "completed" and .completedAt != null
  and ($now - (.completedAt | epoch)) >= 900 and ($now - (.completedAt | epoch)) <= 14 * 86400
  and (handoffs | length) == 0 and (merge_checks | length) > 0
  and ((.completedAt | epoch) as $merged
       | any((.comments.nodes // [])[]; agent_kind("**Agent: checks**") and (.createdAt | epoch) > $merged)
       | not);

# Sort key for ready tickets: status, then priority (none last), then oldest first
def queue_order:
  [ ({ started: 0, unstarted: 1, backlog: 2, triage: 3 }[.state.type] // 4),
    (if .priority == 0 then 5 else .priority end),
    .createdAt ];

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

# The number at the end of an identifier, for sorting
def id_num: ((capture("(?<n>[0-9]+)$").n | tonumber) // 0);

# The comment that goes with the close, sub-issues in number order
def close_comment:
  "**Agent: closed** all sub-issues are closed: "
  + ([ .children.nodes
       | sort_by(.identifier | id_num)[]
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

# --- Part labels: the scheduler's third Linear write (run.sh `label_parts`) ---

# The comment that goes with the label, blockers in number order
def label_comment:
  "**Agent: labelled ready** every blocker is closed: "
  + ([ blockers | sort_by(.identifier | id_num)[]
       | "\(.identifier) (\(if .state.type == "completed" then "Done" else "Canceled" end))" ]
     | join(", "))
  + ".";

# From the PARTS response (open sub-issues with their reports and blockers): [{ id, identifier,
# comment }] for each split part to label agent:ready. $labelled lists the parts the scheduler
# labelled before: one unlabelled since is Håkan's, never labelled again.
def parts_to_label_list($labelled):
  [ (.data.issues.nodes // [])[]
    | select(.identifier as $i | ($labelled | index($i)) == null)
    | select(((.team.key // "COD") == "COD") and parts_to_label)
    | { id, identifier, comment: label_comment } ];

# [{ id, identifier, comment }] for each part this host labelled whose comment never landed: it
# still carries agent:ready but not the queue's comment, which ready_by_app needs to take it
def parts_to_comment_list($labelled):
  [ (.data.issues.nodes // [])[]
    | select(.identifier as $i | ($labelled | index($i)) != null)
    | select(((.team.key // "COD") == "COD") and is_open and agent_label == "agent:ready"
             and (labelled_by_queue | not))
    | { id, identifier, comment: label_comment } ];

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
# item `PR <n>` after merged comments, new work that the limit holds like a ready ticket. A merged
# ticket with checks left is a `merge checks` item after merged comments, which the limit never
# holds; a plan the agent approved itself is a `plan approved` item before Renovate PRs, held like
# a ready ticket. `table.label` lists only the split parts whose report asks Håkan first.
def queue_view($now; $limit; $watch; $session; $waits; $renovate):
  map(select(other_repo | not)) as $all
  | ($all | limit_used($now; $limit)) as $lu0
  | ([ $all[] | select((agent_label == "agent:working" or agent_label == "agent:review")
                       and is_open and parked != null)
       | . + { park: parked, ws: wait_state($now; $waits; $watch), asked: copilot_asked($watch) } ]
     | sort_by(.park.since)) as $park
  | ($park | map(.identifier)) as $parkIds
  | (($session.tickets // [ $session.ticket ]) | map(select(. != null))) as $sessionTickets
  | ([ $park[] | select(agent_label == "agent:working") ]) as $parkWorking
  # A parked working ticket holds a slot like an open review
  | ($lu0 + { used: ($lu0.used + ($parkWorking | length)) }) as $lu
  | ($all | map(. + { claim: claim })) as $allC
  | ([ $allC[] | select(agent_label == "agent:working" and is_open) ]) as $working
  # The 2-hour rule is for a session that left no heartbeat: a live session's own ticket stays a resume
  | ([ $working[] | select(.claim != null
                           and (($now - .claim.at) < 7200 or (.identifier | IN($sessionTickets[])))
                           and (.identifier | IN($parkIds[]) | not)) ]
     | sort_by(.claim.at) | reverse
     | map({ ticket: .identifier, reason: "resume", detail: next_line })) as $fresh
  # No readable claim is no proof the session is gone: the skill takes over only a claim 2 h old.
  # An unclaimed ticket untouched for 30 minutes is taken over too, unless the live session holds it.
  | ([ $working[] | select(.claim == null and (.identifier | IN($parkIds[]) | not)) ] | sort_by(queue_order)
     | map(. + { idle: (if .updatedAt == null or (.identifier | IN($sessionTickets[])) then null
                        else ($now - (.updatedAt | epoch)) end) })) as $unc
  | ($unc | map(select(.idle == null or .idle < 1800)
                | { ticket: .identifier, reason: "resume", detail: "no claim line" })) as $unclaimed
  | ([ $working[] | select(.claim != null and ($now - .claim.at) >= 7200
                           and (.identifier | IN($sessionTickets[]) | not)) ] | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "take over",
             detail: "claim \((($now - .claim.at) / 3600 | floor)) h old" })
     + ($unc | map(select(.idle != null and .idle >= 1800)
                   | { ticket: .identifier, reason: "take over",
                       detail: "no claim line, \((.idle / 60 | floor)) min" }))) as $stale
  # A canceled ticket is read for the audit only: it holds nothing
  | ([ $allC[] | select(.claim != null and .state.type != "canceled") | { key: .identifier, value: .claim.id } ]
     | from_entries) as $holders
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
  # A PR the watch merged by itself that the merge queue refused without a conflict: a session
  # fixes it on a new head, and the watch enqueues it the second and last time
  | ($conf | map(.ticket)) as $confIds
  | ([ $all[] | select(merge_queue_failed($watch)
                       and (.identifier | IN($parkIds[] , $fbIds[], $confIds[]) | not)) ]
     | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "merge queue failed",
             detail: $watch[.identifier].autoMerge.removed.reason })) as $mqf
  # Not open review feedback: the PR merged, so the comment gets a suggestion, never a new commit
  | ([ $all[] | select(merged_comment and (.identifier | IN($parkIds[]) | not)) ]
     | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "merged comment", detail: null })) as $mc
  # A comment on the merged ticket is answered first
  | ($mc | map(.ticket)) as $mcIds
  | ([ $all[] | select(merge_checks_due($now) and (.identifier | IN($mcIds[]) | not)) ]
     | sort_by(queue_order)
     | map({ ticket: .identifier, reason: "merge checks", detail: "\(merge_checks | length) left" })) as $mck
  # A plan the agent approved itself is implement work, held by the limit like a ready ticket
  | ([ $all[] | select(plan_approved) ] | sort_by(queue_order) | map(.identifier)) as $pa
  | ([ $all[] | select(agent_label == "agent:ready" and is_open and (blocked | not) and (ready_by_app | not)
                       and (plan_approved | not)) ]
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
      holders: $holders,
      next: ($resolved + $fresh + $unclaimed + $stale + $ans + $fb + $conf + $mqf + $mc + $mck
             + (if $full then []
                else ($pa | map({ ticket: ., reason: "plan approved", detail: null })) + $renNext
                     + ($rdy | map({ ticket: ., reason: "ready", detail: null })) end)),
      held: {
        tickets: (if $full then $pa + ($renNext | map(.ticket)) + $rdy else [] end),
        free: (if $full and (($pa | length) + ($rdy | length) + ($renNext | length)) > 0
               then ($lu0.open | map({ action: "review", ticket: ., pr: ($watch[.].pr // null) }))
                    + ($parkWorking | map({ action: "wait", ticket: .identifier, pr: .park.pr }))
                    + [ { action: "limit", value: ($lu.used + 1) } ]
               else [] end)
      },
      blocked: $blocked,
      refused: $refused,
      # Self-merged tickets that keep agent:review for their deploy: clean-up leaves the label
      deployHold: [ $all[] | select(deploy_hold($now; $watch)) | .identifier ],
      parked: ($park | map({ ticket: .identifier, wait: .park.wait, pr: .park.pr,
                             since: (.park.since | todateiso8601),
                             resolved: .ws.resolved, outcome: .ws.outcome }
                           # The desk reads a Copilot wait nobody asked for, or whose request failed, as stalled.
                           # A PR the watch has not read yet reads as none, so a wait the scheduler never
                           # reached stalls too; an entry for another PR says nothing about this one.
                           + (if .park.wait == "copilot"
                              then .park.pr as $pr
                                   | { copilot: (($watch // {})[.identifier] // {}
                                                 | if .pr == null then "none" elif .pr == $pr then .copilot // null else null end),
                                       copilotAsked: .asked }
                              else {} end))),
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
# `runnable` is the `next` items an implementing session may take: not resume or ready, and not held
# by the live session (its own ticket, or one its claim id is a prefix of the session id for).
def attended($now; $limit; $watch; $waits; $renovate; $session):
  queue_view($now; $limit; $watch; $session; $waits; $renovate) as $q
  | ($q.table.before | map(.ticket + " input")) as $inputs
  | ($q.table.after | map(.ticket + (if .kind == "pr" then " PR" else " hand-offs" end))) as $after
  | ($q.table["label"] | map(.ticket + " label")) as $labels
  | ([ $q.next[]
       | select(.reason != "resume" and .reason != "ready")
       | ($q.holders[.ticket] // null) as $holder
       | select(($session != null
                 and ((.ticket | IN(($session.tickets // [ $session.ticket ])[]))
                      or ($holder | type) == "string" and (($session.id // "") | startswith($holder)))) | not) ]) as $runnable
  | { used: $q.limit.used, limit: $limit, waiting: ($inputs + $after + $labels), runnable: $runnable,
      resuming: [ $q.next[] | select(.reason == "resume") | { ticket, detail, holder: ($q.holders[.ticket] // null) } ] }
    + ($q.next[0] as $n
       | if $n == null then { verdict: "idle", ticket: null, reason: null, detail: null }
         elif $n.reason == "resume" then { verdict: "running", ticket: $n.ticket, reason: "working", detail: $n.detail }
         else { verdict: "run", ticket: $n.ticket, reason: $n.reason, detail: $n.detail }
         end);
def attended($now; $limit; $watch; $waits; $renovate): attended($now; $limit; $watch; $waits; $renovate; null);
def attended($now; $limit; $watch; $waits): attended($now; $limit; $watch; $waits; {});
def attended($now; $limit; $watch): attended($now; $limit; $watch; {});

# The session's own ticket is among the resumable ones, whichever ranks first, and no other
# session's claim holds it
def own_pick($ticket; $sid):
  any(.resuming[]?; .ticket == $ticket
                    and (.holder as $h | $h == null or (($sid // "") | startswith($h))));

def resume_line($ticket): ([ .resuming[]? | select(.ticket == $ticket) ] | first)
  | "resume: \(.ticket)" + (if .detail != null then " · \(.detail)" else "" end);

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
  | ($alive | sort_by(.lastSeen | epoch)) as $sorted
  | ($sorted | last) as $s
  | if $s != null then
      { id: $s.id, ticket: ($s.ticket // null),
        tickets: ([ $sorted[] | .ticket // empty ] | reduce .[] as $t ([]; if index([$t]) then . else . + [$t] end)),
        lastSeen: ($s.lastSeen // null) }
      + if $s.state == "waiting" then { state: "waiting", detail: $s.detail }
        else { state: "alive", detail: (if $s.watcherAlive then "polling" else $s.state end) }
        end
    elif any($open[]; .pidAlive) then { state: "stopped", detail: null, id: null, ticket: null, tickets: [], lastSeen: null }
    else { state: "none", detail: null, id: null, ticket: null, tickets: [], lastSeen: null }
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
# previous launch, or null), limitedUntil (when the plan's session limit lifts, `07:10 UTC`, or
# null) }. Output: { action: launch|notify|skip, reason, key }, plus `last`,
# the state to store, only when the action is launch.
def launch($guards):
  # Old callers pass a bare pick: a `run` verdict is the one runnable item
  (.runnable // (if .verdict == "run" and .reason != "ready" then [{ ticket, reason, detail }] else [] end)) as $runnable
  | ($guards.session.state // "none") as $st
  | (if .verdict == "run" then { ticket, reason, detail } else null end) as $top
  # A polling session takes the top run pick itself, so a launch takes what waits behind it; one at
  # a prompt or in a turn leaves only a merged comment to a launch
  | (if $st == "none" or $st == "stopped" then $runnable
     elif $st == "alive" and $guards.session.detail == "polling" then [ $runnable[] | select(. != $top) ]
     elif $st == "alive" or $st == "waiting" then [ $runnable[] | select(.reason == "merged comment") ]
     else [] end) as $cands
  | ($cands | first) as $item
  # implement.sh takes the key's first word as the ticket, so a Renovate pick's `PR 754` is `PR-754`
  | (if $item == null then null else "\($item.ticket | gsub(" "; "-")) \($item.reason)" end) as $key
  | ($guards.last // {}) as $prev
  # Counted per ticket and reason, so new work on a ticket starts fresh. A `take over` of the
  # ticket last launched is the same miss: a launched session that dies turns its pick into one.
  | (if $item == null then 0
     elif $prev.key == $key
        or ($item.reason == "take over" and ($prev.key // "" | split(" ")[0]) == $item.ticket)
     then ($prev.launches // 0) else 0 end) as $done
  | { key: $key, pick: $item }
    + if ($runnable | length) == 0 then { action: "skip", reason: "nothing to implement" }
      elif $item == null then { action: "skip", reason: "a session is alive" }
      # An implement-only run files a ticket for a failing Renovate PR; a conflict on a modified
      # branch is attended work
      elif $item.reason == "renovate" and $item.detail != "failing" then { action: "skip", reason: "a Renovate conflict waits for an attended session" }
      elif $guards.locked then { action: "skip", reason: "a launched session is still running" }
      # The plan's session limit: nothing starts before the reset (lib.sh limit_held)
      elif ($guards.limitedUntil | type) == "string"
        then { action: "notify", reason: "session limit, resets \($guards.limitedUntil)" }
      # No cap is no licence to spend: fail safe
      elif ($guards.cap | type) != "number" then { action: "notify", reason: "no daily implement cap set" }
      # run.sh passes null for a ledger it couldn't sum: fail closed, and say so
      elif ($guards.spent | type) != "number" then { action: "notify", reason: "spend ledger unreadable" }
      elif $guards.spent >= $guards.cap
        then { action: "notify", reason: "daily implement cap reached ($\($guards.spent) of $\($guards.cap))" }
      # A launch that ended without moving the pick is a miss; two misses on one key stop launching
      elif $done >= 2 then { action: "notify", reason: "\($done) launches changed nothing" }
      # A launch given back as untried (implement.sh) is given back once per key
      else { action: "launch", reason: null,
             last: ({ key: $key, launches: ($done + 1) }
                    + (if $prev.key == $key and $prev.refunded then { refunded: true } else {} end)) }
      end;

# --- Audit: states the queue cannot resolve by itself, so a person or a session has to ---
# Input is the issue nodes, as for queue_view. A gap is { id, ticket, kind, what, fix }; the id is
# stable per ticket and kind. It reads the pick's own helpers, so the audit never disagrees with
# what a session would take.
# The title rides along because the desk's index holds no canceled ticket; `audit` fills it in
def gap($t; $kind; $what; $fix): { id: "\($t):\($kind)", ticket: $t, title: null, kind: $kind, what: $what, fix: $fix };

# The gaps of one ticket
def ticket_gaps($now; $watch):
  .identifier as $t
  | agent_label as $lab
  | [ (.labels.nodes // [])[].name | select(startswith("agent:")) ] as $labels
  | is_open as $open
  | ((($watch // {})[$t]) // {}) as $w
  | (.state.type // "") as $type
  | ([ open_blockers[] | .identifier // "unknown" ] | join(", ")) as $open_names
  | (if $type == "completed" then
       (if ($labels | any(.[]; IN("agent:ready", "agent:working", "agent:needs-input")))
        then "is Done but still \($lab)"
        elif $lab == "agent:review" and any((.comments.nodes // [])[]; agent_kind("**Agent: PR ready**"))
             and (handoffs | length) == 0 and (deploy_hold($now; $watch) | not)
        then "is Done with agent:review and no hand-offs left"
        else null end)
     elif $type == "canceled" and ($labels | length) > 0 then "is Canceled but still \($labels | join(", "))"
     else null end) as $closed
  | [ if $lab == "agent:needs-input" and $open and answered and blocked and plan_unstarted
      then gap($t; "held"; "\($t) is answered but its plan waits on \($open_names)";
               "Close or unlink \($open_names)") else empty end,
      if ready_planned and (blocked | not)
      then gap($t; "ready-planned"; "\($t) has a written plan but is agent:ready, so only an attended session takes it";
               "Start `cdwr agent attend \($t)`. A self-approved plan launches only while `**Agent: plan approved**` is the agent's newest comment and the report asks nothing first") else empty end,
      if $lab == "agent:review" and $open and (($watch // {}) | length) > 0 and ($w.pr // null) == null
      then gap($t; "review-no-pr"; "\($t) is agent:review but no PR is attached";
               "Attach the PR to \($t), or set the label back") else empty end,
      # The watch entry has no merge time, so the ticket's last update stands in for it
      if $w.state == "merged" and $open and .updatedAt != null and ($now - (.updatedAt | epoch)) > 3600
      then gap($t; "merged-not-done"; "\($t) is still open though its PR merged";
               "Set \($t) Done (the PR body lacked Closes)") else empty end,
      if ($w | self_merged) and $w.state == "merged" and (($w.deploy.state // "") | IN("failure", "skipped", "unknown"))
      then gap($t; "self-merge-deploy";
               "\($t) merged on its own and its production deploy \({ failure: "failed", skipped: "was skipped by the deploy guard", unknown: "never settled" }[$w.deploy.state])";
               "Check the Fly Deployment run" + (if ($w.deploy.run // null) != null then " (\($w.deploy.run))" else "" end)
               + " for \($w.mergeCommit | if . == null then "the merge commit" else .[0:7] end), redeploy or revert, then clear agent:review from \($t)")
      else empty end,
      if $w.state == "closed" and $lab == "agent:review" and $open
      then gap($t; "closed-pr"; "\($t) is agent:review but its PR was closed without merging";
               "Reopen the PR, or relabel \($t)") else empty end,
      if $closed != null
      then gap($t; "label-on-closed"; "\($t) \($closed)";
               "An attended session cleans it up, or remove the label") else empty end,
      if ($labels | length) > 1
      then gap($t; "two-labels"; "\($t) carries \($labels | join(", "))";
               "Keep one of \($labels | join(", "))") else empty end,
      # The agent comments after the newest human one; a rebase note after the question doesn't hide it
      if $lab == "agent:needs-input" and $open and (answered | not)
         and (((.comments.nodes // []) | map(select(is_agent | not) | .createdAt | epoch) | max) as $h
              | [ (.comments.nodes // [])[] | select(is_agent and ($h == null or (.createdAt | epoch) > $h)) ] as $a
              | [ "**Agent needs input**", "**Agent: needs input**", "**Agent: plan ready**" ] as $ms
              | any($a[]; (.body // "" | trim) as $b | any($ms[]; . as $m | $b | startswith($m))) | not)
      then gap($t; "needs-input-no-question"; "\($t) is agent:needs-input but the agent asked nothing";
               "Answer anyway, or relabel \($t)") else empty end,
      # A blocker without a completedAt doesn't age the ticket
      if to_label
         and (([ blockers[] | .completedAt | select(. != null) | epoch ] | max) as $m
              | $m != null and ($now - $m) > 86400)
      then gap($t; "unlabelled"; "\($t) has been ready to label for over a day";
               "Label \($t) agent:ready") else empty end ];

# --- Candidate rules: report-only gaps a later AI review judges; the wording says "check" ---

# The rows of the description's table under a Status heading (`## Status`, `**Status**`, `Status:`):
# { what, lead, status, text }: the what is the column headed What, else the first cell that is not
# a number (a step), else the first cell; lead is the first cell; the status is from the column headed
# State or Status, else the last cell. A table needs its header and separator lines to count; without a
# heading, the Step/What/Status table stands in.
def status_table_rows:
  ([ foreach ((.description // "") | split("\n")[]) as $l
       ({ st: "none", row: null, col: -1, wcol: -1 };
        ($l | trim) as $t
        | ($t | [ sub("^\\|"; "") | sub("\\|$"; "") | split("|")[] | trim ]) as $c
        | .row = null
        | if ($t | test("^(#+\\s*)?(\\*\\*)?status:?(\\*\\*)?:?$"; "i")) then .st = "head"
          elif ($t | startswith("|")) then
            if .st == "head"
              then .st = "hdr"
                   | .col = ([ range(0; $c | length) | select($c[.] | gsub("[*_`~]"; "") | trim | ascii_downcase | IN("state", "status")) ] | first // -1)
                   | .wcol = ([ range(0; $c | length) | select($c[.] | gsub("[*_`~]"; "") | trim | ascii_downcase == "what") ] | first // -1)
            elif .st == "hdr" then .st = "tab"
            elif .st == "tab" and ($c | length) >= 2
              then .row = { what: (if .wcol >= 0 and .wcol < ($c | length) then $c[.wcol]
                                   else ([ $c[] | select(test("^[0-9.#]*$") | not) ] | first // $c[0]) end),
                            lead: $c[0], status: (if .col >= 0 and .col < ($c | length) then $c[.col] else $c[-1] end), text: $t }
            else . end
          elif $t == "" and .st == "head" then .
          else .st = "none" end;
        .row // empty) ]) as $h
  | if ($h | length) > 0 then $h else [ status_rows[] | . + { lead: .what, text: "\(.what) | \(.status)" } ] end;

# A status cell without markdown emphasis, lower case
def cell_norm: gsub("[*_`~]"; "") | trim | ascii_downcase;
# ... and without leading emoji or symbols, so "✅ Done" reads as done; a dash alone is kept
def cell_word: cell_norm | sub("^[^\\p{L}\\p{N}—–]+"; "");
def cell_finished:
  cell_word | test("^(done|dropped|skipped|merged|n/a|not needed|won['’]t)\\b") or test("^[—–]$");
def cell_done: cell_word | test("^(done|merged)\\b");
def cell_open: cell_word | test("^(planned|open|blocked|todo|backlog|in progress|started|working|waiting|pending)\\b");
def clip($n): if length > $n then .[0:$n] + "…" else . end;

# The ticket a status row is about: the first COD-n of its first cell, else of its What cell, else the
# one COD-n of the row when it names exactly one, else null
def row_ticket:
  ([ .lead | scan("COD-[0-9]+") ] | first)
  // ([ .what | scan("COD-[0-9]+") ] | first)
  // ([ .text | scan("COD-[0-9]+") ] | unique | if length == 1 then .[0] else null end);

# The candidate gaps of one ticket. $by maps identifier to node, for its parent and sub-issues.
def candidate_gaps($now; $by; $tables):
  .identifier as $t
  | ($tables[.identifier] // []) as $rows
  | (.state.type // "") as $type
  | (.children.nodes // []) as $kids
  | (if .parent == null then null else ($by[.parent.identifier] // .parent) end) as $p
  | [ if $type == "completed" and .completedAt != null and ($now - (.completedAt | epoch)) <= 14 * 86400
         and ([ $rows[] | select((.status | cell_word) != "" and (.status | cell_finished | not)) ] | length) > 0
      then ([ $rows[] | select((.status | cell_word) != "" and (.status | cell_finished | not)) ]) as $o
           | gap($t; "done-with-open-rows";
                 "\($t) is Done with \($o | length) open Status row\(if ($o | length) == 1 then "" else "s" end) (\($o | map(.what | clip(40)) | join(", "))): check whether any blocks";
                 "Update the rows, or reopen \($t) if one blocks")
             + { rows: ($o | map(.text)) }
      else empty end,
      # A row naming exactly one of this ticket's sub-issues that says the opposite of that sub-issue
      ([ $rows[]
         | . as $r
         | ($r | row_ticket) as $c
         | select($c != null and $c != $t)
         # The parent's own read holds only its first 25 children; the wide read holds them all
         | select(any($kids[]; .identifier == $c) or $by[$c].parent.identifier == $t)
         | ((($by[$c] // ($kids[] | select(.identifier == $c))).state.type) // "") as $ct
         | select(($ct == "completed" and ($r.status | cell_open)) or (($ct | IN("completed", "canceled") | not) and $ct != "" and ($r.status | cell_done)))
         | { id: $c, text: $r.text } ]) as $stale
      | if ($stale | length) > 0
        then gap($t; "parent-status-stale";
                 "\($t)'s Status table disagrees with \($stale | length) sub-issue\(if ($stale | length) == 1 then "" else "s" end) (\($stale | map(.id) | join(", ")))";
                 "Check the rows against the sub-issues and update them")
             + { rows: ($stale | map(.text)) }
        else empty end,
      if is_open and agent_label == null and .updatedAt != null and ($now - (.updatedAt | epoch)) > 10 * 86400
         and $p != null and $p.updatedAt != null and ($p.updatedAt | epoch) > (.updatedAt | epoch)
      then gap($t; "untouched";
               "\($t) has not moved for \(($now - (.updatedAt | epoch)) / 86400 | floor) days while its parent \(.parent.identifier) has";
               "Check whether \($t) is still wanted: label it, update it or cancel it")
      else empty end,
      # Own rows, or the parent's row naming this ticket, that wait for a decision nobody asked for
      if is_open
         and ((.labels.nodes // []) | map(.name) | index("agent:needs-input") | not)
         and (any((.comments.nodes // [])[]; agent_kind("**Agent needs input**") or agent_kind("**Agent: needs input**")) | not)
         and (([ $rows[] | select((row_ticket == null) or row_ticket == $t) ]
               + (if $p == null then [] else [ ($tables[$p.identifier] // [])[] | select(row_ticket == $t) ] end))
              | any(.[]; (.status | cell_done | not) and (.text | test("decision|h[åa]kan picks"; "i"))))
      then gap($t; "decision-unasked";
               "\($t) waits for a decision but nobody asked";
               "Check the decision and ask it: label \($t) agent:needs-input, or answer in the ticket")
      else empty end ];

# $runnable is the pick's `runnable` list, so the launch guard reads what a launch would take.
# $wide is the wider set of open tickets the candidate rules read besides the agent ones.
def audit($now; $watch; $launch; $runnable; $wide):
  . as $issues
  | ($issues + (($wide // []) | map(select(.identifier as $i | any($issues[]; .identifier == $i) | not)))) as $u
  | ($u | map({ key: .identifier, value: . }) | from_entries) as $by
  | [ .[] | select(other_repo | not) | (.title // null) as $title | ticket_gaps($now; $watch)[] | .title = $title ] as $gaps
  # Candidates are input for the review: they show on the tree and in the view, and send no notice
  # Each ticket's Status table is parsed once, for its own rules and its children's
  | ($u | map({ key: .identifier, value: status_table_rows }) | from_entries) as $tables
  | [ $u[] | select(other_repo | not) | (.title // null) as $title | candidate_gaps($now; $by; $tables)[] | .title = $title | .candidate = true ] as $cand
  # The key is the launch's own: ticket (a Renovate `PR 754` as `PR-754`) and reason
  | (if $launch == null or ($launch.launches // 0) < 2 then []
     else (($launch.key // "") | split(" ")[0]) as $kt
       | if $kt == null or $kt == "" or ($kt | startswith("PR-")) then []
         elif any($runnable[]; "\(.ticket | gsub(" "; "-")) \(.reason)" == $launch.key)
         then [ gap($kt; "launch-guard"; "\($launch.launches) launches of \($launch.key) changed nothing";
                    "Start /work-queue on the Mac")
                | .title = ([ $issues[] | select(.identifier == $kt) | .title ][0] // null) ]
         else [] end
     end) as $guard
  | ($gaps + $guard + $cand) | sort_by(.ticket | id_num);
def audit($now; $watch; $launch; $runnable): audit($now; $watch; $launch; $runnable; []);

# --- Tree: every open COD ticket, with parents and sub-issues ---
# Input is the issue nodes; $wide adds the open (and recently Done) tickets the tree query read
# beyond the agent ones, and a node in both takes the richer one from the input. A root is a ticket
# with no parent that is open or Done within 14 days, or the parent of a read ticket. Children come
# from the parent's own list of sub-issues, so Done and unlabelled siblings show; one that is also
# read takes its richer data.
# A root whose sub-issue list was cut at the query's page gets `truncated: true`.
# $gaps is the audit's output. $order is the identifiers in the order the queue picks from (the
# view's `next`, then what the limit holds): every node gets `position`, its 1-based index there, or
# null when the queue never picks it. Roots and children sort by the lowest position in the subtree,
# then by queue_order.
def tree($now; $watch; $gaps; $order; $wide):
  . as $input
  | ($input + (($wide // []) | map(select(.identifier as $i | any($input[]; .identifier == $i) | not)))) as $issues
  | ($issues | map({ key: .identifier, value: . }) | from_entries) as $by
  | ($issues | map(select(other_repo | not))) as $all
  | ([ $all[] | select(.parent != null) ]
     | group_by(.parent.identifier)
     | map({ key: .[0].parent.identifier, value: { parent: .[0].parent, members: . } })
     | from_entries) as $groups
  | def pos($id): ($order | index([$id])) as $i | if $i == null then null else $i + 1 end;
    def leaf($c):
      ($by[$c.identifier] // $c) as $r
      | pos($c.identifier) as $p
      | { ticket: $c.identifier, title: ($r.title // $c.title // null),
          state: ($r.state.type // $c.state.type // null),
          label: ($r | agent_label),
          position: $p,
          # An agent ticket the queue waits on (a review, an answer, a blocker) has no place in the pick
          waiting: ($p == null and ($r | is_open and agent_label != null)),
          pr: (($watch // {})[$c.identifier].pr // null),
          blockers: ($r | [ open_blockers[] | .identifier // "unknown" ]),
          gaps: [ $gaps[] | select(.ticket == $c.identifier) | { kind, candidate: (.candidate // false) } ] };
    # The lowest of a list of positions, else a number past every real one
    def low: [ .[] | select(. != null) ] | (min // 1000000);
    # queue_order, a node read in part (a parent's stub) counting as no priority and the newest
    def order_key: (.priority = (.priority // 0)) | (.createdAt = (.createdAt // "9")) | queue_order;
    # A node with its sub-issues nested, to five levels; `low` is the lowest position of the subtree
    def build($c; $d):
      $c.identifier as $id
      | (if $d >= 5 then []
         else ([ (($by[$id].children.nodes // []) + ($groups[$id].parent.children.nodes // [])
                  + ($groups[$id].members // []))[] ] | unique_by(.identifier)) end) as $k0
      | ($k0 | map(build(.; $d + 1))
         | sort_by([ .low, .key, (.ticket | id_num) ])) as $kids
      | ($by[$id] // $groups[$id].parent // $c) as $r
      | leaf($c)
        + (if (($by[$id].children.pageInfo.hasNextPage // false)
               or ($groups[$id].parent.children.pageInfo.hasNextPage // false))
           then { truncated: true } else {} end)
        + { children: ($kids | map(del(.key, .low))),
            key: ($r | order_key),
            low: (([ pos($id) ] + ($kids | map(.low))) | low) };
    # Roots: parentless open or recently Done tickets, and parents nobody reads a parent of
    ([ $all[] | select(.parent == null
                       and (is_open
                            or (.state.type == "completed" and .completedAt != null
                                and ($now - (.completedAt | epoch)) <= 14 * 86400)))
       | .identifier ]
     + [ $groups | keys[] | select($by[.] == null or $by[.].parent == null) ]
     | unique) as $roots
  | [ $roots[] | . as $id | build(($by[$id] // $groups[$id].parent); 0) ]
  | sort_by([ .low, .key, (.ticket | id_num) ])
  | map(del(.key, .low));
def tree($now; $watch; $gaps): tree($now; $watch; $gaps; []; []);
