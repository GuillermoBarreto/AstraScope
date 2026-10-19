export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // Trim whitespace: a stray space or newline pasted into the env var would
  // otherwise silently break every API URL with a cryptic fetch failure.
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');

  return baseUrl ? `${baseUrl}${normalizedPath}` : `/api${normalizedPath}`;
}
