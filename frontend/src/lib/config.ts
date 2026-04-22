function resolveApiBaseUrl() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `${window.location.origin}/api`;
  }

  return "http://localhost:4000/api";
}

export const config = {
  apiBaseUrl: resolveApiBaseUrl(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
};
