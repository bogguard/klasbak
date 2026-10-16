import { isStaff, ROLES, type Role } from '@library/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiRequest } from './api';
import { useConfig, type AppConfig } from './config';
import type * as AmplifyAuth from 'aws-amplify/auth';

/*
 * Sign-in for the web app. Two modes, chosen by /config.json:
 *  - cognito: our own sign-in screen talking to Cognito via Amplify (decision 006).
 *    Amplify is loaded on demand so the public catalogue doesn't download it.
 *  - dev: only on the local server; pick a role, sent as "Authorization: Dev <role>".
 */

export type Session = {
  username: string;
  roles: Role[];
  /** Whether an authenticator app is linked; staff must have one (the API enforces it). */
  mfaEnabled: boolean;
};

/** What Cognito wants next during sign-in. */
export type SignInStep = 'done' | 'newPassword' | 'totp' | 'unsupported';

type AuthContextValue = {
  mode: 'dev' | 'cognito';
  /** undefined while we're still checking for an existing session. */
  session: Session | null | undefined;
  signIn: (username: string, password: string) => Promise<SignInStep>;
  confirmSignIn: (response: string) => Promise<SignInStep>;
  signInAsDevRole: (role: Role) => void;
  signOut: () => Promise<void>;
  /** Starts linking an authenticator app: returns what to put in a QR code. */
  startTotpSetup: () => Promise<{ uri: string; secret: string }>;
  /** Confirms the link with a code from the app and turns two-step verification on. */
  finishTotpSetup: (code: string) => Promise<void>;
  /** Value for the Authorization header, refreshed tokens included. */
  authorization: () => Promise<string | undefined>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEV_STORAGE_KEY = 'dev-role';

let amplify: Promise<typeof AmplifyAuth> | undefined;
function loadAmplify(config: AppConfig): Promise<typeof AmplifyAuth> {
  amplify ??= (async () => {
    const [{ Amplify }, auth] = await Promise.all([
      import('aws-amplify'),
      import('aws-amplify/auth'),
    ]);
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: config.userPoolId ?? '',
          userPoolClientId: config.userPoolClientId ?? '',
        },
      },
    });
    return auth;
  })();
  return amplify;
}

function toStep(signInStep: string, isSignedIn: boolean): SignInStep {
  if (isSignedIn || signInStep === 'DONE') return 'done';
  if (signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return 'newPassword';
  if (signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') return 'totp';
  return 'unsupported';
}

async function readCognitoSession(auth: typeof AmplifyAuth): Promise<Session | null> {
  try {
    const { tokens } = await auth.fetchAuthSession();
    const payload = tokens?.accessToken.payload;
    if (!payload) return null;
    const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];
    const mfa = await auth.fetchMFAPreference();
    return {
      username: String(payload.username ?? ''),
      roles: groups.filter((g): g is Role => ROLES.includes(g as Role)),
      mfaEnabled: Boolean(mfa.enabled?.includes('TOTP')),
    };
  } catch {
    return null;
  }
}

// Local development has no Cognito, so two-step verification counts as done.
function devSessionFor(role: Role): Session {
  return { username: `dev-${role}`, roles: [role], mfaEnabled: true };
}

function readDevSession(): Session | null {
  try {
    const role = sessionStorage.getItem(DEV_STORAGE_KEY) as Role | null;
    return role && ROLES.includes(role) ? devSessionFor(role) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const mode = config.devAuth ? 'dev' : 'cognito';
  const [devSession, setDevSession] = useState(readDevSession);
  const [cognitoSession, setCognitoSession] = useState<Session | null>();
  const hasCognito = Boolean(config.userPoolId);

  // Restore an existing Cognito session (Amplify keeps tokens between visits).
  useEffect(() => {
    if (config.loaded && mode === 'cognito' && hasCognito) {
      void loadAmplify(config).then(readCognitoSession).then(setCognitoSession);
    }
  }, [config, mode, hasCognito]);

  const session: Session | null | undefined = !config.loaded
    ? undefined
    : mode === 'dev'
      ? devSession
      : hasCognito
        ? cognitoSession
        : null;
  const setSession = mode === 'dev' ? setDevSession : setCognitoSession;

  const signIn = useCallback(
    async (username: string, password: string) => {
      const auth = await loadAmplify(config);
      const result = await auth.signIn({ username, password });
      const step = toStep(result.nextStep.signInStep, result.isSignedIn);
      if (step === 'done') setCognitoSession(await readCognitoSession(auth));
      return step;
    },
    [config],
  );

  const confirmSignIn = useCallback(
    async (response: string) => {
      const auth = await loadAmplify(config);
      const result = await auth.confirmSignIn({ challengeResponse: response });
      const step = toStep(result.nextStep.signInStep, result.isSignedIn);
      if (step === 'done') setCognitoSession(await readCognitoSession(auth));
      return step;
    },
    [config],
  );

  const signInAsDevRole = useCallback((role: Role) => {
    try {
      sessionStorage.setItem(DEV_STORAGE_KEY, role);
    } catch {
      // Without storage the dev session lasts until reload; fine for local use.
    }
    setDevSession(devSessionFor(role));
  }, []);

  const signOut = useCallback(async () => {
    if (mode === 'dev') {
      try {
        sessionStorage.removeItem(DEV_STORAGE_KEY);
      } catch {
        // ignore
      }
    } else {
      await (await loadAmplify(config)).signOut();
    }
    setSession(null);
  }, [config, mode, setSession]);

  const startTotpSetup = useCallback(async () => {
    const details = await (await loadAmplify(config)).setUpTOTP();
    const account = cognitoSession?.username ?? '';
    return {
      uri: details.getSetupUri(config.libraryName, account).toString(),
      secret: details.sharedSecret,
    };
  }, [config, cognitoSession]);

  const finishTotpSetup = useCallback(
    async (code: string) => {
      const auth = await loadAmplify(config);
      await auth.verifyTOTPSetup({ code });
      await auth.updateMFAPreference({ totp: 'PREFERRED' });
      setCognitoSession(await readCognitoSession(auth));
    },
    [config],
  );

  const authorization = useCallback(async () => {
    if (mode === 'dev') {
      const role = readDevSession()?.roles[0];
      return role ? `Dev ${role}` : undefined;
    }
    const { tokens } = await (await loadAmplify(config)).fetchAuthSession();
    return tokens?.accessToken ? `Bearer ${tokens.accessToken.toString()}` : undefined;
  }, [config, mode]);

  const value = useMemo(
    () => ({
      mode,
      session,
      signIn,
      confirmSignIn,
      signInAsDevRole,
      signOut,
      startTotpSetup,
      finishTotpSetup,
      authorization,
    }),
    [
      mode,
      session,
      signIn,
      confirmSignIn,
      signInAsDevRole,
      signOut,
      startTotpSetup,
      finishTotpSetup,
      authorization,
    ],
  ) satisfies AuthContextValue;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export function useIsStaff(): boolean {
  const { session } = useAuth();
  return Boolean(session && isStaff(session.roles));
}

/** API calls on behalf of the signed-in user. */
export function useAuthorizedApi() {
  const { authorization } = useAuth();
  return useCallback(
    async <T,>(
      path: string,
      options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
    ) => apiRequest<T>(path, { ...options, authorization: await authorization() }),
    [authorization],
  );
}
