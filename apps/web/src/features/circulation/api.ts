import type {
  LibrarySettings,
  LibrarySettingsInput,
  Loan,
  ReaderAtDesk,
  ScanResult,
} from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

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
