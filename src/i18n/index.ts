import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enGB from './locales/en-GB.json';
import enUS from './locales/en-US.json';

const resources = {
  'en-GB': { translation: enGB },
  'en-US': { translation: enUS },
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
