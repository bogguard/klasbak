import {
  EQUIPMENT_ROLES,
  PHOTO_ROLES,
  STAFF_ROLES,
  type LibrarySettings,
  type Role,
} from '@klasbak/shared';
import {
  ArrowLeftRight,
  BarChart3,
  BookCopy,
  Camera,
  ClipboardList,
  Laptop,
  Library,
  ScanBarcode,
  School,
  Settings2,
  Tags,
  UserCog,
  Users,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router';
import { useSettings } from '../features/circulation/api';
import { useAuth } from '../lib/auth';

type Tab = { to: string; key: string; icon: typeof Users; roles: readonly Role[]; end?: boolean };

type Section = {
  key: 'library' | 'equipment' | 'photos' | 'school';
  icon: typeof Users;
  /** Only while the school has this module switched on. */
  module?: keyof LibrarySettings['modules'];
  /** Pages of this section that aren't tabs themselves (a title, an item, an upload). */
  owns: RegExp;
  tabs: Tab[];
};

const ADMIN: readonly Role[] = ['admin'];

/*
 * Two levels: the sections (each module, and the school's own settings) and the tabs of the
 * section you are in. Readers are under School: every module uses the pupils.
 */
const sections: Section[] = [
  {
    key: 'library',
    icon: Library,
    owns: /^\/manage(\/(desk|loans|titles|exchanges|labels|statistics)(\/|$)|\/?$)/,
    tabs: [
      { to: '/manage/desk', key: 'desk', icon: ScanBarcode, roles: STAFF_ROLES },
      { to: '/manage/loans', key: 'loans', icon: ClipboardList, roles: STAFF_ROLES },
      { to: '/manage', key: 'collection', icon: BookCopy, roles: STAFF_ROLES, end: true },
      { to: '/manage/exchanges', key: 'exchanges', icon: ArrowLeftRight, roles: STAFF_ROLES },
      { to: '/manage/labels', key: 'labels', icon: Tags, roles: STAFF_ROLES },
      { to: '/manage/statistics', key: 'statistics', icon: BarChart3, roles: STAFF_ROLES },
    ],
  },
  {
    key: 'equipment',
    icon: Laptop,
    module: 'equipment',
    owns: /^\/manage\/equipment(\/|$)/,
    tabs: [{ to: '/manage/equipment', key: 'equipment', icon: Laptop, roles: EQUIPMENT_ROLES }],
  },
  {
    key: 'photos',
    icon: Camera,
    module: 'photos',
    owns: /^\/manage\/photos(\/|$)/,
    tabs: [{ to: '/manage/photos', key: 'photos', icon: Camera, roles: PHOTO_ROLES }],
  },
  {
    key: 'school',
    icon: School,
    owns: /^\/manage\/(readers|settings|staff)(\/|$)/,
    tabs: [
      { to: '/manage/readers', key: 'readers', icon: Users, roles: STAFF_ROLES },
      { to: '/manage/settings', key: 'settings', icon: Settings2, roles: ADMIN },
      { to: '/manage/staff', key: 'staff', icon: UserCog, roles: ADMIN },
    ],
  },
];

/** The sections this person can use, each with the tabs they may see. */
export function useManageSections() {
  const roles = useAuth().session?.roles ?? [];
  const modules = useSettings().data?.modules;
  return sections
    .filter((section) => !section.module || (modules?.[section.module] ?? false))
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter((tab) => tab.roles.some((role) => roles.includes(role))),
    }))
    .filter((section) => section.tabs.length > 0);
}

const tabClass = (isActive: boolean) =>
  `-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
    isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
  }`;

/**
 * The management menu: which part of Klasbak, then where in it. Someone with one section (the
 * photographer, the ICT coordinator) sees no sections; a section with one page shows no tabs.
 */
export function ManageNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const visible = useManageSections();
  const active = visible.find((section) => section.owns.test(pathname)) ?? visible[0];
  const activeTab = useRef<HTMLAnchorElement>(null);

  // On a phone the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  if (!active) return null;
  const showSections = visible.length > 1;
  const showTabs = active.tabs.length > 1;
  if (!showSections && !showTabs) return null;

  return (
    <nav aria-label={t('manageNav.label')} className="mb-8 space-y-3 print:hidden">
      {showSections && (
        <ul className="flex flex-wrap gap-2">
          {visible.map((section) => {
            const Icon = section.icon;
            const current = section === active;
            return (
              <li key={section.key}>
                <Link
                  to={section.tabs[0]?.to ?? '/manage'}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                    current
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line bg-surface text-ink hover:bg-surface-sunken'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(`manageNav.sections.${section.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {showTabs && (
        <div className="relative -mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1 border-b border-line">
            {active.tabs.map(({ to, key, icon: Icon, end }) => (
              <li key={key}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => tabClass(isActive)}
                  ref={(element) => {
                    if (element?.getAttribute('aria-current') === 'page')
                      activeTab.current = element;
                  }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(`manageNav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
