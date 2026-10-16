import { Library, LogIn, LogOut, Settings } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, useIsStaff } from '../lib/auth';
import { useConfig } from '../lib/config';
import { changeLanguage } from '../lib/i18n';

const navItem =
  'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface-sunken hover:text-ink';

export function Layout() {
  const { t, i18n } = useTranslation();
  const { libraryName, logoKey } = useConfig();
  const { session, signOut } = useAuth();
  const staff = useIsStaff();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = libraryName;
  }, [libraryName]);

  // The school's logo as the browser tab icon, so the site feels like theirs.
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) return;
    icon.href = logoKey ? `/${logoKey}` : '/favicon.svg';
    icon.type = logoKey ? '' : 'image/svg+xml';
  }, [logoKey]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only print:hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('app.skipToContent')}
      </a>

      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            {logoKey ? (
              // The name is right next to it, so the logo itself is decorative.
              <img src={`/${logoKey}`} alt="" className="h-9 w-auto max-w-28 object-contain" />
            ) : (
              <Library className="size-6 shrink-0 text-accent" aria-hidden="true" />
            )}
            <span className="truncate font-display text-xl">{libraryName}</span>
          </Link>
          <nav aria-label={t('app.navigation')} className="flex items-center gap-1">
            {staff && (
              <NavLink
                to="/manage"
                className={({ isActive }) => `${navItem} ${isActive ? 'text-ink' : ''}`}
              >
                <Settings className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('app.manage')}</span>
              </NavLink>
            )}
            {session ? (
              <button
                type="button"
                className={navItem}
                onClick={() => void signOut().then(() => navigate('/'))}
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('app.signOut')}</span>
              </button>
            ) : (
              session === null && (
                <Link to="/login" className={navItem}>
                  <LogIn className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('app.signIn')}</span>
                </Link>
              )
            )}
            <button
              type="button"
              onClick={() => void changeLanguage(i18n.language === 'en' ? 'nl-BE' : 'en')}
              className={navItem}
              aria-label={t('app.switchLanguage')}
            >
              {t('app.switchLanguageShort')}
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted">
          <span>{libraryName}</span>
          <Link to="/privacy" className="hover:text-ink hover:underline">
            {t('app.privacy')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
