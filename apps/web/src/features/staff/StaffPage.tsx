import {
  CreateStaffRequestSchema,
  STAFF_MEMBER_ROLES,
  type StaffMember,
  type StaffRole,
  type TemporaryCredentials,
} from '@library/shared';
import { Copy, KeyRound, ShieldOff, TriangleAlert, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Skeleton,
  StatusMessage,
  useErrorMessage,
} from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { AdminOnly } from '../../app/AdminOnly';
import { useAuth } from '../../lib/auth';
import { useCreateStaff, useResetMfa, useResetPassword, useStaff, useUpdateStaff } from './api';

/** Admins add and manage the people who run the library. */
export function StaffPage() {
  return (
    <AdminOnly>
      <Staff />
    </AdminOnly>
  );
}

function Staff() {
  const { t } = useTranslation();
  const staff = useStaff();
  const errorMessage = useErrorMessage();
  // Shown once after creating an account or resetting a password.
  const [credentials, setCredentials] = useState<TemporaryCredentials>();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t('staff.heading')}</h1>
        <p className="text-muted">{t('staff.explanation')}</p>
      </div>

      {credentials && (
        <CredentialsPanel credentials={credentials} onDone={() => setCredentials(undefined)} />
      )}

      {staff.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : staff.isError ? (
        <StatusMessage
          icon={<TriangleAlert className="size-6" />}
          title={errorMessage(staff.error)}
          action={<Button onClick={() => void staff.refetch()}>{t('errors.retry')}</Button>}
        />
      ) : (
        <StaffTable members={staff.data} onCredentials={setCredentials} />
      )}

      <NewStaffForm onCreated={setCredentials} />
    </div>
  );
}

function StaffTable({
  members,
  onCredentials,
}: {
  members: StaffMember[];
  onCredentials: (credentials: TemporaryCredentials) => void;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const update = useUpdateStaff();
  const resetPassword = useResetPassword();
  const resetMfa = useResetMfa();
  const errorMessage = useErrorMessage();
  const failed = [update, resetPassword, resetMfa].find((m) => m.isError);

  return (
    <section aria-labelledby="staff-list" className="space-y-3">
      <h2 id="staff-list" className="sr-only">
        {t('staff.heading')}
      </h2>
      <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('staff.name')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('staff.role')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('staff.status')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">{t('manage.copies.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {members.map((member) => {
              const self = member.username === session?.username;
              return (
                <tr key={member.username} className={member.enabled ? undefined : 'text-muted'}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {member.name ?? member.username}
                      {self && <span className="font-normal text-muted"> ({t('staff.you')})</span>}
                    </p>
                    <p className="text-muted">
                      <span className="font-mono">{member.username}</span>
                      {member.email && ` · ${member.email}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={t('staff.roleOf', { name: member.name ?? member.username })}
                      value={member.role}
                      disabled={self || update.isPending}
                      onChange={(e) =>
                        update.mutate({
                          username: member.username,
                          role: e.target.value as StaffRole,
                        })
                      }
                      className={`${inputHeight} rounded-lg border border-line bg-surface px-3 disabled:opacity-60`}
                    >
                      {STAFF_MEMBER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="space-x-1 px-4 py-3">
                    {!member.enabled ? (
                      <Badge tone="danger">{t('staff.disabled')}</Badge>
                    ) : member.status === 'invited' ? (
                      <Badge tone="warning">{t('staff.invited')}</Badge>
                    ) : (
                      <Badge tone="success">{t('staff.active')}</Badge>
                    )}
                    {member.enabled && member.status === 'active' && !member.mfaEnabled && (
                      <Badge tone="warning">{t('staff.noMfa')}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {!self && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="secondary"
                          disabled={resetPassword.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                t('staff.confirmPassword', {
                                  name: member.name ?? member.username,
                                }),
                              )
                            )
                              return;
                            resetPassword.mutate(member.username, { onSuccess: onCredentials });
                          }}
                        >
                          <KeyRound className="size-4" aria-hidden="true" />
                          {t('staff.newPassword')}
                        </Button>
                        {member.mfaEnabled && (
                          <Button
                            variant="secondary"
                            disabled={resetMfa.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('staff.confirmMfa', { name: member.name ?? member.username }),
                                )
                              ) {
                                resetMfa.mutate(member.username);
                              }
                            }}
                          >
                            <ShieldOff className="size-4" aria-hidden="true" />
                            {t('staff.resetMfa')}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          disabled={update.isPending}
                          className={member.enabled ? 'text-danger' : undefined}
                          onClick={() => {
                            const name = member.name ?? member.username;
                            if (
                              member.enabled &&
                              !window.confirm(t('staff.confirmDisable', { name }))
                            )
                              return;
                            update.mutate({ username: member.username, enabled: !member.enabled });
                          }}
                        >
                          {member.enabled ? t('staff.disable') : t('staff.enable')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {failed && <Alert tone="danger">{errorMessage(failed.error)}</Alert>}
    </section>
  );
}

function NewStaffForm({ onCreated }: { onCreated: (credentials: TemporaryCredentials) => void }) {
  const { t } = useTranslation();
  const create = useCreateStaff();
  const errorMessage = useErrorMessage();
  const [values, setValues] = useState({
    username: '',
    name: '',
    email: '',
    role: 'librarian' as StaffRole,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});

  function set<K extends keyof typeof values>(field: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateStaffRequestSchema.safeParse({
      username: values.username,
      name: values.name.trim(),
      email: values.email.trim() || undefined,
      role: values.role,
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof typeof values;
        next[field] = t(`staff.errors.${field}`);
      }
      setErrors(next);
      return;
    }
    try {
      const { credentials } = await create.mutateAsync(parsed.data);
      onCreated(credentials);
      setValues({ username: '', name: '', email: '', role: 'librarian' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // Shown below the form.
    }
  }

  return (
    <section
      aria-labelledby="new-staff"
      className="space-y-4 rounded-xl border border-dashed border-line p-5"
    >
      <h2 id="new-staff" className="text-xl font-semibold">
        {t('staff.new')}
      </h2>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t('staff.name')} error={errors.name} required>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field
          label={t('auth.username')}
          error={errors.username}
          hint={t('staff.usernameHint')}
          required
        >
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight} font-mono`}
              value={values.username}
              onChange={(e) => set('username', e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>
        <Field label={t('readers.form.email')} error={errors.email} hint={t('staff.emailHint')}>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={t('staff.role')} hint={t('staff.roleHint')}>
          {(props) => (
            <select
              {...props}
              className={`${props.className} ${inputHeight}`}
              value={values.role}
              onChange={(e) => set('role', e.target.value as StaffRole)}
            >
              {STAFF_MEMBER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="sm:col-span-2">
          {create.isError && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
          <Button type="submit" disabled={create.isPending} className="mt-2">
            <UserPlus className="size-4" aria-hidden="true" />
            {create.isPending ? t('auth.busy') : t('staff.create')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function CredentialsPanel({
  credentials,
  onDone,
}: {
  credentials: TemporaryCredentials;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = `${t('auth.username')}: ${credentials.username}\n${t('staff.temporaryPassword')}: ${credentials.temporaryPassword}\n${window.location.origin}/login`;

  return (
    <section
      role="status"
      className="space-y-3 rounded-xl border border-success/30 bg-success-soft p-5"
    >
      <h2 className="text-lg font-semibold text-success">{t('staff.credentials.heading')}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">{t('auth.username')}</dt>
        <dd className="font-mono">{credentials.username}</dd>
        <dt className="text-muted">{t('staff.temporaryPassword')}</dt>
        <dd className="font-mono text-lg tracking-wider">{credentials.temporaryPassword}</dd>
      </dl>
      <p className="text-sm">{t('staff.credentials.instructions')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          <Copy className="size-4" aria-hidden="true" />
          {copied ? t('staff.credentials.copied') : t('staff.credentials.copy')}
        </Button>
        <Button onClick={onDone}>{t('staff.credentials.done')}</Button>
      </div>
    </section>
  );
}
