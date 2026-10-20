/**
 * Device storage for the mobile app: the last snapshot from the server, the
 * outbox of changes not yet accepted by the server, and sync metadata.
 * The screen always shows the snapshot with the outbox applied on top.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Change, Snapshot } from "@/lib/services/sync";

export interface OutboxItem {
  seq?: number;
  change: Change;
  queuedAt: string;
}

export interface SyncFailure {
  clientId: string;
  type: Change["type"];
  summary: string;
  error: string;
  at: string;
}

export interface SyncMeta {
  cursor?: string;
  lastSyncedAt?: string;
  lastError?: string;
  failures: SyncFailure[];
}

interface MobileDB extends DBSchema {
  kv: { key: string; value: unknown };
  outbox: { key: number; value: OutboxItem };
}

const DB_NAME = "rounds-mobile";
let dbPromise: Promise<IDBPDatabase<MobileDB>> | null = null;

function database() {
  dbPromise ??= openDB<MobileDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("kv");
      db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
    },
  });
  return dbPromise;
}

export async function loadAll(): Promise<{ snapshot: Snapshot | null; outbox: OutboxItem[]; meta: SyncMeta }> {
  const db = await database();
  const [snapshot, outbox, meta] = await Promise.all([db.get("kv", "snapshot"), db.getAll("outbox"), db.get("kv", "meta")]);
  return { snapshot: (snapshot as Snapshot | undefined) ?? null, outbox, meta: (meta as SyncMeta | undefined) ?? { failures: [] } };
}

export async function enqueue(change: Change) {
  const db = await database();
  await db.add("outbox", { change, queuedAt: new Date().toISOString() });
}

/**
 * Store what the server sent back: drop the changes it has dealt with, point any
 * queued changes at the server ids of jobs created offline, save the snapshot.
 */
export async function saveSyncResult(done: Set<string>, jobIds: Map<string, string>, snapshot: Snapshot, meta: SyncMeta) {
  const db = await database();
  const tx = db.transaction(["outbox", "kv"], "readwrite");
  const outbox = tx.objectStore("outbox");
  for (const item of await outbox.getAll()) {
    if (done.has(item.change.clientId)) {
      await outbox.delete(item.seq!);
      continue;
    }
    const c = item.change;
    if ((c.type === "complete_job" || c.type === "move_job") && jobIds.has(c.jobId)) {
      await outbox.put({ ...item, change: { ...c, jobId: jobIds.get(c.jobId)! } });
    }
  }
  await tx.objectStore("kv").put(snapshot, "snapshot");
  await tx.objectStore("kv").put(meta, "meta");
  await tx.done;
}

export async function saveMeta(meta: SyncMeta) {
  await (await database()).put("kv", meta, "meta");
}

/** Reset: wipe everything held on this device. */
export async function clearAll() {
  const db = await database();
  const tx = db.transaction(["outbox", "kv"], "readwrite");
  await Promise.all([tx.objectStore("outbox").clear(), tx.objectStore("kv").clear(), tx.done]);
}
