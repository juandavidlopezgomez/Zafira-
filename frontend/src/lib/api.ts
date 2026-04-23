// En producción VITE_API_URL queda vacío y las rutas son relativas (/api/...)
// En desarrollo apunta al servidor local
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = localStorage.getItem('bf_token')
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? 'Error de red')
  }

  return res.json() as Promise<T>
}
