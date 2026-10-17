import type {
  AddExchangeBookResult,
  CreateExchangeRequest,
  ExchangeBook,
  ExchangeCollection,
  ExchangeDetail,
  ExchangeSummary,
} from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

const listKey = ['exchanges'];
const detailKey = (id: string) => ['exchange', id];

export function useExchanges() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: listKey,
    queryFn: () => api<ExchangeSummary[]>('/api/catalog/exchanges'),
    retry: shouldRetry,
  });
}

export function useExchange(id: string) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<ExchangeDetail>(`/api/catalog/exchanges/${id}`),
    retry: shouldRetry,
  });
}

export function useCreateExchange() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExchangeRequest) =>
      api<ExchangeCollection>('/api/catalog/exchanges', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });
}

/** Adding or returning books changes the collection, the list, and the catalogue. */
function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [detailKey(id), listKey, ['search-index'], ['staff-title'], ['public-title']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useAddExchangeBooks(id: string) {
  const api = useAuthorizedApi();
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (books: ExchangeBook[]) =>
      api<AddExchangeBookResult[]>(`/api/catalog/exchanges/${id}/books`, {
        method: 'POST',
        body: { books },
      }),
    onSettled: refresh,
  });
}

export function useReturnExchange(id: string) {
  const api = useAuthorizedApi();
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: () =>
      api<ExchangeCollection>(`/api/catalog/exchanges/${id}/return`, { method: 'POST' }),
    onSettled: refresh,
  });
}
