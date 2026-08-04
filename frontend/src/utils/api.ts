export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');

  return baseUrl ? `${baseUrl}${normalizedPath}` : `/api${normalizedPath}`;
}
