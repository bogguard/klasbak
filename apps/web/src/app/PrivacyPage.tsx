import { useTranslation } from 'react-i18next';
import { useConfig } from '../lib/config';

const SECTIONS = ['who', 'what', 'why', 'retention', 'where', 'cookies', 'rights'] as const;

/**
 * The privacy notice in plain language, for parents and pupils. It describes what this
 * software does; the school, as data controller, can ask for changes to match its policy.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const { libraryName } = useConfig();
  return (
    <article className="max-w-prose space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('privacy.heading')}</h1>
      <p className="text-lg">{t('privacy.intro', { library: libraryName })}</p>
      {SECTIONS.map((section) => (
        <section key={section} aria-labelledby={`privacy-${section}`} className="space-y-2">
          <h2 id={`privacy-${section}`} className="text-xl font-semibold">
            {t(`privacy.${section}.heading`)}
          </h2>
          <p className="leading-relaxed">{t(`privacy.${section}.body`)}</p>
        </section>
      ))}
    </article>
  );
}
