import { useQuery } from '@tanstack/react-query';

/**
 * Runtime settings written to /config.json at deploy time (scripts/deploy-web.sh),
 * so the same build runs in every environment and for every school.
 */
export type AppConfig = {
  libraryName: string;
  region?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  /** Only true on the local dev server: pick a role instead of signing in with Cognito. */
  devAuth?: boolean;
  /** False until /config.json has been fetched (or failed). */
  loaded: boolean;
};

const fallback: AppConfig = { libraryName: 'Bibliotheek', loaded: false };

export function useConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: async (): Promise<AppConfig> => {
      let config: Partial<AppConfig> = {};
      try {
        const response = await fetch('/config.json');
        if (response.ok) config = (await response.json()) as Partial<AppConfig>;
      } catch {
        // Offline or misconfigured: run with defaults (public catalogue, no sign-in).
      }
      return { ...fallback, ...config, loaded: true };
    },
    staleTime: Infinity,
  });
  return data ?? fallback;
}
