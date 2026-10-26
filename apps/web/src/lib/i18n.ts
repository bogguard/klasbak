import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import nlBE from '../locales/nl-BE.json';

export const LANGUAGES = ['nl-BE', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'language';

// Dutch is the default for everyone; English only when chosen explicitly.
function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(value as Language) ? (value as Language) : 'nl-BE';
  } catch {
    return 'nl-BE';
  }
}

export function changeLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Private mode: the choice simply isn't remembered.
  }
  document.documentElement.lang = language;
  return i18n.changeLanguage(language);
}

const initial = storedLanguage();
document.documentElement.lang = initial;

void i18n.use(initReactI18next).init({
  resources: { 'nl-BE': { translation: nlBE }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'nl-BE',
  interpolation: { escapeValue: false }, // React already escapes output
});

export default i18n;
