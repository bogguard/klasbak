import type {
  Copy,
  CopyInput,
  IsbnLookupResult,
  Title,
  TitleInput,
  TitleWithCopies,
} from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

const titleKey = (id: string) => ['staff-title', id];

export function useStaffTitle(id: string) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: titleKey(id),
    queryFn: () => api<TitleWithCopies>(`/api/catalog/titles/${encodeURIComponent(id)}`),
    retry: shouldRetry,
  });
}

/** After a change, the staff view, the public page and the search results must catch up. */
function useInvalidateTitle() {
  const queryClient = useQueryClient();
  return (id: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: titleKey(id) }),
      queryClient.invalidateQueries({ queryKey: ['public-title', id] }),
      queryClient.invalidateQueries({ queryKey: ['search-index'] }),
    ]);
}

export function useCreateTitle() {
  const api = useAuthorizedApi();
  const invalidate = useInvalidateTitle();
  return useMutation({
    mutationFn: async (input: { title: TitleInput; coverUrl?: string; copies: number }) => {
      const title = await api<Title>('/api/catalog/titles', {
        method: 'POST',
        body: { title: input.title, coverUrl: input.coverUrl },
      });
      // The title exists now. A failing copy must not fail the whole action, or a retry
      // would create the title twice; we report how many copies were made instead.
      let copiesCreated = 0;
      try {
        // Sequential, so generated barcodes are consecutive on the labels.
        for (; copiesCreated < input.copies; copiesCreated++) {
          await api<Copy>(`/api/catalog/titles/${title.id}/copies`, { method: 'POST', body: {} });
        }
      } catch {
        // Reported to the librarian on the title page.
      }
      return { title, copiesCreated };
    },
    onSuccess: ({ title }) => invalidate(title.id),
  });
}

export function useUpdateTitle(id: string) {
  const api = useAuthorizedApi();
  const invalidate = useInvalidateTitle();
  return useMutation({
    mutationFn: (input: { title: TitleInput; version: number }) =>
      api<Title>(`/api/catalog/titles/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => invalidate(id),
  });
}

export function useAddCopy(titleId: string) {
  const api = useAuthorizedApi();
  const invalidate = useInvalidateTitle();
  return useMutation({
    mutationFn: (input: CopyInput) =>
      api<Copy>(`/api/catalog/titles/${titleId}/copies`, { method: 'POST', body: input }),
    onSuccess: () => invalidate(titleId),
  });
}

export type CopyChanges = {
  status?: Exclude<Copy['status'], 'onLoan'>;
  location?: string | null;
  note?: string | null;
};

export function useUpdateCopy(titleId: string) {
  const api = useAuthorizedApi();
  const invalidate = useInvalidateTitle();
  return useMutation({
    mutationFn: ({ barcode, changes }: { barcode: string; changes: CopyChanges }) =>
      api<Copy>(`/api/catalog/copies/${encodeURIComponent(barcode)}`, {
        method: 'PATCH',
        body: changes,
      }),
    onSuccess: () => invalidate(titleId),
  });
}

export function useIsbnLookup() {
  const api = useAuthorizedApi();
  return useMutation({
    mutationFn: (isbn: string) =>
      api<IsbnLookupResult>(`/api/catalog/isbn/${encodeURIComponent(isbn)}`),
  });
}
