# U.S. Solar SERP Research

Research date: 2026-08-13. This is a strategic U.S. organic-search assessment, not a claim of keyword volume or ranking outcome. Personalised and location-sensitive SERPs vary by searcher; validate query demand and landing-page performance in Search Console after launch.

## Decision

Launch one genuinely useful national tool first: `/solar-system-size-estimator`. Do not publish state or cost pages in this release. Six thin state variants, cost estimates without current sourced data, and city pages would not pass Nexora's quality gate.

## Target-state priority

| Tier | State | Opportunity assessment | Release decision |
|---|---|---|---|
| A | Texas | Large homeowner market, strong commercial solar intent, broad metro variation and viable modeled production. | Research a sourced Texas hub next. |
| A | Florida | Strong homeowner intent and high modeled production; utility, insurance and roof considerations need careful local sourcing. | Research a sourced Florida hub next. |
| B | Arizona | Very strong solar resource; competitive commercial SERP. | Validate unique utility/incentive material before a hub. |
| B | Nevada | Strong resource and concentrated metro demand; local intent is competitive. | Validate unique utility material first. |
| C | New Mexico | Strong modeled resource but smaller addressable search opportunity. | Defer until state hubs prove demand. |
| C | California | Large demand and resource, but unusually competitive and policy/utility context changes quickly. | Defer until a current, fully sourced resource can be maintained. |

This ranking is an inference from homeowner intent, competitive risk, resource validation, and Nexora's current content authority; it is not paid keyword-volume research.

## Query and SERP intent

- `solar near me`, `solar companies near me`, `solar installers near me`, and installation variants: local commercial intent. Results commonly combine ads, a local pack/maps, installer sites, directories, and sometimes national marketplaces.
- `solar panel cost`, `solar prices`, and `solar installation cost`: commercial investigation. Results favor current, sourced cost explainers, calculators, comparison pages, and authoritative consumer resources.
- `solar calculator`, `solar panel calculator`, `solar system size calculator`, and `how many solar panels do I need`: tool/investigation intent. A transparent, useful calculator can earn a distinct organic role.
- State-modified versions: mixed local-commercial and research intent. A page can compete organically only if it provides current state-specific utility, regulatory, and decision information, rather than a generic paragraph with a state name swapped.

## Near-me and local-pack constraint

Nexora is a matching/inquiry service, not a network of physical installer offices. It must not create fabricated locations, Business Profiles, reviews, addresses, or LocalBusiness schema. Google's own guidance says local results are driven principally by relevance, distance, and prominence. Nexora therefore cannot manipulate distance or promise Maps/local-pack placement. The legitimate opportunity is helpful organic content and tools beneath or alongside local results, backed by authority and real service disclosure.

## Competitive patterns worth earning, not copying

Strong organic competitors tend to provide: a clear transactional next step; credible source links; decision frameworks; calculators or comparison utility; internally connected guides; and specific, maintained local context. Nexora's differentiation should be privacy-first ZIP-area sizing, transparent methodology, no lead gate, and an optional inquiry after results.

## State architecture and quality gate

Candidate future routes are `/solar/texas` and `/solar/florida` first, followed only by research-supported pages for Arizona, Nevada, New Mexico, and California. Each would require original state-specific sections on utility/consumer decision factors, resource context, official links, questions for providers, and estimator linkage. No city pages are authorised. A page fails if removing its state name leaves it substantially identical to another page.

## Sources and validation notes

- European Commission JRC's PVGIS API documents PVGIS-NSRDB for the Americas between 60N and 20S and its GET/JSON API behavior: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en
- DOE confirms solar resources vary by location and microclimate, supporting a location-aware but non-site-specific tool: https://www.energy.gov/cmei/femp/renewable-energy-maps-and-tools
- Google local-ranking guidance: https://support.google.com/business/answer/7091
- Google people-first content guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
