import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enGB from './locales/en-GB.json';
import enUS from './locales/en-US.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import it from './locales/it.json';

const resources = {
  'en-GB': { translation: enGB },
  'en-US': { translation: enUS },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en-GB',
  fallbackLng: 'en-GB',
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
