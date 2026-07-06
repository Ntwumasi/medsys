---
name: silent-failure-audit
description: >-
  Run a comprehensive, parallel, read-only audit of the app for things that FAIL
  SILENTLY — errors that are swallowed, charges/data lost with no alert, wrong
  data shown, safety checks skipped, races, and access-control gaps — plus
  high-value tightening opportunities. Use before a release, after a big change,
  or whenever asked to "audit the app", find "silent failures", "what's breaking
  quietly", "what needs tightening", or do a broad correctness/security review.
  Produces a ranked findings report only — it makes NO code changes.
---

# Silent-Failure & Hardening Audit

Fan out several **read-only** subagents in parallel, each auditing one failure
surface, then **verify** the load-bearing claims and **synthesize** one ranked,
de-duplicated report. The lens is always: *what breaks without anyone noticing?*
— not loud crashes, but swallowed errors, lost money, wrong-but-plausible data,
skipped safety checks, and quiet data corruption.

This skill produces **analysis only**. Do not edit code. Offer to fix afterward.

## Step 0 — Gather "don't re-flag" context (do this first)

Before launching agents, collect what changed recently so agents don't re-report
already-fixed issues as new:
- `git log --oneline -30` and skim recent commit subjects.
- Read the auto-memory index (`MEMORY.md`) and any `project_*` notes for recent
  fixes and known-deferred items.
Summarize these into a short "RECENTLY FIXED — do not re-flag" paragraph and
paste it into every agent prompt.

## Step 1 — Launch the parallel audits

Spawn these as concurrent `Agent` calls (general-purpose, read-only) in a single
message. Scale up or down to fit the request. Each agent MUST return a
**prioritized** list: `[HIGH/MED/LOW] file:line — issue — concrete failure
scenario (inputs → silent wrong outcome) — suggested fix`, top ~10-20 findings,
no style nits.

1. **Silent error handling** — `catch` blocks that only `console.error`/log and
   continue (esp. billing/dispensing/order-completion/payments); "non-fatal"
   comments; false-success (an error caught inside a transaction so COMMIT still
   runs / rolls back silently while the response says success); handlers that
   skip work when a precondition isn't met without signaling; empty `catch {}`;
   missing `await` / fire-and-forget writes; fallback values (`|| 0`, `?? 200`,
   `parseFloat(x) || 75`) that turn a bad value into a plausible-but-wrong number
   on a real record.
2. **Money / billing integrity** — wrong totals (subtotal vs total vs tax kept
   inconsistent), lost/duplicated charges, overpayment/negative balance, status
   not derived from amounts, price-resolution fallbacks that silently bill a
   default, returns/refunds that don't reverse money, external-accounting (e.g.
   QuickBooks) drift after post-sync edits, sequence-number races on invoice ids.
3. **Data integrity & concurrency** — multi-statement writes not wrapped in a
   transaction; a transaction `client` mixed with global `pool` writes (won't
   roll back together); `COUNT(*)+1`/`MAX(id)+1` id generation races; missing
   `SELECT … FOR UPDATE` on money/stock rows (TOCTOU, lost updates, negative
   stock); missing/weak constraints (uniqueness, one-primary, FK/ON DELETE);
   idempotency gaps (double-submit → duplicate patient/order/payment); sentinel
   defaults polluting data; early `return` after `BEGIN` with no `ROLLBACK`
   (zombie idle transaction returned to the pool); migration ordering hazards.
4. **Auth & access control** (defensive review of our own app) — routes with
   `authenticateToken` but no role/ownership gate → cross-tenant/cross-patient
   reads and IDOR on mutations; broken `authorizeRoles`; SQL injection via
   string-built queries (vs parameterized / whitelisted); sensitive-data
   exposure (password hashes, tokens, other users' PII, verbose errors); token
   lifetime/revocation. Focus on **reachable** issues, not theoretical hardening.
5. **Frontend robustness** — API calls with no error handling / swallowed catches
   (user told it worked when it didn't); missing loading/error states so a
   fetch failure renders as legitimate empty/"not found"; optimistic UI not
   rolled back; fetch races (stale response overwrites newer → wrong record
   shown); NaN/`Invalid time value` from unguarded number/date formatting;
   validation gaps; safety checks (allergy/interaction) that fall through on
   error; double-submit gaps.

Adjust the surfaces to the app. Add domain-specific ones when relevant (e.g.
inventory/stock, clinical-safety checks, external integrations).

## Step 2 — Verify the load-bearing claims (critical)

Agents can be wrong. Before presenting any HIGH finding whose truth is
**checkable**, verify it against the real code or database — do not relay agent
claims as fact. Especially:
- Schema claims ("column X was dropped", "CHECK lacks value Y") → query
  `information_schema.columns` / `pg_constraint` on the actual DB.
- "This throws / is dead code" → read the exact lines and confirm.
- "This value is never set / always null" → a quick `GROUP BY`/count.
Correct or drop findings that don't survive verification, and say which you
verified. Delete any temporary verification scripts afterward.

## Step 3 — Synthesize one ranked report

- **De-duplicate**: several agents flag the same thing (fallback prices, no row
  lock, id races, swallowed catches) — merge into one entry with all refs.
- **Rank** by severity, and within CRITICAL/HIGH group by theme (patient/user
  safety, money, data integrity, security).
- **Cluster root causes**: end with the handful of *patterns* behind the many
  symptoms (e.g. swallow-and-return-success, no `FOR UPDATE`, `COUNT+1` ids,
  missing authz gate, frontend `catch→log` only) so fixes are leveraged, not
  whack-a-mole.
- Call out **quick wins vs deep work**, and suggest a fix sequence.
- Restate that this is analysis only; offer next steps: a shareable report
  Artifact, start fixing the top tier (batched by root cause, on staging), or a
  tracked task list.

## Output format per finding

`[SEVERITY] path/file.ts:line — one-line issue — concrete failure scenario
(specific inputs → the silent wrong outcome) — suggested fix.`

## Project context to feed agents (MedSys)

npm-workspaces monorepo: `client/` (React 19 + MUI + TS, Vite) and `server/`
(Express + PostgreSQL). Highest-risk server files historically:
`controllers/ordersController.ts`, `controllers/workflowController.ts`,
`controllers/invoiceController.ts`, `controllers/inventoryController.ts`,
`services/billingService.ts`, `services/priceResolutionService.ts`,
`controllers/nurseProceduresController.ts`, and the monolithic
`routes/index.ts`. DB access is via `pg` `pool`/transaction `client`; `.env`
holds `DATABASE_URL` (shared across prod/staging/demo — be careful, and only
run READ-ONLY queries during an audit). Money is Ghana Cedis (GHS). Refresh the
"recently fixed" context from git + memory on every run — the audit is only as
good as its awareness of what's already been addressed.
