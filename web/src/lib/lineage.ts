/** dbt lineage (model.json from `wta lineage`) laid out as columns: sources & seeds → staging →
 *  intermediate → marts → web pages. Within a column, nodes are ordered by the average position
 *  of their parents (barycentre), which keeps most edges short and uncrossed. */

export interface ModelNode {
  id: string;
  name: string;
  type: "source" | "seed" | "model" | "exposure";
  layer: string;
  column: number;
  materialized: string | null;
  incremental_strategy: string | null;
  contract: boolean;
  tags: string[];
  description: string;
  columns: { name: string; type: string | null; description: string }[];
  parents: string[];
  tests: { tests: number; passed: number; failed: number };
  rows: number | null;
  sql: string | null;
  path: string | null;
  url: string | null;
  docs: string;
}

export interface ModelFile {
  dbt_version: string;
  generated_at: string;
  tests_total: number;
  tests_passed: number;
  nodes: ModelNode[];
}

export interface Placed extends ModelNode {
  x: number;
  y: number;
}

export const COLUMN_GAP = 230;
export const ROW_GAP = 44;

export function layout(nodes: ModelNode[]): Placed[] {
  const columns = new Map<number, ModelNode[]>();
  for (const node of nodes) {
    if (!columns.has(node.column)) columns.set(node.column, []);
    columns.get(node.column)!.push(node);
  }
  const position = new Map<string, number>();
  const placed: Placed[] = [];
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    const members = columns.get(column)!;
    const weight = (node: ModelNode) => {
      const known = node.parents.map((parent) => position.get(parent)).filter((p): p is number => p !== undefined);
      return known.length ? known.reduce((sum, p) => sum + p, 0) / known.length : Number.POSITIVE_INFINITY;
    };
    // Parentless nodes (sources, seeds) keep a stable order by type then name.
    members.sort((a, b) => weight(a) - weight(b) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    members.forEach((node, index) => {
      position.set(node.id, index);
      placed.push({ ...node, x: column * COLUMN_GAP, y: index * ROW_GAP });
    });
  }
  // Centre each column vertically on the tallest one.
  const tallest = Math.max(...[...columns.values()].map((members) => members.length));
  return placed.map((node) => {
    const count = columns.get(node.column)!.length;
    return { ...node, y: node.y + ((tallest - count) * ROW_GAP) / 2 };
  });
}

/** Every node upstream or downstream of `id` (inclusive). */
export function lineageOf(nodes: ModelNode[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) for (const parent of node.parents) children.set(parent, [...(children.get(parent) ?? []), node.id]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>([id]);
  const walk = (start: string, next: (node: string) => string[]) => {
    const queue = [start];
    while (queue.length) {
      for (const neighbour of next(queue.shift()!)) {
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
  };
  walk(id, (node) => byId.get(node)?.parents ?? []);
  walk(id, (node) => children.get(node) ?? []);
  return seen;
}
