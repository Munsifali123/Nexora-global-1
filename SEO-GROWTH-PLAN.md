# SEO Growth Plan

## Implemented first cluster

| URL | Primary topic | Intent | Target keyword | Status |
|---|---|---|---|---|
| /solar-installation-process | installation steps | commercial investigation | solar installation process | Implemented |
| /how-many-solar-panels-do-i-need | system sizing | high-conversion informational | how many solar panels do I need | Implemented |
| /solar-financing | payment options | commercial investigation | solar financing | Implemented |
| /solar-lease-vs-loan | ownership comparison | commercial investigation | solar lease vs loan | Implemented |
| /is-solar-worth-it | suitability | commercial investigation | is solar worth it | Implemented |

Each guide links to related decision content and the existing property inquiry funnel.

## Search Console baseline — 2026-08-11

Property: `nexoraglobal.agency` (Domain property). Canonical public host remains `https://www.nexoraglobal.agency`.

### Sitemap and site health

- Submitted sitemap: `https://www.nexoraglobal.agency/sitemap.xml`
- Search Console state: **Success**; last read Aug 11, 2026; 6 discovered pages at the time of Google's last read. The live sitemap now contains 10 URLs, so Google has not yet re-read the expanded file.
- The sitemap was not re-submitted while it remains in Success state.
- Page indexing report: **Processing data, please check again in a day or so**.
- Core Web Vitals: insufficient 90-day field data for both mobile and desktop.
- Performance report: processing data; no query, page, click, impression, CTR, or average-position baseline is available yet.

### New-page URL Inspection baseline

| URL | Index state at check | Live-test result | Indexing request |
|---|---|---|---|
| /solar-installation-process | Not on Google; URL unknown | Available to Google; can be indexed; 1 valid Breadcrumb item | Requested once; accepted into priority crawl queue |
| /how-many-solar-panels-do-i-need | Not on Google / no completed live-test result | Search Console transient error while testing | Not requested |
| /solar-financing | Not on Google; URL unknown | Search Console transient error while testing | Not requested |
| /solar-lease-vs-loan | Not on Google; URL unknown | Search Console transient error while testing | Not requested |
| /is-solar-worth-it | Not on Google; URL unknown | Search Console transient error while testing | Not requested |

The Search Console error was: “Something went wrong. If the issue persists, try again in a few hours.” This is a console-side limitation during inspection, not evidence of a production fault. Do not repeatedly submit URLs; resume the four pending inspection/request actions only after the console is working normally.

### Measurement checkpoints

- **7–14 days:** revisit URL Inspection and confirm sitemap last-read/discovered-page counts; request the four pending URLs once only if they remain unindexed and the console permits it.
- **4–6 weeks:** record Performance query/page impressions, clicks, CTR, average position, and guide-assisted property inquiries.
- **8–12 weeks:** compare guide conversion rate and qualified-lead rate against the homepage and decide whether the next asset is justified.
- **Quarterly:** review indexed pages, Core Web Vitals field data, referring domains, broken links, and canonical coverage.

### Conversion and attribution baseline

- Each guide’s visible CTA routes to the existing `/#solar-check` form; no test lead was submitted.
- Existing attribution captures UTM source, medium, campaign, referrer, and landing page with the lead. Verify those fields in the approved analytics/lead destination before campaign traffic is purchased.
- Existing analytics uses page-view and funnel events. No personally identifiable lead-form values should be sent in analytics events.

### Recommended next SEO asset (not built)

**Solar system size estimator** is the best next asset after this cluster has baseline data: it directly supports the “how many panels” decision, offers useful input before the property check, and is more lead-aligned than a generic cost calculator. Reassess after the 8–12 week checkpoint; do not build it yet.

## U.S. solar acquisition phase - 2026-08-13

The research and canonical map are in `US-SOLAR-SERP-RESEARCH.md` and `US-SOLAR-KEYWORD-MAP.md`. The smallest quality-first launch is the public `/solar-system-size-estimator`, not mass state/city pages or an unsourced cost guide. Texas and Florida are Tier A candidates for the next evidence-backed state hubs; Arizona and Nevada Tier B; New Mexico and California Tier C for the current authority/maintenance constraints. This plan explicitly rejects fabricated local presence and any promise of local-pack placement. Continue only after Search Console supplies non-branded query/landing-page evidence.

## Non-branded commercial launch � 2026-08-13

Published canonical pages: `/solar/texas`, `/solar/florida`, `/solar-panel-cost`, `/solar-panel-cost/texas`, and `/solar-panel-cost/florida`. The pages are intentionally source-backed decision guides rather than location templates. Texas covers retail-plan and PUCT interconnection questions; Florida covers roof/weather planning and PSC utility context; the cost guides focus on complete written scope rather than unsupported price averages.

### Measurement baseline

- Google Search Console Domain property: `nexoraglobal.agency`.
- At launch, the prior Search Console overview showed 0 clicks and processing/limited performance data. The existing sitemap was **Success**, last read August 12, with 10 discovered pages before this five-page expansion.
- Record page and query performance separately for branded and non-branded terms. Treat a query as branded when it contains `nexora`, `nexora global`, or a material spelling variant; report all other solar query impressions/clicks separately.
- Checkpoints: 2 weeks (sitemap re-read, indexed URLs, inspection status); 4 weeks (non-branded impressions by landing page); 8 weeks (clicks, CTR, average position, estimator-start and inquiry-start events); 12 weeks (qualified inquiry rate and next-content decision).
- No ranking or time-to-rank promise is implied.

### Analytics and attribution

The state/cost pages emit only non-PII funnel events: `state_page_view`, `cost_guide_view`, estimator CTA click, and inquiry CTA click. The existing form-start event no longer sends the selected electricity-bill range to analytics. A safe `source` query value is saved with a lead as `internalSource` alongside existing campaign UTM fields; it does not overwrite them. No production test lead was submitted.
