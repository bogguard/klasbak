import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SearchPage } from '../catalog/SearchPage';

/** The staff starting point: find a title to manage, or add a new one. */
export function ManageHomePage() {
  const { t } = useTranslation();
  return (
    <SearchPage
      heading={t('manage.heading')}
      titleLink={(id) => `/manage/titles/${id}`}
      headerAction={
        <Link
          to="/manage/titles/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-ink hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('manage.newTitle')}
        </Link>
      }
    />
  );
}
