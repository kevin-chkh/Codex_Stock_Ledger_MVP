# E2E Test Plan

## Scope

- Main flows on mobile viewport:
  - Portfolio creation
  - Cash movement
  - Trade add/edit/delete
  - Dashboard portfolio filter
  - CSV import/export
  - JSON backup restore

## Recommended Tooling

- Playwright for browser E2E.
- Start with one smoke suite, then split by feature.

## Smoke Cases

1. Open app in demo mode.
2. Add portfolio and deposit.
3. Add buy trade and verify cash decreases.
4. Edit trade and verify metric changes.
5. Delete trade and verify rollback.
6. Change dashboard filter and verify list changes.
7. Export JSON and import same file.

## Exit Criteria

- No runtime errors in console.
- No blocked interactions on 375px/390px/430px.
- All smoke cases pass twice in a row.
