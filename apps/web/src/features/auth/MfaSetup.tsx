import { ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { renderSVG } from 'uqr';
import { Button, Skeleton } from '../../components/ui/Feedback';
import { Alert, Field, inputHeight } from '../../components/ui/Form';
import { useAuth } from '../../lib/auth';

/**
 * Links an authenticator app (two-step verification), required for staff. Shown instead of
 * the management pages until it's done. Afterwards Cognito asks for a code at every sign-in.
 */
export function MfaSetup() {
  const { t } = useTranslation();
  const { startTotpSetup, finishTotpSetup } = useAuth();
  const [setup, setSetup] = useState<{ qr: string; secret: string }>();
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startTotpSetup()
      .then(({ uri, secret }) => {
        if (cancelled) return;
        // A data URL keeps the strict content security policy intact (no inline SVG markup).
        const qr = `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(uri))}`;
        setSetup({ qr, secret });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [startTotpSetup]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await finishTotpSetup(code.replace(/\s/g, ''));
    } catch {
      setError(t('mfa.wrongCode'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-accent-soft p-3 text-accent">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t('mfa.heading')}</h1>
          <p className="text-muted">{t('mfa.why')}</p>
        </div>
      </div>

      <ol className="list-decimal space-y-6 pl-5">
        <li className="space-y-1">
          <p className="font-medium">{t('mfa.step1')}</p>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Smartphone className="size-4" aria-hidden="true" />
            {t('mfa.apps')}
          </p>
        </li>
        <li className="space-y-3">
          <p className="font-medium">{t('mfa.step2')}</p>
          {failed ? (
            <Alert tone="danger">{t('errors.UNKNOWN')}</Alert>
          ) : setup ? (
            <>
              <img
                src={setup.qr}
                alt={t('mfa.qrAlt')}
                className="size-48 rounded-lg border border-line bg-white p-2"
              />
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">{t('mfa.manual')}</summary>
                <p className="mt-2 break-all font-mono tracking-wider">
                  {setup.secret.match(/.{1,4}/g)?.join(' ')}
                </p>
              </details>
            </>
          ) : (
            <Skeleton className="size-48" />
          )}
        </li>
        <li className="space-y-3">
          <p className="font-medium">{t('mfa.step3')}</p>
          <form
            onSubmit={(e) => void submit(e)}
            className="flex flex-wrap items-end gap-3"
            noValidate
          >
            <Field label={t('auth.totp.label')} error={error} className="w-48">
              {(props) => (
                <input
                  {...props}
                  className={`${props.className} ${inputHeight} tracking-widest`}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                />
              )}
            </Field>
            <Button type="submit" disabled={busy || !setup}>
              {busy ? t('auth.busy') : t('mfa.confirm')}
            </Button>
          </form>
        </li>
      </ol>
    </div>
  );
}
