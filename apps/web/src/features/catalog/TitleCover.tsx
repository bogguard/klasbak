import type { TitleType } from '@library/shared';
import {
  BookOpen,
  Disc3,
  Film,
  Gamepad2,
  Music,
  Newspaper,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

const TYPE_ICONS: Record<TitleType, LucideIcon> = {
  book: BookOpen,
  magazine: Newspaper,
  audio: Disc3,
  video: Film,
  game: Gamepad2,
  score: Music,
  other: Package,
};

export function TypeIcon({ type, className }: { type: TitleType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className={className} aria-hidden="true" />;
}

/** Cover image from our own bucket, or a calm placeholder with the item type. Decorative only. */
export function TitleCover({
  coverImageKey,
  type,
  size,
}: {
  coverImageKey?: string;
  type: TitleType;
  size: 'small' | 'large';
}) {
  const [failed, setFailed] = useState(false);
  const box = size === 'small' ? 'h-24 w-16' : 'aspect-[2/3] w-full max-w-56';

  if (!coverImageKey || failed) {
    return (
      <div
        className={`${box} flex shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent`}
      >
        <TypeIcon type={type} className={size === 'small' ? 'size-6' : 'size-12'} />
      </div>
    );
  }
  return (
    <img
      src={`/${coverImageKey}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${box} shrink-0 rounded-md object-cover shadow-sm`}
    />
  );
}
