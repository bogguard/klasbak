import { ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton, StatusMessage } from '../components/ui/Feedback';
import { useAuth, useIsStaff } from '../lib/auth';
import { MfaSetup } from '../features/auth/MfaSetup';
import { ManageNav } from './ManageNav';

/**
 * Guards the management pages in the browser for a friendly experience.
 * The real protection is the API, which checks the role on every request.
 * Without `nav` (the kiosk), the management menu stays hidden.
 */
export function RequireStaff({ nav = true }: { nav?: boolean }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const staff = useIsStaff();
  const location = useLocation();

  if (session === undefined) return <Skeleton className="h-40 w-full" />;
  if (session === null) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!staff) {
    return (
      <StatusMessage icon={<ShieldX className="size-6" />} title={t('auth.forbidden.title')}>
        {t('auth.forbidden.body')}
      </StatusMessage>
    );
  }
  // The API refuses staff without two-step verification, so set it up first.
  if (!session.mfaEnabled) return <MfaSetup />;
  return (
    <>
      {nav && <ManageNav />}
      <Outlet />
    </>
  );
}
