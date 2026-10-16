import type { CopyLabel } from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

const pendingKey = ['labels', 'pending'];

/** Copies whose barcode label still has to be printed. */
export function usePendingLabels() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: pendingKey,
    queryFn: () => api<CopyLabel[]>('/api/catalog/labels/pending'),
    retry: shouldRetry,
  });
}

export function useMarkLabelsPrinted() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (codes: string[]) =>
      api<{ marked: number }>('/api/catalog/labels/printed', { method: 'POST', body: { codes } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: pendingKey }),
        queryClient.invalidateQueries({ queryKey: ['staff-title'] }),
      ]),
  });
}
