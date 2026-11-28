# P1 - API counts, group filter, list order: Git change report

Base SHA: 32ba26385ed6d4d3d8abaeafa3f13e564ac4d95e

## git status
```
 M AGENTS.md
 M apps/api/src/intake/controllers/list-intake-requests.ts
 M apps/api/src/intake/index.ts
 M apps/api/src/intake/response.ts
 M apps/api/src/intake/schema.ts
 M apps/docs/openapi.json
 M tests/api-integration/intake-list-and-detail.test.ts
?? REPO_MAP.md
?? apps/api/src/intake/intake-groups.ts
?? docs/feature-development/
```

## git diff --stat 32ba26385ed6d4d3d8abaeafa3f13e564ac4d95e
```
 AGENTS.md                                          |   2 +
 .../src/intake/controllers/list-intake-requests.ts |  84 ++++++++---
 apps/api/src/intake/index.ts                       |   3 +-
 apps/api/src/intake/response.ts                    |  11 ++
 apps/api/src/intake/schema.ts                      |   8 ++
 apps/docs/openapi.json                             |  41 ++++++
 .../api-integration/intake-list-and-detail.test.ts | 158 +++++++++++++++++++--
 7 files changed, 278 insertions(+), 29 deletions(-)
```

## Files changed (excluding the feature docs directory)
- apps/api/src/intake/controllers/list-intake-requests.ts
- apps/api/src/intake/index.ts
- apps/api/src/intake/response.ts
- apps/api/src/intake/schema.ts
- apps/docs/openapi.json
- tests/api-integration/intake-list-and-detail.test.ts
- apps/api/src/intake/intake-groups.ts

## Out of expected scope
(none)

## Files already dirty before the phase (baseline, not counted in the phase)
- AGENTS.md
- REPO_MAP.md

## Baseline files modified further during the phase (user must decide)
(none)
