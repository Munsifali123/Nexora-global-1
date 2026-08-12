# Solar System Size Estimator Plan

Purpose: educational US homeowner tool that estimates a plausible solar system-size and panel-count range before a provider assessment. It must not quote price, guarantee savings/production, recommend an installer, or determine eligibility.

Inputs: ZIP/location; monthly kWh, or monthly bill with disclosed editable rate assumption; desired offset; panel wattage; optional orientation, shading, roof area, and expected usage changes.

Method: annual consumption times desired offset; obtain location-based modeled production using NREL PVWatts V8/NSRDB only after API, terms, key management, privacy, and legal review; solve for DC-kW range; translate to panel-count range; disclose uncertainty for shade, orientation, roof geometry, tariff and actual site conditions.

Sources: NREL PVWatts V8 API and NSRDB; U.S. DOE homeowner solar guidance; EIA retail-sales API only for broad optional context; public jurisdiction-specific utility sources only after review.

Outputs: DC-size range, panel-count range, annual modeled-production range, input summary, assumptions, and factors that can change the estimate.

UX/funnel: results before any lead form; optional existing property inquiry afterwards. Do not store tool inputs as leads without separate user submission.

Differentiation: citable public methodology, range-based results, explicit uncertainty, no pre-result lead gate, and no quote/savings promise.

Decision: not ready to build. First approve methodology, NREL/data use, privacy handling, product requirements, legal review, and timing after guide-cluster baseline.

## Implemented PVGIS alternative - 2026-08-13

Status: built for review and deployment. The implementation uses the JRC PVGIS 5.2 `PVcalc` endpoint with `PVGIS-NSRDB`, a Census ZIP-code tabulation-area centroid lookup, server-side validation/caching/rate limiting, and results before the existing optional inquiry CTA. It does not use NREL or an API key. The canonical auditable specification is now `SOLAR-ESTIMATOR-METHODOLOGY.md`. Bill-dollar input and price/savings/ROI calculations remain explicitly out of scope.
