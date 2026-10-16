import { ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusMessage } from '../components/ui/Feedback';
import { useIsAdmin } from '../lib/auth';

/** Pages for administrators only. The API enforces the same rule; this keeps the screen honest. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  if (useIsAdmin()) return children;
  return (
    <StatusMessage icon={<ShieldX className="size-6" />} title={t('auth.forbidden.title')}>
      {t('auth.adminOnly')}
    </StatusMessage>
  );
}
