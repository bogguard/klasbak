import type {
  Photo,
  PhotoAccess,
  PhotoCode,
  PhotoDay,
  PhotoDayDetail,
  PhotoDayInput,
  PhotoImages,
  PhotoPupil,
  PhotoTarget,
  UpdatePhotoDayRequest,
} from '@klasbak/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

const daysKey = ['photo-days'];
const dayKey = (id: string) => ['photo-day', id];

export function usePhotoDays() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: daysKey,
    queryFn: () => api<PhotoDay[]>('/api/photos/days'),
    retry: shouldRetry,
  });
}

export function usePhotoDay(id: string) {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: dayKey(id),
    queryFn: () => api<PhotoDayDetail>(`/api/photos/days/${encodeURIComponent(id)}`),
    retry: shouldRetry,
  });
}

/** The class lists; a class list changes rarely during a photo day. */
export function usePhotoPupils() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: ['photo-pupils'],
    queryFn: () => api<PhotoPupil[]>('/api/photos/pupils'),
    retry: shouldRetry,
    staleTime: 5 * 60_000,
  });
}

/** Links to the screen versions work for an hour; refreshed well before that. */
export function usePhotoImages(dayId: string, photoIds: string[]) {
  const api = useAuthorizedApi();
  const ids = [...photoIds].sort();
  return useQuery({
    queryKey: ['photo-images', dayId, ids],
    queryFn: () =>
      api<PhotoImages>(`/api/photos/days/${dayId}/images`, {
        method: 'POST',
        body: { photoIds: ids },
      }),
    enabled: ids.length > 0,
    retry: shouldRetry,
    staleTime: 30 * 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useCreatePhotoDay() {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PhotoDayInput) =>
      api<PhotoDay>('/api/photos/days', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: daysKey }),
  });
}

function useRefreshDay(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dayKey(id) }),
      queryClient.invalidateQueries({ queryKey: daysKey }),
    ]);
}

export function useUpdatePhotoDay(id: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshDay(id);
  return useMutation({
    mutationFn: (body: UpdatePhotoDayRequest) =>
      api<PhotoDay>(`/api/photos/days/${id}`, { method: 'PUT', body }),
    onSuccess: refresh,
  });
}

export function useDeletePhotoDay(id: string) {
  const api = useAuthorizedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<undefined>(`/api/photos/days/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: daysKey }),
  });
}

export function useMovePhoto(dayId: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshDay(dayId);
  return useMutation({
    mutationFn: ({ photoId, target }: { photoId: string; target: PhotoTarget }) =>
      api<Photo>(`/api/photos/days/${dayId}/photos/${photoId}`, {
        method: 'PUT',
        body: { target },
      }),
    onSuccess: refresh,
  });
}

export function useDeletePhoto(dayId: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshDay(dayId);
  return useMutation({
    mutationFn: (photoId: string) =>
      api<undefined>(`/api/photos/days/${dayId}/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useSetNoPhoto(dayId: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshDay(dayId);
  return useMutation({
    mutationFn: ({ readerId, noPhoto }: { readerId: string; noPhoto: boolean }) =>
      api<undefined>(`/api/photos/days/${dayId}/pupils/${readerId}`, {
        method: 'PUT',
        body: { noPhoto },
      }),
    onSuccess: refresh,
  });
}

/** Makes the missing codes and returns all of them (the same ones when printed again). */
export function useEnsureCodes(dayId: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshDay(dayId);
  return useMutation({
    mutationFn: () => api<PhotoCode[]>(`/api/photos/days/${dayId}/codes`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

export function useRenewCode(dayId: string) {
  const api = useAuthorizedApi();
  const refresh = useRefreshDay(dayId);
  return useMutation({
    mutationFn: (readerId: string) =>
      api<PhotoCode>(`/api/photos/days/${dayId}/pupils/${readerId}/code`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

/** Parents: no sign-in, the code is the permission. */
export function useAccessPhotos() {
  return useMutation({
    mutationFn: (code: string) =>
      apiRequest<PhotoAccess>('/api/photos/public/access', { method: 'POST', body: { code } }),
  });
}
