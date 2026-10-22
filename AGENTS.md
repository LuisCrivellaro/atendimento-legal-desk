<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI calls run only in server functions (`src/lib/*.functions.ts`) via Lovable AI Gateway Responses with streamed structured output; why: keeps the key server-side.
- External integrations use `src/services/integracoes.ts`; why: no third-party browser calls.
- Integration readiness is a credential-presence-only authenticated server read; it never activates providers or proves connectivity. Claude preparation uses native Messages when activated and leaves existing Responses calls unchanged; why: setup must not silently send legal data, sign contracts, charge clients, or replace the current model.
- Office pages live under `src/routes/_authenticated/` (client-only login gate); cases and checklist items are per-user rows protected by owner RLS, and new users get demo cases copied from `casos_modelo` by the signup trigger; why: each staff member has their own saved data.
- Roles live only in `user_roles` (new users get `atendente`); why: prevents self-promotion.
- Shared office pages use `office_workspace` owner-scoped state and private append-only document storage; why: drafts, review findings and original files persist without modifying originals.
- Human approvals are server-validated against `user_roles` and a material revision hash in `legal_approvals`; why: editing a case invalidates approval and clients cannot forge approval records.
- Checklist and draft approval use authenticated database functions and database advancement triggers; why: direct client writes cannot bypass legal gates and material changes invalidate approval.
- Office-wide dashboard reads run through a server function restricted to senior lawyers or admins, other users read only owned cases; why: aggregate visibility must not weaken owner RLS on editable records.
- Uploaded legal prompt texts are source-controlled server-only guidance, applied by practice area; why: preserves the supplied methodology without sending office prompts to the browser.
- Draft review scheduling lives separately from legal material, with authenticated database functions for scoped queue reads and validated lawyer assignment; why: scheduling must not invalidate approvals or grant cross-owner material edits/approvals.
- Client directory and quick search project saved cases into CPF-grouped client records, with authenticated role-scoped reads and owner-scoped case creation/history; why: keeps dashboard and client records consistent without duplicating case ownership or bypassing legal gates.
- Integration connection checks are authenticated senior/admin read-only provider probes; credential presence never activates sending, signing, payment or import workflows; why: prevents silent legal-data transfer and financial actions.
- Visual Law preview and DOCX share explicit block classification and document-layout roles; why: preserves source text and consistent formatting without importing area-specific legal claims.
- Attendance and assessor rules are pure modules with tests; optional attendance fields stay in case JSON and automation settings stay at workspace root, without schema changes; why: preserves existing storage and legal gates.
- Attendance formatting, slot matching, contract links and message safety use pure rules; shared safe-area height keeps display consistent.
- Attendance AI reads the live checklist table and workspace training server-side through legalAI; why: checklist is not stored in case JSON and legal data must remain authoritative.
- Demo reminders stay browser-only and off on Telegram; Ana uses owner training, test-contact history and CAS claims/drafts/handoff; why: no duplicates or case disclosure. Test slots remain separate from real appointments; concise/nonrepetition and sensitive-topic acknowledgments use pure rules, never legal advice. No ProJuris/Drive/Agenda tools.
- Optional operational case fields can invalidate draft approval under the unchanged database revision function; why: preserving the existing legal gate takes priority over bypassing reapproval without a migration.
- Attendance handlers stay in the route; details auto-open inline at ≥1024px or in a right drawer below, without collapse; why: presentation preserves behavior.
- Attendance ProJuris details project only the selected case and its owner-scoped workspace; local records and simulated sync markers never imply a provider import; why: prevents cross-client mixing and misleading integration claims.
- Quick replies use pure rules and owner workspace overrides outside case material; why: no approval changes. Unfilled braces block sends.
- Attendance uses one Telegram test bot only, with a single token and webhook secret and one released contact per conversation; why: the two-bot setup was cancelled, so no second credential may be activated and destinations must stay readable by the legacy parser.
