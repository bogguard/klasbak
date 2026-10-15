import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api';

/** A friendly, centred message for empty and error states, with an optional next step. */
export function StatusMessage({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-accent-soft p-3 text-accent" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="text-muted">{children}</p>}
      {action}
    </div>
  );
}

/** Translates API error codes into a message a pupil or parent understands. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown) => {
    if (!(error instanceof ApiError)) return t('errors.UNKNOWN');
    // Details like { maxLoans: 3 } or { status: 'lost' } fill in the message.
    const details = (typeof error.details === 'object' ? error.details : {}) as Record<
      string,
      unknown
    >;
    const status = typeof details.status === 'string' ? t(`copyStatus.${details.status}`) : '';
    return t(`errors.${error.code}`, {
      ...details,
      status: status.toLocaleLowerCase(),
      defaultValue: t('errors.UNKNOWN'),
    });
  };
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-accent text-accent-ink hover:opacity-90'
      : 'border border-line bg-surface text-ink hover:bg-surface-sunken';
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium transition ${styles} ${className}`}
      {...props}
    />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line ${className}`} aria-hidden="true" />;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'bg-surface-sunken text-muted',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
