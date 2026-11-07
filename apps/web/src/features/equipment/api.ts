import type {
  Asset,
  AssetDetail,
  AssetInput,
  AssetRecipient,
  CreateAssetResult,
  CreateAssetsRequest,
} from '@klasbak/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

const assetsKey = ['assets'];
const assetKey = (id: string) => ['asset', id];

export function useAssets() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: assetsKey,
    queryFn: () => api<Asset[]>('/api/equipment/assets'),
    retry: shouldRetry,
  });
}

export function useAsset(id: string) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: assetKey(id),
    queryFn: () => api<AssetDetail>(`/api/equipment/assets/${encodeURIComponent(id)}`),
    retry: shouldRetry,
  });
}

/** Only fetched once someone is about to hand something out. */
export function useRecipients(enabled: boolean) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: ['asset-recipients'],
    queryFn: () => api<AssetRecipient[]>('/api/equipment/recipients'),
    retry: shouldRetry,
    enabled,
  });
}

export function useCreateAssets() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssetsRequest) =>
      api<CreateAssetResult[]>('/api/equipment/assets', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetsKey }),
  });
}

/** Everything that changes an item also shows in the stock list and on the reader's page. */
function useRefreshAsset(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [assetsKey, assetKey(id), ['reader']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useUpdateAsset(id: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshAsset(id);
  return useMutation({
    mutationFn: (body: { asset: AssetInput; version: number }) =>
      api<Asset>(`/api/equipment/assets/${id}`, { method: 'PUT', body }),
    onSuccess: refresh,
  });
}

export function useAssignAsset(id: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshAsset(id);
  return useMutation({
    mutationFn: (body: { readerId: string; dueDate?: string }) =>
      api<Asset>(`/api/equipment/assets/${id}/assign`, { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useReturnAsset(id: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshAsset(id);
  return useMutation({
    mutationFn: (status: 'available' | 'repair' | 'lost') =>
      api<Asset>(`/api/equipment/assets/${id}/return`, { method: 'POST', body: { status } }),
    onSuccess: refresh,
  });
}

export function useMarkAssetLabelsPrinted() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<undefined>('/api/equipment/assets/labels/printed', { method: 'POST', body: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetsKey }),
  });
}
