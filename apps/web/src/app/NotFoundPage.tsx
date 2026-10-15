import { MapPinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StatusMessage } from '../components/ui/Feedback';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <StatusMessage
      icon={<MapPinOff className="size-6" />}
      title={t('notFound.title')}
      action={
        <Link to="/" className="font-medium text-accent underline underline-offset-4">
          {t('notFound.home')}
        </Link>
      }
    />
  );
}
