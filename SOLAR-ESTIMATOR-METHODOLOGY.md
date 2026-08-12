# Solar Estimator Methodology

## Purpose and privacy

`/solar-system-size-estimator` is an educational planning tool. It shows results before any inquiry CTA and does not require name, email, phone, street address, bill amount, or account data. A five-digit ZIP is sent to Nexora's server only to obtain an approximate ZIP Code Tabulation Area centroid; the centroid, not an address, is sent to the production model. Analytics events intentionally exclude ZIP, kWh, and all personal information.

## Data source and architecture

The server calls the European Commission Joint Research Centre PVGIS 5.2 `PVcalc` endpoint with `raddatabase=PVGIS-NSRDB`, a U.S.-appropriate dataset documented for the Americas. It requests one kW DC, 14% default system loss, 20-degree tilt, an orientation assumption, and JSON output. The response field `outputs.totals.fixed.E_y` is modeled annual kWh per installed kW. A backend proxy validates input, rate-limits clients to 20 requests per IP per 15 minutes, caches PVGIS model output for one hour per approximate location/orientation, and returns only a stable estimate response. PVGIS does not require an API key; the proxy is still useful for validation, privacy minimization, caching, abuse control, and future provider replacement.

Official references:

- PVGIS API: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en
- PVGIS overview: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en
- U.S. DOE resource context: https://www.energy.gov/cmei/femp/renewable-energy-maps-and-tools

## Formula

1. `annual usage = monthly kWh * 12 * (1 + future-use adjustment)`.
2. `target annual kWh = annual usage * desired offset`.
3. `base kW DC = target annual kWh / PVGIS annual kWh per kW`.
4. The lower system and production result use that model output. The upper planning value divides base kW by `(1 - planning allowance)`.
5. Planning allowance is 5% for minimal shade, 15% for some or unknown shade, and 30% for significant shade. It is an explicit planning allowance for roof/shade uncertainty, not a site shade study.
6. Panel count is `ceil(system kW * 1000 / selected panel watts)` for each range bound.

## Inputs and outputs

Inputs: five-digit ZIP, average monthly kWh, 50/75/100% desired offset, 350/400/450 W panel option, optional orientation, optional shading category, and optional future electricity-use adjustment. Outputs: system-size range (kW DC), panel-count range, modeled annual-production range, and assumptions/limitations. The tool does not calculate savings, ROI, payback, tax-credit eligibility, quotes, or financing.

## Controlled six-state validation

PVGIS 5.2 `PVcalc`, 1 kW, 14% loss, 20-degree tilt, south aspect, PVGIS-NSRDB produced these annual outputs during validation:

| State | Sample location | Approx. annual kWh/kW |
|---|---|---:|
| Texas | Houston | 1444.9 |
| Florida | Miami | 1556.2 |
| Arizona | Phoenix | 1771.7 |
| Nevada | Las Vegas | 1769.7 |
| New Mexico | Albuquerque | 1809.8 |
| California | Los Angeles | 1676.0 |

The geographic pattern is consistent with DOE's statement that resources vary by location and microclimate; this is a plausibility cross-check, not an attempt to reproduce a proprietary or NREL calculator. These are model outputs, not guarantees.

## Limitations

ZIP centroids cannot represent a roof. The default tilt, orientation, 14% loss, source period, shading category, weather, roof geometry, obstructions, equipment, permitting, interconnection, utility rules, and final engineering can materially change a proposal. PVGIS API guidance documents a 30 calls/second/IP upstream limit and possible overload responses; Nexora handles upstream failures without fabricating a result. Revalidate the provider/version and six-state samples before any major methodology change.
