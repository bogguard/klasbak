import type { ImportRowResult, Loan, Reader, ReaderInput } from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

export const readersKey = ['readers'];
export const readerKey = (id: string) => ['reader', id];

export function useReaders() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: readersKey,
    queryFn: () => api<Reader[]>('/api/readers'),
    retry: shouldRetry,
  });
}

export function useReader(id: string) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: readerKey(id),
    queryFn: () => api<{ reader: Reader; loans: Loan[] }>(`/api/readers/${encodeURIComponent(id)}`),
    retry: shouldRetry,
    enabled: id !== '',
  });
}

export function useCreateReader() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReaderInput) =>
      api<Reader>('/api/readers', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readersKey }),
  });
}

export function useUpdateReader(id: string) {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reader: Omit<ReaderInput, 'memberNumber'>; version: number }) =>
      api<Reader>(`/api/readers/${id}`, { method: 'PUT', body: input }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: readersKey }),
        queryClient.invalidateQueries({ queryKey: readerKey(id) }),
      ]),
  });
}

export function useImportReaders() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: ReaderInput[]) =>
      api<ImportRowResult[]>('/api/readers/import', { method: 'POST', body: { rows } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: readersKey }),
  });
}

/** New school year: pupils missing from the imported list are set inactive. */
export function useDeactivateReaders() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readerIds: string[]) =>
      api<{ deactivated: number }>('/api/readers/deactivate', {
        method: 'POST',
        body: { readerIds },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: readersKey }),
  });
}

export function useDeleteReader(id: string) {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<undefined>(`/api/readers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: readerKey(id) });
      return queryClient.invalidateQueries({ queryKey: readersKey });
    },
  });
}
