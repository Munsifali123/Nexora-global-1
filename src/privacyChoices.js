const STORAGE_KEY = 'nexora_measurement_choice';
const CHANGE_EVENT = 'nexora:measurement-choice';
let inMemoryChoice = null;

export const MEASUREMENT_CHOICES = Object.freeze({
  DEFAULT: 'default',
  ALLOW: 'allow',
  OPT_OUT: 'opt_out',
});

export function hasGlobalPrivacyControl() {
  return typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
}

export function getMeasurementChoice() {
  if (typeof window === 'undefined') return MEASUREMENT_CHOICES.DEFAULT;
  if (hasGlobalPrivacyControl()) return MEASUREMENT_CHOICES.OPT_OUT;
  if (inMemoryChoice) return inMemoryChoice;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === MEASUREMENT_CHOICES.ALLOW || stored === MEASUREMENT_CHOICES.OPT_OUT
      ? stored
      : MEASUREMENT_CHOICES.DEFAULT;
  } catch {
    return MEASUREMENT_CHOICES.DEFAULT;
  }
}

export function isMeasurementAllowed() {
  return getMeasurementChoice() !== MEASUREMENT_CHOICES.OPT_OUT;
}

export function setMeasurementChoice(choice) {
  if (typeof window === 'undefined') return;
  if (![MEASUREMENT_CHOICES.ALLOW, MEASUREMENT_CHOICES.OPT_OUT].includes(choice)) {
    throw new Error('Invalid measurement choice.');
  }
  inMemoryChoice = choice;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // The in-page event still lets loaded measurement clients honor the choice.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { choice: getMeasurementChoice() } }));
}

export function subscribeMeasurementChoice(listener) {
  if (typeof window === 'undefined') return () => {};
  const handleChange = () => listener(getMeasurementChoice());
  const handleStorage = (event) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    inMemoryChoice = event.newValue === MEASUREMENT_CHOICES.ALLOW || event.newValue === MEASUREMENT_CHOICES.OPT_OUT
      ? event.newValue
      : null;
    listener(getMeasurementChoice());
  };
  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}
