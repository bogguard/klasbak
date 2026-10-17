import { CreateExchangeRequestSchema, type ExchangeSummary } from '@library/shared';
import { ArrowLeftRight, Plus, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { Alert, Field } from '../../components/ui/Form';
import { formatDate } from '../../lib/format';
import { useCreateExchange, useExchanges } from './api';

/**
 * Exchange collections from the public library (decision 031): what the school has on loan,
 * how much of it is lent out, and when it goes back.
 */
export function ExchangesPage() {
  const { t } = useTranslation();
  const exchanges = useExchanges();
  const errorMessage = useErrorMessage();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('exchange.heading')}</h1>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('exchange.new')}
          </Button>
        )}
      </div>
      <p className="max-w-2xl text-muted">{t('exchange.intro')}</p>

      {creating && <NewExchangeForm onCancel={() => setCreating(false)} />}

      {exchanges.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : exchanges.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(exchanges.error)}
          action={<Button onClick={() => void exchanges.refetch()}>{t('errors.retry')}</Button>}
        />
      ) : exchanges.data.length === 0 ? (
        !creating && (
          <StatusMessage
            icon={<ArrowLeftRight className="size-6" />}
            title={t('exchange.none')}
            action={<Button onClick={() => setCreating(true)}>{t('exchange.new')}</Button>}
          >
            {t('exchange.noneHint')}
          </StatusMessage>
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {exchanges.data.map((exchange) => (
            <li key={exchange.id}>
              <ExchangeCard exchange={exchange} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExchangeCard({ exchange }: { exchange: ExchangeSummary }) {
  const { t, i18n } = useTranslation();
  const returned = exchange.status === 'returned';
  return (
    <Link
      to={`/manage/exchanges/${exchange.id}`}
      className={`block space-y-2 rounded-xl border border-line bg-surface p-4 hover:border-accent ${returned ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">{exchange.name}</p>
          <p className="text-sm text-muted">{exchange.lender}</p>
        </div>
        {returned ? (
          <Badge>{t('exchange.returned')}</Badge>
        ) : (
          <Badge tone="success">{t('exchange.active')}</Badge>
        )}
      </div>
      <p className="text-sm">
        {returned
          ? t('exchange.returnedOn', {
              date: formatDate(exchange.returnedOn ?? exchange.returnBy, i18n.language),
            })
          : t('exchange.returnBy', { date: formatDate(exchange.returnBy, i18n.language) })}
      </p>
      <p className="text-sm text-muted">
        {[
          t('exchange.books', { count: exchange.books }),
          !returned && exchange.onLoan > 0 && t('exchange.onLoan', { count: exchange.onLoan }),
          t('exchange.loans', { count: exchange.loans }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </Link>
  );
}

function NewExchangeForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const create = useCreateExchange();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', lender: '', returnBy: '' });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateExchangeRequestSchema.safeParse({
      name: values.name.trim(),
      lender: values.lender.trim(),
      returnBy: values.returnBy,
    });
    if (!parsed.success) {
      setInvalid(new Set(parsed.error.issues.map((issue) => String(issue.path[0]))));
      return;
    }
    const exchange = await create.mutateAsync(parsed.data);
    // Straight on to adding the books: that's always the next step.
    void navigate(`/manage/exchanges/${exchange.id}`);
  }

  const field = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [name]: e.target.value })),
  });

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3"
      noValidate
    >
      <Field
        label={t('exchange.form.lender')}
        hint={t('exchange.form.lenderHint')}
        error={invalid.has('lender') ? t('exchange.form.required') : undefined}
        required
      >
        {(props) => (
          <input {...props} className={`${props.className} min-h-11`} {...field('lender')} />
        )}
      </Field>
      <Field
        label={t('exchange.form.name')}
        hint={t('exchange.form.nameHint')}
        error={invalid.has('name') ? t('exchange.form.required') : undefined}
        required
      >
        {(props) => (
          <input {...props} className={`${props.className} min-h-11`} {...field('name')} />
        )}
      </Field>
      <Field
        label={t('exchange.form.returnBy')}
        hint={t('exchange.form.returnByHint')}
        error={invalid.has('returnBy') ? t('exchange.form.required') : undefined}
        required
      >
        {(props) => (
          <input
            {...props}
            type="date"
            className={`${props.className} min-h-11`}
            {...field('returnBy')}
          />
        )}
      </Field>
      {create.isError && (
        <div className="sm:col-span-3">
          <Alert tone="danger">{errorMessage(create.error)}</Alert>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" disabled={create.isPending}>
          {t('exchange.form.create')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('exchange.form.cancel')}
        </Button>
      </div>
    </form>
  );
}
