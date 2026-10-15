import { isStaff, ROLES, type Role } from '@library/shared';
import { KeyRound, LogIn, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useAuth, type SignInStep } from '../../lib/auth';

/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
function safeNext(next: string | null): string | undefined {
  return next?.startsWith('/') && !next.startsWith('//') ? next : undefined;
}

export function LoginPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  if (auth.session) {
    return <Navigate to={next ?? (isStaff(auth.session.roles) ? '/manage' : '/')} replace />;
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <div className="space-y-2 text-center">
        <div className="mx-auto w-fit rounded-full bg-accent-soft p-3 text-accent">
          <KeyRound className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold">{t('auth.heading')}</h1>
      </div>
      {auth.mode === 'dev' ? <DevSignIn /> : <CognitoSignIn />}
    </div>
  );
}

function DevSignIn() {
  const { t } = useTranslation();
  const { signInAsDevRole } = useAuth();
  return (
    <div className="space-y-4">
      <Alert tone="info">{t('auth.dev.notice')}</Alert>
      <ul className="space-y-2">
        {ROLES.map((role: Role) => (
          <li key={role}>
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => signInAsDevRole(role)}
            >
              <Wrench className="size-4" aria-hidden="true" />
              {t('auth.dev.signInAs', { role: t(`roles.${role}`) })}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CognitoSignIn() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [step, setStep] = useState<Exclude<SignInStep, 'done'> | 'credentials'>('credentials');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (step === 'newPassword' && secret !== confirmation) {
      setError(t('auth.errors.passwordsDiffer'));
      return;
    }
    setBusy(true);
    try {
      const result =
        step === 'credentials'
          ? await auth.signIn(username.trim(), secret)
          : await auth.confirmSignIn(secret.trim());
      // On 'done' the session is set and LoginPage redirects; nothing to do here.
      if (result === 'unsupported') setError(t('auth.errors.unsupported'));
      else if (result !== 'done') {
        setStep(result);
        setSecret('');
      }
    } catch (e) {
      setError(signInErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}

      {step === 'credentials' && (
        <>
          <Field label={t('auth.username')} hint={t('auth.usernameHint')} required>
            {(props) => (
              <input
                {...props}
                className={`${props.className} ${inputHeight}`}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                required
              />
            )}
          </Field>
          <Field label={t('auth.password')} required>
            {(props) => (
              <input
                {...props}
                className={`${props.className} ${inputHeight}`}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="current-password"
                required
              />
            )}
          </Field>
        </>
      )}

      {step === 'newPassword' && (
        <>
          <Alert tone="info">{t('auth.newPassword.explanation')}</Alert>
          <Field label={t('auth.newPassword.label')} hint={t('auth.newPassword.hint')} required>
            {(props) => (
              <input
                {...props}
                className={`${props.className} ${inputHeight}`}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
            )}
          </Field>
          <Field label={t('auth.newPassword.repeat')} required>
            {(props) => (
              <input
                {...props}
                className={`${props.className} ${inputHeight}`}
                type="password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="new-password"
                required
              />
            )}
          </Field>
        </>
      )}

      {step === 'totp' && (
        <Field label={t('auth.totp.label')} hint={t('auth.totp.hint')} required>
          {(props) => (
            <input
              {...props}
              className={`${props.className} ${inputHeight} tracking-widest`}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              required
            />
          )}
        </Field>
      )}

      {step === 'unsupported' ? null : (
        <Button type="submit" className="w-full" disabled={busy}>
          <LogIn className="size-4" aria-hidden="true" />
          {busy ? t('auth.busy') : t('auth.submit')}
        </Button>
      )}
    </form>
  );
}

function signInErrorMessage(error: unknown, t: (key: string) => string): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return t('auth.errors.wrongCredentials');
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      return t('auth.errors.tooManyAttempts');
    case 'InvalidPasswordException':
      return t('auth.errors.weakPassword');
    case 'CodeMismatchException':
      return t('auth.errors.wrongCode');
    default:
      return t('errors.UNKNOWN');
  }
}
