# AGENTS.md — agent workflow

Working rules for any agent session in this repository.

## Wrap-up after every change

After completing a coherent change (fix, feature, docs, config), finish the
turn by committing and pushing it:

```bash
git add -A
git commit -m "a short scoped message"
git push origin main
```

Use one commit per logical change, or split into a few focused commits when the
work is naturally separable. Prefer the repo's existing style
(`feat:` / `fix:` / `chore:` / `docs:` with an explanatory body). Do not leave
a finished change uncommitted or un-pushed.

## Working tree

- Branch is `main`. Push to `origin` (`git@github.com:xiangsam/dsh_loopx.git`).
- `lib/`, `build-temp/`, `output/`, `node_modules/`, `.loopx/`, `.codex/`,
  `.pnpm-store/`, `.venv/` are git-ignored. Never commit build output or
  generated artifacts.
- Do not create project branches unless the user asks.

## Validation before commit

Run the fast gate before pushing a code change:

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` and `pnpm build` are optional for pure-doc work but should pass for
any source change. The Docker smoke (`pnpm smoke:docker`) needs Docker/uv/network
and is not part of the default gate.

## Scope discipline

- Keep private project evidence, credentials, local paths, and raw logs out of
  commits. `.loopx/` and `.codex/` are project-local LoopX/Codex state.
- Do not run destructive git, unauthorized production operations, or publish
  private material without explicit approval.
