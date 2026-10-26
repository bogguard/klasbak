import { AVI_LEVELS, TITLE_TYPES, type TitleInput } from '@klasbak/shared';
import { ArrowRight, Save } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Feedback';
import { Field, inputHeight } from '../../components/ui/Form';
import {
  LANGUAGE_CODES,
  parseTitleForm,
  type FormErrors,
  type TitleField,
  type TitleFormValues,
} from './titleFormValues';

type TitleFormProps = {
  initialValues: TitleFormValues;
  submitLabel: string;
  /** A second save button, e.g. "save and next book"; onSubmit learns which one was used. */
  alternativeSubmitLabel?: string;
  onSubmit: (title: TitleInput, options: { alternative: boolean }) => Promise<void>;
  /** Extra fields rendered before the buttons, e.g. number of copies. */
  extra?: ReactNode;
  /** Shown above the buttons, e.g. a server error. */
  footer?: ReactNode;
  secondaryAction?: ReactNode;
};

export function TitleForm({
  initialValues,
  submitLabel,
  alternativeSubmitLabel,
  onSubmit,
  extra,
  footer,
  secondaryAction,
}: TitleFormProps) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const languageNames = new Intl.DisplayNames([i18n.language], { type: 'language' });

  function set(field: TitleField) {
    return (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseTitleForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      const form = event.currentTarget;
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setBusy(true);
    try {
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      await onSubmit(result.title, { alternative: submitter?.dataset.alternative === 'true' });
    } catch {
      // The page shows the error (via the mutation state) next to the form.
    } finally {
      setBusy(false);
    }
  }

  const error = (field: TitleField) => (errors[field] ? t(errors[field]) : undefined);

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">{t('manage.form.sections.main')}</legend>
        <Field label={t('manage.form.type')} required>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.type}
              onChange={set('type')}
            >
              {TITLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('manage.form.isbn')} error={error('isbn')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.isbn}
              onChange={set('isbn')}
              inputMode="numeric"
            />
          )}
        </Field>
        <Field
          label={t('manage.form.title')}
          error={error('title')}
          required
          className="sm:col-span-2"
        >
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.title}
              onChange={set('title')}
            />
          )}
        </Field>
        <Field label={t('manage.form.subtitle')} className="sm:col-span-2">
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.subtitle}
              onChange={set('subtitle')}
            />
          )}
        </Field>
        <Field label={t('manage.form.authors')} hint={t('manage.form.authorsHint')}>
          {(props) => (
            <textarea
              {...props}
              className={`${props.className} py-2`}
              rows={3}
              value={values.authors}
              onChange={set('authors')}
            />
          )}
        </Field>
        <Field label={t('manage.form.subjects')} hint={t('manage.form.subjectsHint')}>
          {(props) => (
            <textarea
              {...props}
              className={`${props.className} py-2`}
              rows={3}
              value={values.subjects}
              onChange={set('subjects')}
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">{t('manage.form.sections.publication')}</legend>
        <Field label={t('manage.form.publisher')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.publisher}
              onChange={set('publisher')}
            />
          )}
        </Field>
        <Field label={t('manage.form.year')} error={error('publishedYear')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.publishedYear}
              onChange={set('publishedYear')}
              inputMode="numeric"
            />
          )}
        </Field>
        <Field label={t('manage.form.language')}>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.language}
              onChange={set('language')}
            >
              {/* Keep an unusual language from an ISBN lookup selectable. */}
              {[...new Set([...LANGUAGE_CODES, values.language])].map((code) => (
                <option key={code} value={code}>
                  {languageNames.of(code)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-2 font-semibold">{t('manage.form.sections.readers')}</legend>
        <Field label={t('manage.form.avi')}>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.aviLevel}
              onChange={set('aviLevel')}
            >
              <option value="">{t('manage.form.none')}</option>
              {AVI_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('manage.form.zizo')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.zizoLevel}
              onChange={set('zizoLevel')}
            />
          )}
        </Field>
        <Field label={t('manage.form.ageMin')} error={error('ageMin')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.ageMin}
              onChange={set('ageMin')}
              inputMode="numeric"
            />
          )}
        </Field>
        <Field label={t('manage.form.ageMax')} error={error('ageMax')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.ageMax}
              onChange={set('ageMax')}
              inputMode="numeric"
            />
          )}
        </Field>
        <Field label={t('manage.form.summary')} className="sm:col-span-4">
          {(props) => (
            <textarea
              {...props}
              className={`${props.className} py-2`}
              rows={5}
              value={values.summary}
              onChange={set('summary')}
            />
          )}
        </Field>
      </fieldset>

      {extra}
      {footer}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={busy}>
          <Save className="size-4" aria-hidden="true" />
          {busy ? t('manage.form.saving') : submitLabel}
        </Button>
        {alternativeSubmitLabel && (
          <Button type="submit" variant="secondary" data-alternative="true" disabled={busy}>
            <ArrowRight className="size-4" aria-hidden="true" />
            {alternativeSubmitLabel}
          </Button>
        )}
        {secondaryAction}
      </div>
    </form>
  );
}
