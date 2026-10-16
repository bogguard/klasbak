import { BRANDING_PATH, type Branding } from '@library/shared';
import { useQuery } from '@tanstack/react-query';

/**
 * Runtime settings: /config.json is written at deploy time (scripts/deploy-web.sh), so the
 * same build runs in every environment; the library's own name and logo come from the
 * branding file an administrator maintains in the app (Instellingen → Huisstijl).
 */
export type AppConfig = {
  libraryName: string;
  /** Path of the school's logo, if one was uploaded. */
  logoKey?: string;
  region?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  /** Only true on the local dev server: pick a role instead of signing in with Cognito. */
  devAuth?: boolean;
  /** False until the configuration has been fetched (or failed). */
  loaded: boolean;
};

export const configKey = ['config'];

const fallback: AppConfig = { libraryName: 'Bibliotheek', loaded: false };

async function readJson<T>(path: string): Promise<Partial<T>> {
  try {
    const response = await fetch(path);
    return response.ok ? ((await response.json()) as Partial<T>) : {};
  } catch {
    // Offline or not set up yet: defaults (public catalogue, no sign-in).
    return {};
  }
}

export function useConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: configKey,
    queryFn: async (): Promise<AppConfig> => {
      const [config, branding] = await Promise.all([
        readJson<AppConfig>('/config.json'),
        readJson<Branding>(`/${BRANDING_PATH}`),
      ]);
      return {
        ...fallback,
        ...config,
        libraryName: branding.libraryName ?? config.libraryName ?? fallback.libraryName,
        logoKey: branding.logoKey,
        loaded: true,
      };
    },
    staleTime: Infinity,
  });
  return data ?? fallback;
}
