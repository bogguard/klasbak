import type { CopyStatus, PublicTitle } from '@library/shared';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { apiGet, shouldRetry } from '../../lib/api';
import { TitleCover } from './TitleCover';

const STATUS_TONES: Record<CopyStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  onLoan: 'warning',
  lost: 'danger',
  damaged: 'danger',
  withdrawn: 'neutral',
};

export function TitlePage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['public-title', id],
    queryFn: () => apiGet<PublicTitle>(`/api/catalog/public/titles/${encodeURIComponent(id)}`),
    retry: shouldRetry,
  });

  return (
    <div className="space-y-6">
      <BackLink />
      {query.isPending ? (
        <TitleSkeleton />
      ) : query.isError ? (
        <TitleError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <TitleDetails title={query.data} />
      )}
    </div>
  );
}

function TitleDetails({ title }: { title: PublicTitle }) {
  const { t, i18n } = useTranslation();
  const languageName = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(
    title.language,
  );
  // Some sources add machine tags like "series:Harry_Potter"; they mean nothing to readers.
  const subjects = title.subjects.filter((subject) => !subject.includes(':'));

  return (
    <article className="grid gap-8 md:grid-cols-[14rem_1fr]">
      <TitleCover
        coverImageKey={title.coverImageKey}
        type={title.type}
        title={title.title}
        authors={title.authors.join(', ')}
        className="w-36 sm:w-48 md:w-full md:max-w-60"
      />

      <div className="space-y-6">
        <header className="space-y-2">
          {title.type !== 'book' && <Badge>{t(`types.${title.type}`)}</Badge>}
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title.title}</h1>
          {title.subtitle && <p className="text-xl text-muted">{title.subtitle}</p>}
          {title.authors.length > 0 && (
            <p className="text-lg">{t('title.by', { authors: title.authors.join(', ') })}</p>
          )}
        </header>

        <Availability copies={title.copies} />

        {title.summary && (
          <p className="max-w-prose whitespace-pre-line leading-relaxed">{title.summary}</p>
        )}

        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="mb-2 font-semibold">
            {t('title.details')}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Detail label={t('title.publisher')} value={title.publisher} />
            <Detail label={t('title.year')} value={title.publishedYear} />
            <Detail label={t('title.language')} value={languageName} />
            <Detail label={t('title.aviLevel')} value={title.aviLevel} />
            <Detail label={t('title.zizoLevel')} value={title.zizoLevel} />
            <Detail label={t('title.age')} value={ageLabel(title, t)} />
            <Detail label={t('title.isbn')} value={title.isbn} />
          </dl>
        </section>

        {subjects.length > 0 && (
          <section aria-labelledby="subjects-heading">
            <h2 id="subjects-heading" className="mb-2 font-semibold">
              {t('title.subjects')}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {subjects.map((subject) => (
                <li key={subject}>
                  <Link
                    to={`/?q=${encodeURIComponent(subject)}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-sm hover:border-accent hover:text-accent"
                  >
                    {subject}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

function Availability({ copies }: { copies: PublicTitle['copies'] }) {
  const { t } = useTranslation();
  if (copies.length === 0) return <p className="text-muted">{t('title.noCopies')}</p>;

  const available = copies.filter((copy) => copy.status === 'available').length;
  return (
    <section
      aria-labelledby="copies-heading"
      className="rounded-xl border border-line bg-surface p-4"
    >
      <h2 id="copies-heading" className="sr-only">
        {t('title.copies')}
      </h2>
      <p className={`font-semibold ${available > 0 ? 'text-success' : 'text-warning'}`}>
        {available > 0
          ? t('title.availableCount', { available, total: copies.length })
          : t('title.noneAvailable')}
      </p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {copies.map((copy, i) => (
          <li key={copy.id} className="flex items-center justify-between gap-4 py-2">
            <span>{copy.location ?? t('title.copyLabel', { number: i + 1 })}</span>
            <Badge tone={STATUS_TONES[copy.status]}>{t(`copyStatus.${copy.status}`)}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function ageLabel(title: PublicTitle, t: TFunction) {
  const { ageMin: min, ageMax: max } = title;
  if (min !== undefined && max !== undefined) return t('title.ageRange', { min, max });
  if (min !== undefined) return t('title.ageFrom', { min });
  if (max !== undefined) return t('title.ageUntil', { max });
  return undefined;
}

function BackLink() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Going back keeps the visitor's search and scroll position; a fresh tab falls back to home.
  return (
    <Link
      to="/"
      onClick={(e) => {
        if (window.history.state?.idx > 0) {
          e.preventDefault();
          void navigate(-1);
        }
      }}
      className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('title.back')}
    </Link>
  );
}

function TitleError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const message = useErrorMessage()(error);
  return (
    <StatusMessage
      icon={<TriangleAlert className="size-6" />}
      title={message}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {t('errors.retry')}
        </Button>
      }
    />
  );
}

function TitleSkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
      <Skeleton className="aspect-[2/3] w-full max-w-60" />
      <div className="space-y-4">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
