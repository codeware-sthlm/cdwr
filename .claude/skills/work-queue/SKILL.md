---
name: work-queue
description: Work the cdwr repo's Linear agent queue — pick the next agent:ready ticket (or a named one), plan it into the ticket, implement with Sonnet implementer subagents, stop only at gates, open the PR. Use when the user says "work the queue", "next ticket", "/work-queue", names a COD ticket to work, or hands over work before leaving or sleeping.
---

# Work queue

The orchestrator (you, on Opus or Fable) owns planning, decisions, commits, the ticket and
the PR. Implementation steps go to the `implementer` subagent (Sonnet). Linear is the
source of truth for state. The conversation is not, so a fresh session can always resume.

## Arguments

- none: pick the next ticket from the queue
- `COD-123`: work that ticket, whether or not it is labelled
- `unattended` (or the user says they are leaving or going to bed): gates go to Linear
  instead of the session, and the run continues with the next ticket instead of waiting

## The queue rule

The queue view (the "Agent Queue" artifact) computes the same order, so keep the two in step.

1. Team **Codeware**, label **agent:ready**, status not Done or Canceled. Skip tickets whose
   **Repo** label names another repo (`nx-plugins`, `enjinex`). No Repo label, or `codeware`,
   means this repo.
2. Drop tickets that are `blockedBy` an issue that is not Done or Canceled (`get_issue` with
   `includeRelations`).
3. Sort by priority, Urgent → High → Medium → Low, with _No priority_ last, then oldest
   `createdAt` first.

Before picking anything new, check **agent:needs-input** tickets. If the newest comment is
Håkan's and comes after the agent's question, the question has been answered. Resume that
ticket first.

## Labels (group "Agent", one at a time)

| Label               | Meaning                                              | Set by          |
| ------------------- | ---------------------------------------------------- | --------------- |
| `agent:ready`       | eligible                                             | Håkan           |
| `agent:working`     | a session is on it; status In Progress               | agent, on claim |
| `agent:needs-input` | blocked on Håkan; the question is the latest comment | agent           |
| `agent:review`      | PR open; status In Review                            | agent           |

Replacing the label means passing the full label list without the old agent label. Never
remove the ticket's other labels.

## Per ticket

1. **Claim.** Set `agent:working` and status In Progress. Fetch `origin main` and branch from
   `main` using the ticket's `gitBranchName`. Keep the branch independent of open PRs.
2. **Plan (Opus).** Investigate, then write the plan into the ticket **description**: keep
   the original report under its own heading, then `## Plan` with **Decisions**, a
   **Status** table (`| Step | What | Status |`, one row per step), and one line
   `**Next:** <what happens next, or what it is waiting on>`. The Agent Queue view reads that
   table and line, so keep the format.
3. **Gate: plan approval.** Attended: ask with AskUserQuestion (it reaches Remote Control on
   the phone). Unattended: follow overnight mode and proceed, recording each decision in
   **Decisions**. Only a decision that is expensive to get wrong becomes a needs-input gate.
4. **Steps.** For each Status row, spawn `implementer` with the step, the ticket id, the files
   involved and the constraints. Review its diff yourself. Run `pnpm nx format:write`,
   stage exact paths, and commit with a short conventional message. Update the Status row
   (`Done, <sha>. <one-line note>`) and the **Next:** line. Batch two or three tiny steps
   into one implementer call. Do design, security, boot-path and published-API steps
   yourself, not through the implementer.
5. **Finish.** Run `nx affected` lint, typecheck and test against main, run `/code-review`
   and fold the fixes into the commits they correct, push, and open the PR (plan summary
   in the body). Set `agent:review` and status In Review. Add a comment with the PR link
   and the **hand-off checklist**.
6. **Next.** Ask: "COD-xxx is in review. Pick the next one?" Unattended: continue. Either way,
   suggest `/clear` before a big next ticket. Linear holds the state, so nothing is lost.

## Gates: stop only for these

- a design choice that is expensive to reverse, or a contradiction with the ticket
- something hard to reverse or outward-facing: a production action, deleting data, spending money
- the plan outgrowing the ticket (say so, and propose a split)

Hand-offs are **not** gates: `nx verify cms`, `test-migrate`, e2e suites, a dev boot. List them
in the hand-off checklist and keep going.

### How a gate asks

- **Attended:** use AskUserQuestion with two to four concrete options, the recommended one first.
- **Unattended:** post a Linear comment, set `agent:needs-input`, send a PushNotification, then
  move on to the next ticket in the queue:

  ```md
  **Agent needs input**: <one-line question>

  1. <option> (recommended): <consequence>
  2. <option>: <consequence>

  Reply with a number or your own answer. Context: <the Status row it blocks>
  ```

## Hygiene

- One ticket's details per context. After a PR, Linear carries everything forward.
- Flag structural signals: a long conversation, the same file read repeatedly, a step
  growing past its row.
- If the Linear MCP is down, keep the plan in the scratchpad and move it into the ticket
  when Linear is back.
