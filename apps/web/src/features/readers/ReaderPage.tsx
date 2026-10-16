import {
  isOverdue,
  localDate,
  READER_CATEGORIES,
  ReaderInputSchema,
  readerName,
  type Loan,
  type Reader,
  type ReaderInput,
} from '@library/shared';
import { ArrowLeft, Download, IdCard, Lock, Save, Trash2, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { formatDate, formatTimestampDate } from '../../lib/format';
import { useRenew } from '../circulation/api';
import { useCreateReader, useDeleteReader, useReader, useReaders, useUpdateReader } from './api';

type Values = {
  firstName: string;
  lastName: string;
  group: string;
  category: ReaderInput['category'];
  email: string;
  memberNumber: string;
  active: boolean;
};

const empty: Values = {
  firstName: '',
  lastName: '',
  group: '',
  category: 'pupil',
  email: '',
  memberNumber: '',
  active: true,
};

function toValues(reader: Reader): Values {
  return {
    firstName: reader.firstName,
    lastName: reader.lastName,
    group: reader.group ?? '',
    category: reader.category,
    email: reader.email ?? '',
    memberNumber: reader.memberNumber,
    active: reader.active,
  };
}

const ERROR_KEYS: Partial<Record<keyof Values, string>> = {
  firstName: 'readers.form.errors.firstName',
  lastName: 'readers.form.errors.lastName',
  email: 'readers.form.errors.email',
  memberNumber: 'readers.form.errors.memberNumber',
  group: 'readers.form.errors.group',
};

function parseValues(values: Values) {
  const optional = (v: string) => (v.trim() === '' ? undefined : v.trim());
  const result = ReaderInputSchema.safeParse({
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    group: optional(values.group),
    category: values.category,
    email: optional(values.email),
    memberNumber: optional(values.memberNumber),
    active: values.active,
  });
  if (result.success) return { ok: true as const, input: result.data };
  const errors: Partial<Record<keyof Values, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof Values;
    errors[field] = ERROR_KEYS[field] ?? 'manage.form.errors.generic';
  }
  return { ok: false as const, errors };
}

/** Both "new reader" (no id) and "edit reader". */
export function ReaderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const existing = useReader(id ?? '');
  const errorMessage = useErrorMessage();

  const back = (
    <Link
      to="/manage/readers"
      className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('readers.back')}
    </Link>
  );

  if (!id) {
    return (
      <div className="space-y-6">
        {back}
        <h1 className="text-3xl font-semibold tracking-tight">{t('readers.new')}</h1>
        <ReaderForm />
      </div>
    );
  }
  if (existing.isPending) return <Skeleton className="h-96 w-full" />;
  if (existing.isError) {
    return (
      <div className="space-y-6">
        {back}
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(existing.error)}
        />
      </div>
    );
  }

  const { reader, loans } = existing.data;
  return (
    <div className="space-y-8">
      {back}
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{readerName(reader)}</h1>
        <p className="text-muted">
          {[reader.group, t(`readers.categories.${reader.category}`)].filter(Boolean).join(' · ')} ·{' '}
          <span className="font-mono">{reader.memberNumber}</span>
        </p>
        <Link
          to={`/manage/labels?type=cards&readers=${reader.id}`}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4"
        >
          <IdCard className="size-4" aria-hidden="true" />
          {t('labels.printCard')}
        </Link>
      </header>
      <LoansSection loans={loans} />
      <section aria-labelledby="reader-details" className="space-y-4">
        <h2 id="reader-details" className="text-xl font-semibold">
          {t('readers.details')}
        </h2>
        <ReaderForm reader={reader} />
      </section>
      <PrivacyActions reader={reader} loans={loans} />
    </div>
  );
}

/** The reader's rights: a copy of their data, and erasure. */
function PrivacyActions({ reader, loans }: { reader: Reader; loans: Loan[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useDeleteReader(reader.id);
  const errorMessage = useErrorMessage();
  const hasBooks = loans.some((loan) => !loan.returnedAt);

  function download() {
    const data = JSON.stringify({ reader, loans }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lezer-${reader.memberNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function erase() {
    if (!window.confirm(t('readers.privacy.confirmDelete', { name: readerName(reader) }))) return;
    try {
      await remove.mutateAsync();
      void navigate('/manage/readers', { replace: true });
    } catch {
      // Shown below.
    }
  }

  return (
    <section aria-labelledby="reader-privacy" className="space-y-3 border-t border-line pt-6">
      <h2 id="reader-privacy" className="text-xl font-semibold">
        {t('readers.privacy.heading')}
      </h2>
      <p className="text-sm text-muted">{t('readers.privacy.explanation')}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={download}>
          <Download className="size-4" aria-hidden="true" />
          {t('readers.privacy.export')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void erase()}
          disabled={hasBooks || remove.isPending}
          className="text-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t('readers.privacy.delete')}
        </Button>
      </div>
      {hasBooks && <p className="text-sm text-muted">{t('readers.privacy.hasBooks')}</p>}
      {remove.isError && <Alert tone="danger">{errorMessage(remove.error)}</Alert>}
    </section>
  );
}

function ReaderForm({ reader }: { reader?: Reader }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateReader();
  const update = useUpdateReader(reader?.id ?? '');
  const readers = useReaders();
  const errorMessage = useErrorMessage();
  const [values, setValues] = useState<Values>(reader ? toValues(reader) : empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [saved, setSaved] = useState(false);
  // The version we last saw; the next save must be based on it (optimistic locking).
  const [version, setVersion] = useState(reader?.version ?? 0);
  const mutation = reader ? update : create;
  const groups = [...new Set((readers.data ?? []).map((r) => r.group).filter(Boolean))].sort();

  function set<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseValues(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      const form = event.currentTarget;
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    try {
      if (reader) {
        const { memberNumber: _fixed, ...details } = parsed.input;
        const updated = await update.mutateAsync({ reader: details, version });
        setVersion(updated.version);
        setSaved(true);
      } else {
        const created = await create.mutateAsync(parsed.input);
        void navigate(`/manage/readers/${created.id}`, { replace: true });
      }
    } catch {
      // Shown below the form.
    }
  }

  const error = (field: keyof Values) => (errors[field] ? t(errors[field]) : undefined);

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('readers.form.firstName')} error={error('firstName')} required>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={t('readers.form.lastName')} error={error('lastName')} required>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={t('readers.group')} error={error('group')} hint={t('readers.form.groupHint')}>
          {(props) => (
            <>
              <input
                {...props}
                className={`${props.className} ${inputHeight}`}
                value={values.group}
                onChange={(e) => set('group', e.target.value)}
                list="reader-groups"
                autoComplete="off"
              />
              <datalist id="reader-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t('readers.form.category')}>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.category}
              onChange={(e) => set('category', e.target.value as Values['category'])}
            >
              {READER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`readers.categories.${c}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={t('readers.form.email')}
          error={error('email')}
          hint={t('readers.form.emailHint')}
        >
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        {reader ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('readers.memberNumber')}</p>
            <p className="flex min-h-11 items-center gap-2 font-mono text-muted">
              <Lock className="size-4" aria-hidden="true" />
              {reader.memberNumber}
            </p>
          </div>
        ) : (
          <Field
            label={t('readers.memberNumber')}
            error={error('memberNumber')}
            hint={t('readers.form.memberNumberHint')}
          >
            {(props) => (
              <input
                {...props}
                className={`${props.className} ${inputHeight} font-mono`}
                value={values.memberNumber}
                onChange={(e) => set('memberNumber', e.target.value)}
                placeholder={t('manage.copies.automatic')}
                autoComplete="off"
              />
            )}
          </Field>
        )}
      </div>

      {reader && (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => set('active', e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {t('readers.form.active')}
        </label>
      )}

      {saved && <Alert tone="success">{t('manage.edit.saved')}</Alert>}
      {mutation.isError && <Alert tone="danger">{errorMessage(mutation.error)}</Alert>}

      <Button type="submit" disabled={mutation.isPending}>
        <Save className="size-4" aria-hidden="true" />
        {mutation.isPending ? t('manage.form.saving') : t('readers.form.save')}
      </Button>
    </form>
  );
}

function LoansSection({ loans }: { loans: Loan[] }) {
  const { t, i18n } = useTranslation();
  const renew = useRenew();
  const errorMessage = useErrorMessage();
  const today = localDate();
  const active = loans.filter((loan) => !loan.returnedAt);
  const history = loans.filter((loan) => loan.returnedAt);

  return (
    <section aria-labelledby="reader-loans" className="space-y-3">
      <h2 id="reader-loans" className="text-xl font-semibold">
        {t('readers.loans.active', { count: active.length })}
      </h2>
      {active.length === 0 ? (
        <p className="text-muted">{t('readers.loans.none')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {active.map((loan) => (
            <li
              key={loan.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <Link to={`/manage/titles/${loan.titleId}`} className="font-medium hover:underline">
                {loan.titleTitle}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {t('readers.loans.due', { date: formatDate(loan.dueDate, i18n.language) })}
                {isOverdue(loan, today) && <Badge tone="danger">{t('loans.late')}</Badge>}
                {(loan.renewals ?? 0) > 0 && (
                  <span className="text-muted">{t('loans.renewed', { count: loan.renewals })}</span>
                )}
                <Button
                  variant="secondary"
                  disabled={renew.isPending}
                  onClick={() => renew.mutate({ readerId: loan.readerId, loanId: loan.id })}
                  aria-label={t('desk.renewLabel', { title: loan.titleTitle })}
                >
                  {t('desk.renew')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {renew.isError && <Alert tone="danger">{errorMessage(renew.error)}</Alert>}
      {history.length > 0 && (
        <details className="rounded-xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer font-medium">
            {t('readers.loans.history', { count: history.length })}
          </summary>
          <p className="mt-2 text-sm text-muted">{t('readers.loans.privacy')}</p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {history.map((loan) => (
              <li key={loan.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{loan.titleTitle}</span>
                <span className="text-muted">
                  {formatTimestampDate(loan.loanedAt, i18n.language)} –{' '}
                  {loan.returnedAt && formatTimestampDate(loan.returnedAt, i18n.language)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
