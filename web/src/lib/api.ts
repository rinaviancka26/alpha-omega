export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error((body && (body as { error?: string }).error) || `HTTP ${res.status}`), { status: res.status, body });
  return body as T;
}
export const post = <T = unknown>(path: string, json: unknown) => api<T>(path, { method: 'POST', json });

export type TerminalStatus = { attached: boolean; sessions: number; claudeRunning: boolean };
