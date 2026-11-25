import { localDate, schoolYearEnd, type PhotoDay } from '@klasbak/shared';
import { Camera, Plus, TriangleAlert } from 'lucide-react';
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
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useIsAdmin } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { useCreatePhotoDay, usePhotoDays } from './api';

export function PhotoDayStatus({ day }: { day: PhotoDay }) {
  const { t, i18n } = useTranslation();
  const today = localDate();
  if (day.open && day.availableUntil && today <= day.availableUntil) {
    return (
      <Badge tone="success">
        {t('photos.status.open', { date: formatDate(day.availableUntil, i18n.language) })}
      </Badge>
    );
  }
  return <Badge>{day.availableUntil ? t('photos.status.closed') : t('photos.status.draft')}</Badge>;
}

/** Photo days, newest first; an administrator adds a new one here. */
export function PhotoDaysPage() {
  const { t, i18n } = useTranslation();
  const days = usePhotoDays();
  const isAdmin = useIsAdmin();
  const errorMessage = useErrorMessage();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('photos.heading')}</h1>
        {isAdmin && !adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('photos.new.button')}
          </Button>
        )}
      </div>
      <p className="max-w-prose text-muted">{t('photos.intro')}</p>

      {adding && <NewPhotoDayForm onCancel={() => setAdding(false)} />}

      {days.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : days.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(days.error)}
          action={<Button onClick={() => void days.refetch()}>{t('errors.retry')}</Button>}
        />
      ) : days.data.length === 0 ? (
        <StatusMessage icon={<Camera className="size-6" />} title={t('photos.empty.title')}>
          {isAdmin ? t('photos.empty.hintAdmin') : t('photos.empty.hint')}
        </StatusMessage>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {days.data.map((day) => (
            <li key={day.id}>
              <Link
                to={`/manage/photos/${day.id}`}
                className="block rounded-xl border border-line bg-surface p-4 hover:bg-surface-sunken"
              >
                <span className="block text-lg font-medium">{day.name}</span>
                <span className="mt-1 block text-muted">
                  {formatDate(day.takenOn, i18n.language)}
                </span>
                <span className="mt-3 block">
                  <PhotoDayStatus day={day} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewPhotoDayForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const create = useCreatePhotoDay();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const today = localDate();
  // "Schoolfoto’s 2026–2027": the school year tells photo days apart at a glance.
  const [name, setName] = useState(() => {
    const end = Number(schoolYearEnd(today).slice(0, 4));
    return t('photos.new.defaultName', { years: `${end - 1}–${end}` });
  });
  const [takenOn, setTakenOn] = useState(today);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !takenOn) return;
    try {
      const day = await create.mutateAsync({ name: name.trim(), takenOn });
      void navigate(`/manage/photos/${day.id}`);
    } catch {
      // Shown below.
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="max-w-xl space-y-4 rounded-xl border border-line bg-surface p-4"
    >
      <h2 className="text-xl font-semibold">{t('photos.new.heading')}</h2>
      <Field label={t('photos.fields.name')} required>
        {(props) => (
          <input
            {...props}
            className={`${props.className} ${inputHeight}`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label={t('photos.fields.takenOn')} hint={t('photos.fields.takenOnHint')} required>
        {(props) => (
          <input
            {...props}
            type="date"
            className={`${props.className} ${inputHeight}`}
            value={takenOn}
            onChange={(e) => setTakenOn(e.target.value)}
          />
        )}
      </Field>
      {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={create.isPending}>
          {t('photos.new.create')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('photos.cancel')}
        </Button>
      </div>
    </form>
  );
}
