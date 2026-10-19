import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import nlBE from '../locales/nl-BE.json';
import { termVariables } from './terms';

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
  // Synchronous, so the library's words below are there for the very first render.
  initAsync: false,
});

/**
 * Fills the word placeholders ({{pupils}}, {{Group}}, …) in every text. Starts with the school
 * defaults; <LibraryWords> switches to the library's own words once its settings are loaded.
 */
export function setLibraryWords(variables: Record<string, string>): boolean {
  const interpolation = (i18n.options.interpolation ??= {});
  if (JSON.stringify(interpolation.defaultVariables) === JSON.stringify(variables)) return false;
  interpolation.defaultVariables = variables;
  return true;
}
setLibraryWords(termVariables(i18n.t, 'school', undefined));

export default i18n;
