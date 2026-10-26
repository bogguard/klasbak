import { z } from 'zod';
import { text } from './catalog';

/** Public file the website reads for the library's name and logo (no API call needed). */
export const BRANDING_PATH = 'branding/branding.json';

export const LOGO_MAX_BYTES = 1024 * 1024;

export const UpdateBrandingRequestSchema = z.object({ libraryName: text(80) }).strict();

export const LogoUploadRequestSchema = z.object({
  image: z.base64().max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 4),
});

export type Branding = {
  libraryName?: string;
  logoKey?: string;
};
