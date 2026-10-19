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
- Office pages live under `src/routes/_authenticated/` (client-only login gate); cases and checklist items are per-user rows protected by owner RLS, and new users get demo cases copied from `casos_modelo` by the signup trigger; why: each staff member has their own saved data.
- Roles live only in `user_roles` (new users get `atendente`); why: prevents self-promotion.
