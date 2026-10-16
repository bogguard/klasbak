import type {
  CreateStaffRequest,
  StaffMember,
  StaffRole,
  TemporaryCredentials,
} from '@library/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../../lib/api';
import { useAuthorizedApi } from '../../lib/auth';

const staffKey = ['staff'];

export function useStaff() {
  const api = useAuthorizedApi();
  return useQuery({
    queryKey: staffKey,
    queryFn: () => api<StaffMember[]>('/api/staff'),
    retry: shouldRetry,
  });
}

function useStaffMutation<Input, Output>(request: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKey }),
  });
}

export function useCreateStaff() {
  const api = useAuthorizedApi();
  return useStaffMutation((input: CreateStaffRequest) =>
    api<{ member: StaffMember; credentials: TemporaryCredentials }>('/api/staff', {
      method: 'POST',
      body: input,
    }),
  );
}

export function useUpdateStaff() {
  const api = useAuthorizedApi();
  return useStaffMutation(
    ({ username, ...changes }: { username: string; role?: StaffRole; enabled?: boolean }) =>
      api<StaffMember>(`/api/staff/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: changes,
      }),
  );
}

export function useResetPassword() {
  const api = useAuthorizedApi();
  return useStaffMutation((username: string) =>
    api<TemporaryCredentials>(`/api/staff/${encodeURIComponent(username)}/password`, {
      method: 'POST',
    }),
  );
}

export function useResetMfa() {
  const api = useAuthorizedApi();
  return useStaffMutation((username: string) =>
    api<undefined>(`/api/staff/${encodeURIComponent(username)}/mfa-reset`, { method: 'POST' }),
  );
}
