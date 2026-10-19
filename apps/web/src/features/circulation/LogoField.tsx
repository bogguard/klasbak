import { ImageUp, Library, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useErrorMessage } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Form';
import { useConfig } from '../../lib/config';
import { prepareImage, UnsupportedImageError } from '../../lib/image';
import { useBranding } from './api';

/**
 * The library's logo, shown in the header and on reader cards. A chosen file is saved right
 * away (like a cover), so it sits in the settings form without waiting for its save button.
 */
export function LogoField() {
  const { t } = useTranslation();
  const config = useConfig();
  const { uploadLogo, removeLogo } = useBranding();
  const errorMessage = useErrorMessage();
  const inputId = useId();
  const [problem, setProblem] = useState<string>();
  const failed = [uploadLogo, removeLogo].find((m) => m.isError);

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    setProblem(undefined);
    try {
      // PNG keeps a transparent background; 512 px is plenty for a header and cards.
      await uploadLogo.mutateAsync(await prepareImage(file, { maxSide: 512, type: 'image/png' }));
    } catch (error) {
      if (error instanceof UnsupportedImageError) setProblem(t('cover.unsupported'));
    }
  }

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">{t('settings.branding.logo')}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 items-center justify-center rounded-xl border border-line bg-surface p-2">
          {config.logoKey ? (
            <img
              src={`/${config.logoKey}`}
              alt={t('settings.branding.logoAlt')}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Library className="size-10 text-accent" aria-hidden="true" />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={inputId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium hover:bg-surface-sunken focus-within:outline-2 focus-within:outline-accent"
            >
              <ImageUp className="size-4" aria-hidden="true" />
              {uploadLogo.isPending
                ? t('cover.busy')
                : config.logoKey
                  ? t('settings.branding.replaceLogo')
                  : t('settings.branding.addLogo')}
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                void chooseLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {config.logoKey && (
              <Button
                type="button"
                variant="secondary"
                className="text-danger"
                disabled={removeLogo.isPending}
                onClick={() => removeLogo.mutate()}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t('cover.remove')}
              </Button>
            )}
          </div>
          <p className="max-w-md text-sm text-muted">{t('settings.branding.logoHint')}</p>
        </div>
      </div>
      {(problem || failed) && <Alert tone="danger">{problem ?? errorMessage(failed?.error)}</Alert>}
    </div>
  );
}
