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
