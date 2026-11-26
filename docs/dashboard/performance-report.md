# Kaneo Dashboard — Phase 6 Performance Report

> Phase: 6 – Quality Assurance and Optimization
> Date: 2026-11-27
> Branch: `feature/ui-development`
> Measurement host: WSL, 4 vCPU-class, dev server (`vp dev`) on localhost

## 1. Method and tooling

- **API latency:** 15 sequential authenticated requests per endpoint with
  `curl -w '%{time_total}'` against `http://localhost:1337`.
- **Page metrics:** Playwright 1.64.1 (Chromium 1243) against the local dev
  server, 1280×900 desktop and 390×844 mobile, three desktop runs and one
  mobile run. TTFB, FCP, LCP, CLS, long tasks and event-timing duration came
  from the Performance APIs, collected after the Overview widgets rendered.
- **Bundle size:** production build log from Fork CI run `45891067627`
  (head `aeb2cf88`); rows are the web build output.
- **Lighthouse:** not installed on this machine and no system Chrome is
  available, so Lighthouse was **not** run. `npx lighthouse` would also need a
  production preview to be meaningful.
- **Orca Browser** was used for the visual pass; the numbers below come from
  Playwright because the Orca tab may be backgrounded (LCP is not recorded for
  hidden pages).

## 2. API response time

15 requests each, warm server, same local Postgres:

| Endpoint | min | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `GET /api/workspace/{id}/dashboard` | 18 ms | 21 ms | 35 ms | 55 ms |
| `GET /api/workspace/{id}/dashboard/tasks?priority=urgent` | 10 ms | 12 ms | 13 ms | 13 ms |
| `GET /api/workspace/{id}` (workspace shell) | 6 ms | 8 ms | 10 ms | 13 ms |

The summary payload is 3.6 kB for 12 tasks (10 open). The drilldown payload is
643 B for the 2 urgent tasks and is capped at 50 rows. Both endpoints run one
query for counts and one for the bucket rows (parallel); no N+1 per project.

## 3. Page metrics (development server)

| Run | TTFB | DCL | load | FCP | LCP | CLS | long tasks | click → next frame |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop 1 | 37 ms | 3.79 s | 2.11 s | 4.96 s | 4.96 s | 0 | 7 / 729 ms | 96 ms |
| desktop 2 | 17 ms | 1.68 s | 1.77 s | n/a* | n/a* | 0 | 12 / 1457 ms | 160 ms |
| desktop 3 | 14 ms | 1.85 s | 1.28 s | 4.93 s | 4.93 s | 0 | 9 / 995 ms | 80 ms |
| mobile (390) | 7 ms | 1.31 s | 1.60 s | 4.11 s | 4.11 s | 0 | 4 / 416 ms | 40 ms |

\* the LCP observer returned no entry in run 2; treated as a measurement flake,
not a page defect.

Caveat: the dev server serves ~250 unbundled module requests and ~19 MB of
transferred JavaScript. FCP/LCP therefore describe **Vite dev mode**, not the
production bundle; they must not be compared with a production Lighthouse
score. CLS is 0 in every run, and the drilldown click produced 40–160 ms event
durations (an INP proxy, not a full p75 INP field measurement).

## 4. Bundle size (production build, CI)

| Asset | Size | gzip |
| --- | --- | --- |
| `overview-*.js` (dashboard route) | 25.17 kB | 8.09 kB |
| `overview-*.js` (second route named overview) | 11.26 kB | 3.82 kB |
| shared `index-*.js` | 667.64 kB | 209.66 kB |
| shared `index-*.css` | 353.13 kB | 47.13 kB |

The dashboard adds a ~25 kB route chunk (8 kB gzip); charts are SVG/CSS, no
chart dependency. The build still warns about chunks over 500 kB (`elk`,
`comment-editor`, `index`, `wasm`, …), all existing app-wide chunks and outside
this phase; they are the dominant cost for first load, not the dashboard.

## 5. Findings

1. **No dashboard-specific performance blocker.** API p50 is ~21 ms, the route
   chunk is small, there are no images or web fonts added by the dashboard, and
   CLS is 0 at all sizes and both themes.
2. **FCP/LCP is dominated by the development module graph** (250 requests).
   Production LCP must be measured after the web build is served; the CI build
   output shows only the dashboard chunk as new cost.
3. **Two 30-second refetches** (`refetchInterval: 30_000`, refetch on focus) add
   ~3.6 kB per poll per open dashboard. Acceptable for one workspace view;
   raise the interval if many tabs are expected.
4. **No INP field data.** The click proxy stayed under 160 ms; long tasks in dev
   mode come from the module graph/HMR, so they are not evidence of production
   INP. A deployed trace or Lighthouse run should confirm p75 INP < 200 ms.
5. **Lighthouse not available locally.** The spec lists it as a tool; run it
   against the production build (CI artifact or a staging deployment) before
   the next release if a numeric score is required.

## 6. Verdict

Performance findings are documented and no regression was introduced by the
dashboard: small route chunk, fast reads, zero layout shift. The unmeasured
items are production LCP/INP and a Lighthouse score, both blocked by the
absence of a production preview on this machine; they do not block Gate 6,
which asks for documented findings.
