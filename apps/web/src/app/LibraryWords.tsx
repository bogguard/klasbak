import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../lib/config';
import { setLibraryWords } from '../lib/i18n';
import { termVariables } from '../lib/terms';

/**
 * Puts the library's own words (Instellingen → Bibliotheek) into every text, and again after a
 * language switch. Renders nothing.
 */
export function LibraryWords() {
  const { t, i18n } = useTranslation();
  const { kind = 'school', terms } = useConfig();
  useEffect(() => {
    // Changing the language to itself makes every text re-render with the new words.
    if (setLibraryWords(termVariables(t, kind, terms))) void i18n.changeLanguage(i18n.language);
  }, [t, i18n, kind, terms]);
  return null;
}
