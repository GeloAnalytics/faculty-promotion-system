export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: mergeHeaders(init),
    ...init,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readErrorMessage(data, response.status));
  }

  return data as T;
}

function mergeHeaders(init: RequestInit) {
  const headers = new Headers(init.headers ?? undefined);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function readErrorMessage(data: unknown, status: number) {
  if (typeof data === 'object' && data !== null) {
    const error = typeof Reflect.get(data, 'error') === 'string' ? String(Reflect.get(data, 'error')) : null;
    const details = typeof Reflect.get(data, 'details') === 'string' ? String(Reflect.get(data, 'details')) : null;

    if (error && details && error !== details) {
      return `${error}: ${details}`;
    }

    if (error || details) {
      return error ?? details ?? `Request failed with status ${status}`;
    }
  }

  return `Request failed with status ${status}`;
}
