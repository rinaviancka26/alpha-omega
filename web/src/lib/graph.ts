// Walk-graph helpers shared by the picker checklist and the office movement code.
export type P = { x: number; y: number };

export function adjacency(edges: [string, string][]) {
  const adj: Record<string, string[]> = {};
  for (const [a, b] of edges) { (adj[a] ||= []).push(b); (adj[b] ||= []).push(a); }
  return adj;
}
/** BFS shortest path (by hops) from a to b; null if unreachable. */
export function bfs(edges: [string, string][], a: string, b: string): string[] | null {
  if (a === b) return [a];
  const adj = adjacency(edges);
  const prev: Record<string, string | null> = { [a]: null };
  const q = [a];
  while (q.length) {
    const cur = q.shift()!;
    for (const n of adj[cur] || []) {
      if (n in prev) continue;
      prev[n] = cur;
      if (n === b) {
        const path = [b];
        let p = prev[b];
        while (p) { path.unshift(p); p = prev[p]; }
        return path;
      }
      q.push(n);
    }
  }
  return null;
}
export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
