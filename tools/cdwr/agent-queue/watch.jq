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

# Reduce a GitHub pullRequest node to { state, removedAt, removedReason }
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
      removedReason: ($r.reason // null)
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
      entry: { pr: $pr, state: $now.state, removedAt: ($now.removedAt // $prev.removedAt), at: $in.at }
    };

# Keep only the watched tickets in the state object
def prune($ids): (. // {}) | with_entries(select(.key as $k | $ids | index($k) != null));
