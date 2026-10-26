import type { TitleWithCopies } from '@klasbak/shared';
import { Camera, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../components/ui/Feedback';
import { prepareCover, UnsupportedImageError } from '../../lib/image';
import { TitleCover } from '../catalog/TitleCover';
import { useRemoveCover, useUploadCover } from './api';

const action =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-sunken';

/**
 * Shows the cover and lets staff add or replace it with a photo or image file. On phones and
 * tablets the file picker offers the camera, so photographing the book is one tap.
 */
export function CoverEditor({ title }: { title: TitleWithCopies }) {
  const { t } = useTranslation();
  const inputId = useId();
  const upload = useUploadCover(title.id);
  const remove = useRemoveCover(title.id);
  const errorMessage = useErrorMessage();
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string>();
  const busy = preparing || upload.isPending || remove.isPending;

  async function choose(file: File | undefined) {
    if (!file) return;
    setProblem(undefined);
    setPreparing(true);
    try {
      const image = await prepareCover(file);
      setPreparing(false);
      await upload.mutateAsync(image);
    } catch (error) {
      setProblem(
        error instanceof UnsupportedImageError ? t('cover.unsupported') : errorMessage(error),
      );
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="w-36 space-y-2">
      <div className={busy ? 'animate-pulse' : undefined}>
        {/* A new key remounts it, so an earlier load error doesn't hide the new cover. */}
        <TitleCover
          key={title.coverImageKey}
          coverImageKey={title.coverImageKey}
          type={title.type}
          title={title.title}
          authors={title.authors.join(', ')}
        />
      </div>
      <label
        htmlFor={inputId}
        className={`${action} w-full justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <Camera className="size-4" aria-hidden="true" />
        {busy ? t('cover.busy') : title.coverImageKey ? t('cover.replace') : t('cover.add')}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = ''; // so choosing the same file again still triggers a change
        }}
      />
      {title.coverImageKey && (
        <button
          type="button"
          className={`${action} w-full justify-center text-danger`}
          disabled={busy}
          onClick={() => {
            if (window.confirm(t('cover.confirmRemove'))) remove.mutate();
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t('cover.remove')}
        </button>
      )}
      {(problem || remove.isError) && (
        <p role="alert" className="text-sm text-danger">
          {problem ?? errorMessage(remove.error)}
        </p>
      )}
    </div>
  );
}
