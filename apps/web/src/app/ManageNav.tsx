import { BookCopy, ClipboardList, ScanBarcode, Settings2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

const items = [
  { to: '/manage/desk', key: 'desk', icon: ScanBarcode },
  { to: '/manage/loans', key: 'loans', icon: ClipboardList },
  { to: '/manage', key: 'collection', icon: BookCopy, end: true },
  { to: '/manage/readers', key: 'readers', icon: Users },
  { to: '/manage/settings', key: 'settings', icon: Settings2 },
] as const;

/** Sections of the management area. Scrolls sideways on narrow screens instead of wrapping. */
export function ManageNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('manageNav.label')} className="-mx-4 mb-8 overflow-x-auto px-4 print:hidden">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map(({ to, key, icon: Icon, ...rest }) => (
          <li key={key}>
            <NavLink
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                `-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
                  isActive
                    ? 'border-accent text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`manageNav.${key}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
