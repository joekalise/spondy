import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import enGB from './locales/en-GB.json';
import enUS from './locales/en-US.json';
import es from './locales/es.json';

const resources = {
  'en-GB': { translation: enGB },
  'en-US': { translation: enUS },
  es: { translation: es },
};

// Match the device's preferred locales against what we have, falling back to
// en-GB for anything unregistered (or partially translated, i18next's own
// fallbackLng below fills in any missing keys with the en-GB string).
function resolveAppLocale(): keyof typeof resources {
  for (const { languageCode, regionCode } of getLocales()) {
    if (!languageCode) continue;
    const tag = regionCode ? `${languageCode}-${regionCode}` : languageCode;
    if (tag in resources) return tag as keyof typeof resources;
    if (languageCode in resources) return languageCode as keyof typeof resources;
    if (languageCode === 'en') return 'en-GB';
  }
  return 'en-GB';
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveAppLocale(),
  fallbackLng: 'en-GB',
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

// i18next's automatic count-based _one/_other suffix resolution depends on
// the device having a working Intl.PluralRules — on devices without one it
// silently fails and renders the raw key instead of falling back sanely.
// Pick the suffix manually instead of trusting that resolution.
export function tPlural(
  t: (key: string, opts?: Record<string, unknown>) => string,
  key: string,
  count: number,
  opts?: Record<string, unknown>
): string {
  return count === 1 ? t(`${key}_one`, { count, ...opts }) : t(`${key}_other`, { count, ...opts });
}

export default i18n;
