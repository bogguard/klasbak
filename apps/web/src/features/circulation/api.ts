import type {
  Branding,
  LibraryKind,
  LibraryTerms,
  LibrarySettings,
  LibrarySettingsInput,
  Loan,
  LoanStatistics,
  MyBooks,
  ReaderAtDesk,
  ScanResult,
} from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';
import { configKey } from '../../lib/config';

export function useScan() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; readerId?: string }) =>
      api<ScanResult>('/api/circulation/scan', { method: 'POST', body: input }),
    // Loans change copy statuses, reader counts and lists everywhere: refresh what's cached.
    onSuccess: () =>
      Promise.all(
        [['loans'], ['readers'], ['reader'], ['staff-title'], ['public-title']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useRenew() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { readerId: string; loanId: string }) =>
      api<{ loan: Loan } & ReaderAtDesk>('/api/circulation/renew', { method: 'POST', body: input }),
    onSuccess: () =>
      Promise.all(
        [['loans'], ['reader'], ['staff-title']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useLoans(overdue: boolean) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: ['loans', { overdue }],
    queryFn: () => api<Loan[]>(`/api/circulation/loans${overdue ? '?overdue=true' : ''}`),
    retry: shouldRetry,
  });
}

/** Read-only lookup for the "Mijn boeken" screen: lends or returns nothing. */
export function useMyBooks() {
  const api = useAuthorizedApi();
  return useMutation({
    mutationFn: (code: string) =>
      api<MyBooks>('/api/circulation/my-books', { method: 'POST', body: { code } }),
  });
}

export function useStatistics(range: { from: string; to: string }) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: ['statistics', range],
    queryFn: () =>
      api<LoanStatistics>(`/api/circulation/statistics?from=${range.from}&to=${range.to}`),
    retry: shouldRetry,
  });
}

export function useSettings() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api<LibrarySettings>('/api/circulation/settings'),
    retry: shouldRetry,
  });
}

export function useUpdateSettings() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { settings: LibrarySettingsInput; version: number }) =>
      api<LibrarySettings>('/api/circulation/settings', { method: 'PUT', body: input }),
    onSuccess: (settings) => queryClient.setQueryData(['settings'], settings),
  });
}

/** Name and logo; afterwards the configuration is reloaded so the header updates at once. */
export function useBranding() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: configKey });
  return {
    rename: useMutation({
      mutationFn: (libraryName: string) =>
        api<Branding>('/api/circulation/branding', { method: 'PUT', body: { libraryName } }),
      onSuccess: refresh,
    }),
    uploadLogo: useMutation({
      mutationFn: (image: string) =>
        api<Branding>('/api/circulation/branding/logo', { method: 'PUT', body: { image } }),
      onSuccess: refresh,
    }),
    removeLogo: useMutation({
      mutationFn: () => api<Branding>('/api/circulation/branding/logo', { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    saveVocabulary: useMutation({
      mutationFn: (input: { kind: LibraryKind; terms: LibraryTerms }) =>
        api<Branding>('/api/circulation/branding/vocabulary', { method: 'PUT', body: input }),
      onSuccess: refresh,
    }),
  };
}
