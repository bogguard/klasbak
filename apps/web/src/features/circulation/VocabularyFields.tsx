import { LIBRARY_KINDS, type LibraryKind, type LibraryTerms } from '@klasbak/shared';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { inputHeight } from '../../components/ui/Form';
import type { AppConfig } from '../../lib/config';

type TermName = keyof LibraryTerms;
const TERM_NAMES: TermName[] = ['pupil', 'teacher', 'group'];
const FORMS = ['one', 'other'] as const;
type Form = (typeof FORMS)[number];

export type Vocabulary = { kind: LibraryKind; words: Record<TermName, Record<Form, string>> };

export function vocabularyFromConfig(config: AppConfig): Vocabulary {
  const word = (name: TermName) => ({
    one: config.terms?.[name]?.one ?? '',
    other: config.terms?.[name]?.other ?? '',
  });
  return {
    kind: config.kind,
    words: { pupil: word('pupil'), teacher: word('teacher'), group: word('group') },
  };
}

const defaultWord = (t: TFunction, kind: LibraryKind, name: TermName, form: Form) =>
  t(`terms.${kind}.${name}.${form}`);

/**
 * The words to store, or undefined when a word has only one of its two forms. A word needs
 * both ("medewerker", "medewerkers") or neither; the default typed out is no own word, so it
 * keeps following the default and its translation.
 */
export function termsToSave(t: TFunction, { kind, words }: Vocabulary): LibraryTerms | undefined {
  const terms: LibraryTerms = {};
  for (const name of TERM_NAMES) {
    const one = words[name].one.trim();
    const other = words[name].other.trim();
    if (Boolean(one) !== Boolean(other)) return undefined;
    const isDefault =
      one === defaultWord(t, kind, name, 'one') && other === defaultWord(t, kind, name, 'other');
    if (one && !isDefault) terms[name] = { one, other };
  }
  return terms;
}

/**
 * The kind of library and its own words for its two reader types and their groups
 * (decision 034). Empty fields use the defaults for the kind, shown as placeholders.
 */
export function VocabularyFields({
  value,
  onChange,
}: {
  value: Vocabulary;
  onChange: (next: Vocabulary) => void;
}) {
  const { t } = useTranslation();
  const { kind, words } = value;

  const setWord = (name: TermName, form: Form, text: string) =>
    onChange({ kind, words: { ...words, [name]: { ...words[name], [form]: text } } });

  // Switching kind: words that were just the old kind's defaults make way for the new ones.
  function changeKind(next: LibraryKind) {
    const cleared = { ...words };
    for (const name of TERM_NAMES) {
      const keep = (form: Form) =>
        words[name][form].trim() === defaultWord(t, kind, name, form) ? '' : words[name][form];
      cleared[name] = { one: keep('one'), other: keep('other') };
    }
    onChange({ kind: next, words: cleared });
  }

  return (
    <>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{t('settings.vocabulary.kind')}</legend>
        {LIBRARY_KINDS.map((option) => (
          <label key={option} className="flex min-h-11 items-start gap-3">
            <input
              type="radio"
              name="library-kind"
              value={option}
              checked={kind === option}
              onChange={() => changeKind(option)}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />
            <span>
              {t(`settings.vocabulary.kinds.${option}`)}
              <span className="block text-sm text-muted">
                {t(`settings.vocabulary.kindHints.${option}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{t('settings.vocabulary.words')}</legend>
        <p className="text-sm text-muted">{t('settings.vocabulary.wordsHint')}</p>
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('settings.vocabulary.what')}
                </th>
                {FORMS.map((form) => (
                  <th key={form} scope="col" className="px-4 py-3 font-medium">
                    {t(`settings.vocabulary.${form}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {TERM_NAMES.map((name) => (
                <tr key={name}>
                  <th scope="row" className="px-4 py-2 font-normal">
                    {t(`settings.vocabulary.terms.${name}`)}
                  </th>
                  {FORMS.map((form) => (
                    <td key={form} className="px-4 py-2">
                      <input
                        aria-label={`${t(`settings.vocabulary.terms.${name}`)}: ${t(`settings.vocabulary.${form}`)}`}
                        value={words[name][form]}
                        onChange={(e) => setWord(name, form, e.target.value)}
                        // The default for the chosen kind of library, used when left empty.
                        placeholder={defaultWord(t, kind, name, form)}
                        maxLength={40}
                        className={`${inputHeight} w-full rounded-lg border border-line bg-surface px-3`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </>
  );
}
