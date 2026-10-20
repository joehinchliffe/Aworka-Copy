# Rounds platform (working name)

Greenfield round-management SaaS for window cleaners and similar trades.
The plan, scope and roadmap are in [docs/PLAN.md](docs/PLAN.md); research
behind it is in `research/`.

## Layout

- `packages/domain`: shared business rules (money, dates, recurrence, allowed
  days, balances, price revisions, permissions) used by server, web and mobile.
- `apps/`: server, web and mobile apps (coming in Phase 0/1).

## Develop

```
pnpm install
pnpm test        # domain rule tests
pnpm typecheck
```
