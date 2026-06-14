const ADMIN_API_KEY = 'drivelegal-admin-secret-2024';

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/** Admin requests — automatically injects X-Admin-Key header */
export async function adminFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  return apiFetch<T>(input, {
    ...init,
    headers: {
      'X-Admin-Key': ADMIN_API_KEY,
      ...(init?.headers ?? {}),
    },
  });
}
