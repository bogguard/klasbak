import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './app/Layout';
import { LibraryWords } from './app/LibraryWords';
import { NotFoundPage } from './app/NotFoundPage';
import { PrivacyPage } from './app/PrivacyPage';
import { RequireStaff } from './app/RequireStaff';
import { SearchPage } from './features/catalog/SearchPage';
import { TitlePage } from './features/catalog/TitlePage';
import { AuthProvider } from './lib/auth';
import './lib/i18n';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

// Sign-in and management are loaded on demand: most visitors only use the public catalogue.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'titles/:id', element: <TitlePage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      {
        path: 'login',
        lazy: async () => ({ Component: (await import('./features/auth/LoginPage')).LoginPage }),
      },
      {
        path: 'manage',
        element: <RequireStaff />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('./features/manage/ManageHomePage')).ManageHomePage,
            }),
          },
          {
            path: 'titles/new',
            lazy: async () => ({
              Component: (await import('./features/manage/NewTitlePage')).NewTitlePage,
            }),
          },
          {
            path: 'titles/:id',
            lazy: async () => ({
              Component: (await import('./features/manage/EditTitlePage')).EditTitlePage,
            }),
          },
          {
            path: 'desk',
            lazy: async () => ({
              Component: (await import('./features/circulation/DeskPage')).DeskPage,
            }),
          },
          {
            path: 'loans',
            lazy: async () => ({
              Component: (await import('./features/circulation/LoansPage')).LoansPage,
            }),
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('./features/circulation/SettingsPage')).SettingsPage,
            }),
          },
          {
            path: 'readers',
            lazy: async () => ({
              Component: (await import('./features/readers/ReadersPage')).ReadersPage,
            }),
          },
          {
            path: 'readers/new',
            lazy: async () => ({
              Component: (await import('./features/readers/ReaderPage')).ReaderPage,
            }),
          },
          {
            path: 'readers/import',
            lazy: async () => ({
              Component: (await import('./features/readers/ImportReadersPage')).ImportReadersPage,
            }),
          },
          {
            path: 'staff',
            lazy: async () => ({
              Component: (await import('./features/staff/StaffPage')).StaffPage,
            }),
          },
          {
            path: 'labels',
            lazy: async () => ({
              Component: (await import('./features/labels/LabelsPage')).LabelsPage,
            }),
          },
          {
            path: 'exchanges',
            lazy: async () => ({
              Component: (await import('./features/exchange/ExchangesPage')).ExchangesPage,
            }),
          },
          {
            path: 'exchanges/:id',
            lazy: async () => ({
              Component: (await import('./features/exchange/ExchangePage')).ExchangePage,
            }),
          },
          {
            path: 'statistics',
            lazy: async () => ({
              Component: (await import('./features/statistics/StatisticsPage')).StatisticsPage,
            }),
          },
          {
            path: 'readers/:id',
            lazy: async () => ({
              Component: (await import('./features/readers/ReaderPage')).ReaderPage,
            }),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // "Mijn boeken": full screen on a library device, without the site's menus.
  {
    path: 'kiosk',
    element: <RequireStaff nav={false} />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('./features/circulation/MyBooksPage')).MyBooksPage,
        }),
      },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LibraryWords />
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
