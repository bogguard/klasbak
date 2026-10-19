import type { LibraryKind, LibraryTerms } from '@library/shared';
import type { TFunction } from 'i18next';

/*
 * The library's own words (decision 034). Texts use placeholders such as {{pupils}} and
 * {{Group}}; these are filled in for every text, from the words an administrator chose or the
 * defaults for the kind of library. Internal names stay "pupil" (the reader type with fewer
 * books) and "teacher" (the one with more), whatever they are called on screen.
 */

const capitalise = (word: string) => word.charAt(0).toLocaleUpperCase() + word.slice(1);

export function termVariables(
  t: TFunction,
  kind: LibraryKind,
  terms: LibraryTerms | undefined,
): Record<string, string> {
  const word = (name: keyof LibraryTerms, form: 'one' | 'other') =>
    terms?.[name]?.[form] ?? t(`terms.${kind}.${name}.${form}`);
  const variables: Record<string, string> = {
    pupil: word('pupil', 'one'),
    pupils: word('pupil', 'other'),
    teacher: word('teacher', 'one'),
    teachers: word('teacher', 'other'),
    group: word('group', 'one'),
    groups: word('group', 'other'),
    // "de school" / "de organisatie", and "schooljaar" / "jaar".
    org: t(`terms.${kind}.org`),
    period: t(`terms.${kind}.period`),
  };
  // Capitalised forms for the start of a sentence or a heading: {{Pupils}}, {{Group}}, …
  for (const [name, value] of Object.entries({ ...variables })) {
    variables[capitalise(name)] = capitalise(value);
  }
  return variables;
}
