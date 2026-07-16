export type SupabaseRuntimeEnv = Record<string, string | undefined>

export type SiliconSupabaseConfig = {
  publishableKey: string
  url: string
}

export function readSiliconSupabaseConfig(
  env: SupabaseRuntimeEnv = import.meta.env,
): SiliconSupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL
  const publishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY

  if (!url || !publishableKey) {
    return null
  }

  return { publishableKey, url }
}
