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
- External integrations go through `src/services/n8n.ts` (mocked in demo mode); why: the front end never calls third-party services directly.
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
- Attendance client-time formatting, unambiguous slot matching, external contract registration and message safety checks share pure attendance rules; header and workspace share one safe-area-aware height token; why: keeps display consistent and prevents unsafe fallback messages without changing integrations or legal gates.
- Attendance AI reads the live checklist table and workspace training server-side through legalAI; why: checklist is not stored in case JSON and legal data must remain authoritative.
- Demo reminders run only while the conversation is open and use persisted message markers; why: no unattended external scheduler or duplicate AI dispatch is silently activated.
- Optional operational case fields can invalidate draft approval under the unchanged database revision function; why: preserving the existing legal gate takes priority over bypassing reapproval without a migration.
- Attendance presentation components contain only menus, tooltips and detail tabs; existing attendance handlers remain in the route, and the details panel auto-opens on entering a conversation (inline at ≥1200px, right drawer below) without persisted browser state; why: visual refactors must not alter legal data or integration behavior.
- Attendance ProJuris details project only the selected case and its owner-scoped workspace; local records and simulated sync markers never imply a provider import; why: prevents cross-client mixing and misleading integration claims.
- Attendance quick replies are pure rules in `src/lib/respostas-prontas.ts`; the default library lives in code and each user's additions, edits and hidden defaults are stored at the workspace root (`respostasProntas`), outside case material; why: no schema change and no effect on approval revision hashes. Fields left in braces block sending until the attendant fills them; why: placeholders must never reach a client.
