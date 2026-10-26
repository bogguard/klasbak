import type { TitleType } from '@klasbak/shared';
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

/** Calm cloth-like colours with readable text (contrast checked against the text colour). */
const PALETTE = [
  'bg-[#0f5f58] text-[#f4efe6]',
  'bg-[#7a3658] text-[#fbeff4]',
  'bg-[#a8492a] text-[#fff3e8]',
  'bg-[#1f3b5f] text-[#eef3fb]',
  'bg-[#3e6629] text-[#f1f7ea]',
  'bg-[#e3bb4f] text-[#2b2210]',
  'bg-[#58468a] text-[#f3f0fb]',
  'bg-[#2b5f7a] text-[#eef6fa]',
];

/** Shorter titles get bigger letters, like on real covers; long ones still fit. */
function titleSize(title: string): string {
  if (title.length <= 14) return 'text-[14cqw]';
  if (title.length <= 32) return 'text-[12cqw]';
  return 'text-[10cqw]';
}

/** The same title always gets the same colour, so a book is recognisable across pages. */
function paletteFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0] ?? '';
}

type TitleCoverProps = {
  coverImageKey?: string;
  type: TitleType;
  title: string;
  authors?: string;
  /** Width classes; the height follows from the 2:3 book shape. */
  className?: string;
};

/**
 * The cover from our own bucket or, when there is none, a generated one: a coloured "cloth"
 * cover with the title, so the catalogue never looks empty. Decorative for screen readers;
 * the title is always next to it as text.
 */
export function TitleCover({
  coverImageKey,
  type,
  title,
  authors,
  className = 'w-full',
}: TitleCoverProps) {
  const [failed, setFailed] = useState(false);
  const shape = `${className} aspect-[2/3] shrink-0 overflow-hidden rounded-md shadow-sm ring-1 ring-black/5`;

  if (coverImageKey && !failed) {
    return (
      <img
        src={`/${coverImageKey}`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${shape} bg-surface object-cover`}
      />
    );
  }

  return (
    // Sizes in cqw (percent of the cover's width) so the text fits at any size.
    <div aria-hidden="true" className={`${shape} @container relative ${paletteFor(title)}`}>
      <div className="absolute inset-y-0 left-0 w-[7%] bg-black/15" />
      <div className="flex h-full flex-col py-[12cqw] pl-[16cqw] pr-[10cqw]">
        {/* Dutch hyphenation (lang="nl-BE") keeps long words like "dinosaurussen" whole. */}
        <p
          className={`line-clamp-5 font-display font-semibold leading-[1.1] break-words hyphens-auto ${titleSize(title)}`}
        >
          {title}
        </p>
        <div className="mt-[6cqw] h-px w-1/3 bg-current opacity-50" />
        {authors && <p className="mt-[5cqw] line-clamp-2 text-[8cqw] opacity-85">{authors}</p>}
        <div className="mt-auto flex justify-end opacity-70">
          {type !== 'book' && <TypeIcon type={type} className="size-[16cqw]" />}
        </div>
      </div>
    </div>
  );
}
