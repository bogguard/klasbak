import { ArrowLeft, ExternalLink, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { Button, Skeleton, StatusMessage, useErrorMessage } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useExchanges } from '../exchange/api';
import { useStaffTitle, useUpdateTitle } from './api';
import { CopiesPanel } from './CopiesPanel';
import { CoverEditor } from './CoverEditor';
import { TitleForm } from './TitleForm';
import { toFormValues } from './titleFormValues';

type Flash = { flash?: 'created'; copiesCreated?: number; copiesRequested?: number };

export function EditTitlePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const title = useStaffTitle(id);
  const update = useUpdateTitle(id);
  const errorMessage = useErrorMessage();
  const flash = (useLocation().state ?? {}) as Flash;
  const [saved, setSaved] = useState(false);

  if (title.isPending) return <Skeleton className="h-96 w-full" />;
  if (title.isError) {
    return (
      <StatusMessage
        icon={<TriangleAlert className="size-6" />}
        title={errorMessage(title.error)}
        action={
          <Link to="/manage" className="font-medium text-accent underline underline-offset-4">
            {t('manage.backToList')}
          </Link>
        }
      />
    );
  }

  const conflict = update.error instanceof ApiError && update.error.code === 'VERSION_CONFLICT';
  const missingCopies =
    flash.flash === 'created' &&
    flash.copiesRequested !== undefined &&
    (flash.copiesCreated ?? 0) < flash.copiesRequested;

  return (
    <div className="space-y-8">
      <Link
        to="/manage"
        className="inline-flex min-h-11 items-center gap-2 text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('manage.backToList')}
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <CoverEditor title={title.data} />
        <div className="flex-1 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{title.data.title}</h1>
          <Link
            to={`/titles/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-accent underline underline-offset-4"
          >
            {t('manage.edit.viewPublic')}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <ExchangeNotice
        titleExchangeId={title.data.exchangeId}
        exchangeIds={title.data.copies.flatMap((c) => (c.exchangeId ? [c.exchangeId] : []))}
        ownCopies={title.data.copies.filter((c) => !c.exchangeId).length}
      />

      {flash.flash === 'created' && !missingCopies && (
        <Alert
          tone="success"
          action={
            title.data.copies.length > 0 && (
              <Link
                // The new copies are in the print queue, together with any others still waiting.
                to="/manage/labels"
                className="font-medium underline underline-offset-4"
              >
                {t('labels.printForCopies')}
              </Link>
            )
          }
        >
          {t('manage.edit.created', { count: flash.copiesCreated ?? 0 })}
        </Alert>
      )}
      {missingCopies && (
        <Alert tone="danger">
          {t('manage.edit.copiesMissing', {
            created: flash.copiesCreated ?? 0,
            requested: flash.copiesRequested,
          })}
        </Alert>
      )}

      <CopiesPanel titleId={id} copies={title.data.copies} />

      <section aria-labelledby="details-heading" className="space-y-4">
        <h2 id="details-heading" className="text-xl font-semibold">
          {t('manage.edit.details')}
        </h2>
        <TitleForm
          // A new version (after saving or reloading) resets the form to the stored values.
          key={title.data.version}
          initialValues={toFormValues(title.data)}
          submitLabel={t('manage.edit.save')}
          onSubmit={async (input) => {
            setSaved(false);
            await update.mutateAsync({ title: input, version: title.data.version });
            setSaved(true);
          }}
          footer={
            <>
              {saved && !update.isError && <Alert tone="success">{t('manage.edit.saved')}</Alert>}
              {conflict ? (
                <Alert
                  tone="danger"
                  action={
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => {
                        update.reset();
                        void title.refetch();
                      }}
                    >
                      {t('manage.edit.reload')}
                    </Button>
                  }
                >
                  {t('errors.VERSION_CONFLICT')}
                </Alert>
              ) : (
                update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>
              )}
            </>
          }
        />
      </section>
    </div>
  );
}

/**
 * A title (or some of its copies) from a public library's exchange collection: say so, and
 * what happens when the collection goes back, so nobody is surprised when it disappears.
 */
function ExchangeNotice({
  titleExchangeId,
  exchangeIds,
  ownCopies,
}: {
  titleExchangeId?: string;
  exchangeIds: string[];
  ownCopies: number;
}) {
  const { t, i18n } = useTranslation();
  const exchanges = useExchanges();
  const id = exchangeIds[0] ?? titleExchangeId;
  if (!id) return null;
  const exchange = exchanges.data?.find((e) => e.id === id);
  const name = exchange ? `${exchange.lender} · ${exchange.name}` : t('exchange.copy.label');
  const date = exchange ? formatDate(exchange.returnBy, i18n.language) : '';
  const goesWithIt = titleExchangeId === id && ownCopies === 0;
  return (
    <Alert tone="info">
      {t(goesWithIt ? 'exchange.copy.titleNotice' : 'exchange.copy.copyNotice', {
        name,
        date,
        count: exchangeIds.length,
      })}{' '}
      <Link to={`/manage/exchanges/${id}`} className="font-medium underline underline-offset-2">
        {t('exchange.copy.open')}
      </Link>
    </Alert>
  );
}
