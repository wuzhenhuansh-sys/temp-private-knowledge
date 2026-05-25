import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

function createBaseClient(key: string, accessToken?: string) {
  return createClient(config.supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export type AppSupabaseClient = SupabaseClient;
export type ServiceSupabaseSession = {
  accessToken: string;
  userId: string;
  session: Session;
};

export const supabaseAuthClient = createBaseClient(config.supabaseAnonKey);

export function createUserSupabaseClient(accessToken: string): AppSupabaseClient {
  return createBaseClient(config.supabaseAnonKey, accessToken);
}

export async function createServiceSupabaseSession(): Promise<ServiceSupabaseSession> {
  const { data, error } = await supabaseAuthClient.auth.signInWithPassword({
    email: config.supabaseUserEmail,
    password: config.supabaseUserPassword,
  });

  if (error || !data.session?.access_token || !data.user) {
    throw new Error(`Failed to sign in service Supabase user: ${error?.message ?? "missing session"}`);
  }

  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
    session: data.session,
  };
}

export async function createServiceSupabaseClient() {
  const session = await createServiceSupabaseSession();
  return {
    client: createUserSupabaseClient(session.accessToken),
    userId: session.userId,
    accessToken: session.accessToken,
  };
}

export const supabaseAdminClient = config.supabaseServiceRoleKey
  ? createBaseClient(config.supabaseServiceRoleKey)
  : null;
