# P2 - Guest portal summary, group filter, show all: Git change report

Base SHA: 5967b22f0503738e13a93fa97a165e1981547c19

## git status
```
 M AGENTS.md
 M apps/web/src/components/intake/guest-portal-page.tsx
 M apps/web/src/components/intake/intake-status-badge.tsx
 M apps/web/src/components/intake/intake-status.ts
 M apps/web/src/fetchers/intake/list-intake-requests.ts
 M apps/web/src/hooks/queries/intake/use-get-intake-requests.ts
 M apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/my-requests.tsx
 M apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/requests/index.tsx
 M docs/feature-development/guest-request-tracking/approvals.md
 M docs/feature-development/guest-request-tracking/feature-progress.md
 M docs/feature-development/guest-request-tracking/state.json
 M i18n/az-AZ.json
 M i18n/de-DE.json
 M i18n/el-GR.json
 M i18n/en-US.json
 M i18n/es-ES.json
 M i18n/fr-FR.json
 M i18n/hi-IN.json
 M i18n/id-ID.json
 M i18n/it-IT.json
 M i18n/ja-JP.json
 M i18n/ko-KR.json
 M i18n/mk-MK.json
 M i18n/nl-NL.json
 M i18n/pl-PL.json
 M i18n/pt-BR.json
 M i18n/ru-RU.json
 M i18n/tr-TR.json
 M i18n/uk-UA.json
 M i18n/vi-VN.json
 M i18n/zh-CN.json
 M i18n/zh-TW.json
?? REPO_MAP.md
?? apps/web/src/components/intake/guest-portal-page.test.tsx
?? apps/web/src/components/intake/guest-request-list.tsx
?? apps/web/src/components/intake/intake-groups.test.ts
?? apps/web/src/components/intake/intake-groups.ts
?? apps/web/src/components/intake/intake-summary.tsx
?? apps/web/src/hooks/queries/intake/use-get-intake-request-pages.ts
?? docs/feature-development/guest-request-tracking/execution/p02.md
?? docs/feature-development/guest-request-tracking/review/p02-review.md
```

## git diff --stat 5967b22f0503738e13a93fa97a165e1981547c19
```
 AGENTS.md                                          |   2 +
 .../src/components/intake/guest-portal-page.tsx    | 156 ++++++++++++++------
 .../src/components/intake/intake-status-badge.tsx  |  11 +-
 apps/web/src/components/intake/intake-status.ts    |   2 +-
 .../src/fetchers/intake/list-intake-requests.ts    |   3 +
 .../queries/intake/use-get-intake-requests.ts      |  15 +-
 .../workspace/$workspaceId/my-requests.tsx         |   2 +-
 .../project/$projectId/requests/index.tsx          |   2 +-
 .../guest-request-tracking/approvals.md            |   4 +
 .../guest-request-tracking/feature-progress.md     |  10 +-
 .../guest-request-tracking/state.json              | 161 ++++++++++++---------
 i18n/az-AZ.json                                    |  30 +++-
 i18n/de-DE.json                                    |  30 +++-
 i18n/el-GR.json                                    |  30 +++-
 i18n/en-US.json                                    |  38 ++++-
 i18n/es-ES.json                                    |  33 ++++-
 i18n/fr-FR.json                                    |  33 ++++-
 i18n/hi-IN.json                                    |  30 +++-
 i18n/id-ID.json                                    |  27 +++-
 i18n/it-IT.json                                    |  33 ++++-
 i18n/ja-JP.json                                    |  27 +++-
 i18n/ko-KR.json                                    |  27 +++-
 i18n/mk-MK.json                                    |  30 +++-
 i18n/nl-NL.json                                    |  30 +++-
 i18n/pl-PL.json                                    |  36 ++++-
 i18n/pt-BR.json                                    |  33 ++++-
 i18n/ru-RU.json                                    |  36 ++++-
 i18n/tr-TR.json                                    |  30 +++-
 i18n/uk-UA.json                                    |  36 ++++-
 i18n/vi-VN.json                                    |  27 +++-
 i18n/zh-CN.json                                    |  27 +++-
 i18n/zh-TW.json                                    |  27 +++-
 32 files changed, 844 insertions(+), 174 deletions(-)
```

## Files changed (excluding the feature docs directory)
- apps/web/src/components/intake/guest-portal-page.tsx
- apps/web/src/components/intake/intake-status-badge.tsx
- apps/web/src/components/intake/intake-status.ts
- apps/web/src/fetchers/intake/list-intake-requests.ts
- apps/web/src/hooks/queries/intake/use-get-intake-requests.ts
- apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/my-requests.tsx
- apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/requests/index.tsx
- i18n/az-AZ.json
- i18n/de-DE.json
- i18n/el-GR.json
- i18n/en-US.json
- i18n/es-ES.json
- i18n/fr-FR.json
- i18n/hi-IN.json
- i18n/id-ID.json
- i18n/it-IT.json
- i18n/ja-JP.json
- i18n/ko-KR.json
- i18n/mk-MK.json
- i18n/nl-NL.json
- i18n/pl-PL.json
- i18n/pt-BR.json
- i18n/ru-RU.json
- i18n/tr-TR.json
- i18n/uk-UA.json
- i18n/vi-VN.json
- i18n/zh-CN.json
- i18n/zh-TW.json
- apps/web/src/components/intake/guest-portal-page.test.tsx
- apps/web/src/components/intake/guest-request-list.tsx
- apps/web/src/components/intake/intake-groups.test.ts
- apps/web/src/components/intake/intake-groups.ts
- apps/web/src/components/intake/intake-summary.tsx
- apps/web/src/hooks/queries/intake/use-get-intake-request-pages.ts

## Out of expected scope
(none)

## Files already dirty before the phase (baseline, not counted in the phase)
- AGENTS.md
- REPO_MAP.md

## Baseline files modified further during the phase (user must decide)
(none)
