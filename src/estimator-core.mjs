export const PVGIS_ENDPOINT = 'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc';

export function normalizeEstimateInput(input) {
  const zip = String(input?.zip || '').trim();
  const monthlyKwh = Number(input?.monthlyKwh);
  const offset = Number(input?.offset);
  const panelWattage = Number(input?.panelWattage);
  const futureUsageAdjustment = Number(input?.futureUsageAdjustment || 0);
  const orientation = String(input?.orientation || 'unknown');
  const shading = String(input?.shading || 'not-sure');
  if (!/^\d{5}$/.test(zip)) throw new Error('Enter a valid five-digit US ZIP code.');
  if (!Number.isFinite(monthlyKwh) || monthlyKwh < 10 || monthlyKwh > 50000) throw new Error('Enter average monthly electricity use between 10 and 50,000 kWh.');
  if (!Number.isFinite(offset) || offset < 50 || offset > 100) throw new Error('Choose a solar offset between 50% and 100%.');
  if (!Number.isFinite(panelWattage) || panelWattage < 300 || panelWattage > 550) throw new Error('Choose panel wattage between 300 W and 550 W.');
  if (!Number.isFinite(futureUsageAdjustment) || futureUsageAdjustment < -50 || futureUsageAdjustment > 100) throw new Error('Future-use adjustment must be between -50% and 100%.');
  if (!['south', 'southeast-southwest', 'east-west', 'north', 'unknown'].includes(orientation)) throw new Error('Choose a valid orientation.');
  if (!['minimal', 'some', 'significant', 'not-sure'].includes(shading)) throw new Error('Choose a valid shading option.');
  return { zip, monthlyKwh, offset, panelWattage, futureUsageAdjustment, orientation, shading };
}

export function orientationConfig(orientation) {
  return { south: { aspect: 0, label: 'south-facing assumption' }, 'southeast-southwest': { aspect: 45, label: 'southeast/southwest assumption' }, 'east-west': { aspect: 90, label: 'east/west assumption' }, north: { aspect: 180, label: 'north-facing assumption' }, unknown: { aspect: 0, label: 'south-facing planning assumption' } }[orientation];
}

export function calculateEstimate(input, annualKwhPerKw) {
  const data = normalizeEstimateInput(input);
  if (!Number.isFinite(annualKwhPerKw) || annualKwhPerKw <= 0) throw new Error('Solar production model returned an invalid result.');
  const annualUsage = data.monthlyKwh * 12 * (1 + data.futureUsageAdjustment / 100);
  const targetAnnualKwh = annualUsage * data.offset / 100;
  const baselineKw = targetAnnualKwh / annualKwhPerKw;
  const planningLoss = { minimal: 0.05, some: 0.15, significant: 0.3, 'not-sure': 0.15 }[data.shading];
  // The lower bound assumes the PVGIS modeled plane. The upper bound adds an explicit broad planning allowance for site shading/roof uncertainty; it is not a shade study.
  const lowKw = baselineKw;
  const highKw = baselineKw / (1 - planningLoss);
  const lowPanels = Math.ceil((lowKw * 1000) / data.panelWattage);
  const highPanels = Math.ceil((highKw * 1000) / data.panelWattage);
  return { annualUsage: Math.round(annualUsage), targetAnnualKwh: Math.round(targetAnnualKwh), annualKwhPerKw: Math.round(annualKwhPerKw), systemKw: { low: Number(lowKw.toFixed(1)), high: Number(highKw.toFixed(1)) }, panels: { low: lowPanels, high: highPanels }, production: { low: Math.round(lowKw * annualKwhPerKw), high: Math.round(highKw * annualKwhPerKw) }, planningLoss, orientation: orientationConfig(data.orientation).label, shading: data.shading };
}
