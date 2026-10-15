import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useId, type ReactNode } from 'react';

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-muted aria-[invalid=true]:border-danger';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the props that connect the control to its label, hint and error. */
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
    className: string;
  }) => ReactNode;
};

/** Label, control, hint and error message, wired together for screen readers. */
export function Field({ label, hint, error, required, className = '', children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        className: control,
      })}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Height classes for single-line controls; textareas size themselves. */
export const inputHeight = 'min-h-11';

export function Alert({
  tone,
  children,
  action,
}: {
  tone: 'info' | 'success' | 'danger';
  children: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    info: 'border-line bg-surface text-ink',
    success: 'border-success/30 bg-success-soft text-success',
    danger: 'border-danger/30 bg-danger-soft text-danger',
  };
  const Icon = tone === 'success' ? CircleCheck : tone === 'danger' ? CircleAlert : Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${styles[tone]}`}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
