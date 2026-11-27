# The merge rule of the agent queue's PR watch, and the helpers it reads. Part of the kernel held for
# Håkan in hold-paths.txt. Includes nothing; watch.jq includes it, and callers include it after watch:
#   jq -L "$HOME_DIR" 'include "watch"; include "guard"; ...'
# Only defs; the spec in src/commands/agent/guard.jq.spec.ts runs it through jq. jq 1.7 safe.

def trim: gsub("^\\s+|\\s+$"; "");

# Seconds since epoch from an ISO timestamp, with or without milliseconds or seconds
def epoch:
  sub("\\.[0-9]+Z$"; "Z") | sub("T(?<hm>[0-9]{2}:[0-9]{2})Z$"; "T\(.hm):00Z") | fromdateiso8601;

# --- Who wrote a Linear comment ---
# The queue writes to Linear as its own app user.
def agent_user_id: "bbbb4a33-e052-486e-8e0f-d3abb5c5c841";

def agent_prefixed: (.body // "") | trim | startswith("**Agent");

# True for a comment node the agent wrote: by the queue's app user. Another app user (a Linear
# integration) is not the agent. A node without a user (a query that didn't ask, an older installed
# lib.sh) falls back to the prefix.
def is_agent:
  if (.user | type) != "object" then agent_prefixed
  else .user.id == agent_user_id
  end;

# True for the agent's comment of a kind, such as "**Agent: PR ready**": a person pasting the
# marker fakes no gate
def agent_kind($marker): is_agent and ((.body // "") | trim | startswith($marker));

# The agent's newest "**Agent: PR ready**" comment of a Linear issue node, else null. The hand-off
# checklist and the Apply list are both read from it.
def pr_ready_comment:
  [ (.comments.nodes // [])[] | select(agent_kind("**Agent: PR ready**")) ]
  | sort_by(.createdAt) | last;

# The indexes of the item lines of the block under the line $heading in $lines (a comment body split
# at newlines), and of the Apply list block. The header is the first line that, trimmed and without
# its leading and trailing `**`, reads $heading (`apply list:`) in any case. After it blank lines are skipped, a `- [ ]` / `- [x]` line is an item and
# any other line ends the block. [] without a header.
def block_indexes($lines; $heading):
  ([ range(0; $lines | length)
     | select($lines[.] | trim | gsub("^\\*\\*|\\*\\*$"; "") | ascii_downcase == $heading) ]
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

def apply_block_indexes($lines): block_indexes($lines; "apply list:");

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

# Reduce a GitHub pullRequest node to { state, removedAt, removedReason, unresolved,
# copilotThreads, threads, threadsTruncated, conflicting, draft, mergeable, mergeStateStatus, review,
# ci, mergeCommit, copilot }. mergeCommit is the merge commit's oid, null while unmerged. review is
# GitHub's reviewDecision (APPROVED, REVIEW_REQUIRED, CHANGES_REQUESTED or null).
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
      review: (.reviewDecision // null),
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

# The issue's agent:* label name, else null
def agent_label:
  [ (.labels.nodes // [])[].name | select(startswith("agent:")) ] | first;

# The report's lines: the description before its `## Plan` heading, so a plan's own "Open questions"
# never count
def report:
  ((.description // "") | split("\n")) as $l
  | ([ range(0; $l | length) | select($l[.] | test("^##\\s+plan\\s*$"; "i")) ] | first) as $i
  | if $i == null then $l else $l[:$i] end;

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

# The PR's changed files that need Håkan's review, from a pullRequest node and main's branch rules
# (GET rules/branches/main): those the pull_request rule's required_reviewers file patterns match.
# Never keyed on reviewDecision: GitHub reads null for a required_reviewers rule. null when the
# rules were not read or name no pattern, or GitHub gave only the first page of files, where a match
# may sit past it
def review_paths($rules):
  if ($rules | type) != "array" then null
  elif .files.pageInfo.hasNextPage == true then null
  else [ $rules[] | select(.type == "pull_request") | (.parameters.required_reviewers // [])[]
         | (.file_patterns // [])[] | select(type == "string") | glob_re ] as $res
    | if ($res | length) == 0 then null
      else [ (.files.nodes // [])[] | .path | select(type == "string")
             | select(. as $p | any($res[]; . as $re | $p | test($re))) ] | unique end
  end;

# Whether main's ruleset still wants Håkan's approval on GitHub before the PR can merge:
# { paths, approved, verdict }. paths is review_paths. approved is true for an APPROVED latest
# review of the head commit by a person, never the app. verdict is null when no rule names a
# pattern, when it is approved, or when no changed file matches, else why the merge waits; rules
# unread or a file list cut short refuse rather than pass unchecked
def ruleset_gate($rules):
  review_paths($rules) as $p
  | .headRefOid as $head
  | any((.latestReviews.nodes // [])[]; .state == "APPROVED" and .author.__typename == "User"
        and .commit.oid != null and .commit.oid == $head) as $ok
  | ([ ($rules // [])[]? | select(.type == "pull_request") | (.parameters.required_reviewers // [])[]
       | (.file_patterns // [])[] | select(type == "string") ] | length > 0) as $patterns
  | { paths: $p, approved: $ok,
      verdict: (if ($rules | type) != "array" then "main's branch rules were not read"
                elif ($patterns | not) or $ok then null
                elif .files == null then "the PR's files were not read"
                elif .files.pageInfo.hasNextPage == true then "too many changed files to check for Håkan's review"
                elif (($p // []) | length) == 0 then null
                else "needs Håkan's approval on GitHub (\($p[0])"
                     + (if ($p | length) > 1 then ", +\(($p | length) - 1) more" else "" end) + ")" end) };

# True when the PR changes a file main's ruleset wants Håkan's review for and he has not approved
def review_needed($rules):
  ruleset_gate($rules) | (((.paths // []) | length) > 0 and (.approved | not));

# The scheduler's verdict on a desk copilot or merge command, from the pullRequest node it just read
# (run.sh desk_pr_check) and main's branch rules (null for copilot): `ok <node id> <head oid>`, else
# why not. The desk's buttons use the same rules on the watch entry (apps/desk), so a refusal here
# means the PR changed since the desk read it.
def desk_verdict($kind; $rules):
  pr_state as $s
  | (if $kind == "merge" then ruleset_gate($rules).verdict else null end) as $g
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
    elif $g != null then $g
    else "ok \(.id) \(.headRefOid)" end;

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
#   jq -nrR -L <wt>/tools/cdwr/agent-queue 'include "guard"; hold_check_lines([inputs])' <hold list> <diff>
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
def merge_verdict($node; $holds; $rules):
  # The review gate stands where it did before the parked and PR-ready checks: mid-round it is not the reason
  desk_verdict("merge"; []) as $d
  | ruleset_gate($rules).verdict as $g
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
     elif $g != null then $g
     elif any(($node.comments.nodes // [])[]; (is_agent | not) and (.createdAt | epoch) > ($c.createdAt | epoch))
       then "Håkan commented after the PR-ready comment"
     elif ($node | asks_before_merging) then "the report says Ask me before merging"
     # Credentials stay Håkan's: a secret write applied after a self-merge would bypass him
     elif any(($node | apply_items)[]; (.dropped | not) and ((.kind // "") | startswith("secret-")))
       then "the Apply list writes a secret"
     # reviewDecision reads null when only a ruleset applies, so a person's latest review counts too
     elif .reviewDecision == "CHANGES_REQUESTED"
          or any((.latestReviews.nodes // [])[]; .state == "CHANGES_REQUESTED" and .author.__typename == "User")
       then "a review requested changes"
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
                  and ($v | test("^(PR is |checks |GitHub has not checked|already in the merge queue|conflicts with main|[0-9]+ unresolved thread|too many review threads|Håkan commented|the ticket is parked|the ticket is not agent:review|main's branch rules were not read)"))) };
