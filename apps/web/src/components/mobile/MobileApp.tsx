"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Permission } from "@rounds/domain";
import type { Change, Snapshot, SyncResponse } from "@/lib/services/sync";
import { todayIso } from "@/lib/time";
import { applyAll, describeChange } from "./apply";
import { clearAll, enqueue, loadAll, saveMeta, saveSyncResult, type OutboxItem, type SyncMeta } from "./store";
import { AddDueScreen, DebtsScreen, ExpenseScreen, MileageScreen, SyncScreen, TodayScreen } from "./screens";

const SYNC_EVERY_MS = 2 * 60_000;

type Tab = "today" | "add" | "debts" | "expense" | "mileage" | "sync";
type Auth = "unknown" | "ok" | "login" | "forbidden";

export interface AppApi {
  snapshot: Snapshot;
  today: string;
  can: (p: Permission) => boolean;
  queue: (change: Change, message: string) => Promise<void>;
  newId: () => string;
}

function uuid(): string {
  // randomUUID only exists in secure contexts (https or localhost).
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function MobileApp() {
  const [server, setServer] = useState<Snapshot | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [meta, setMeta] = useState<SyncMeta>({ failures: [] });
  const [loaded, setLoaded] = useState(false);
  const [auth, setAuth] = useState<Auth>("unknown");
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [day, setDay] = useState(() => todayIso());
  const [toast, setToast] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const today = todayIso();

  const view = useMemo(() => (server ? applyAll(server, outbox.map((o) => o.change), today) : null), [server, outbox, today]);

  const reload = useCallback(async () => {
    const all = await loadAll();
    setServer(all.snapshot);
    setOutbox(all.outbox);
    setMeta(all.meta);
    return all;
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const { outbox: items, snapshot: before } = await loadAll();
      let res: Response;
      try {
        res = await fetch("/api/sync", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor: metaRef.current.cursor, changes: items.map((i) => i.change) }),
        });
      } catch {
        const m = { ...metaRef.current, lastError: "No connection. Changes are kept on this device." };
        await saveMeta(m);
        setMeta(m);
        return;
      }
      if (res.status === 401) { setAuth("login"); return; }
      if (res.status === 403) { setAuth("forbidden"); return; }
      if (!res.ok) {
        const m = { ...metaRef.current, lastError: `The server could not sync (error ${res.status}). Changes are kept.` };
        await saveMeta(m);
        setMeta(m);
        return;
      }
      const data = (await res.json()) as SyncResponse;
      setAuth("ok");
      const byId = new Map(items.map((i) => [i.change.clientId, i.change]));
      const settled = data.results.filter((r) => !r.retry);
      const failures = settled.filter((r) => !r.ok).map((r) => {
        const c = byId.get(r.clientId);
        return { clientId: r.clientId, type: c?.type ?? "complete_job", summary: c ? describeChange(c, before) : "Change", error: r.error ?? "Failed", at: new Date().toISOString() };
      });
      const jobIds = new Map(data.results.filter((r) => r.ok && r.jobId && byId.get(r.clientId)?.type === "add_job").map((r) => [`local:${r.clientId}`, r.jobId!]));
      const m: SyncMeta = { cursor: data.cursor, lastSyncedAt: new Date().toISOString(), failures: [...failures, ...metaRef.current.failures].slice(0, 50) };
      await saveSyncResult(new Set(settled.map((r) => r.clientId)), jobIds, data.snapshot, m);
      await reload();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [reload]);

  // Start-up: show what is stored, then sync. Re-sync on reconnect and every 2 minutes.
  useEffect(() => {
    setOnline(navigator.onLine);
    reload().catch(() => undefined).finally(() => { setLoaded(true); void sync(); });
    const goOnline = () => { setOnline(true); void sync(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = setInterval(() => { if (navigator.onLine) void sync(); }, SYNC_EVERY_MS);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [reload, sync]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const queue = useCallback(async (change: Change, message: string) => {
    await enqueue(change);
    await reload();
    setToast(navigator.onLine ? message : `${message}. It will sync when you are back online.`);
    if (navigator.onLine) setTimeout(() => void sync(), 300);
  }, [reload, sync]);

  const reset = useCallback(async () => {
    await clearAll();
    setServer(null);
    setOutbox([]);
    setMeta({ failures: [] });
    setTab("today");
    await sync();
  }, [sync]);

  const dismissFailures = useCallback(async () => {
    const m = { ...metaRef.current, failures: [] };
    await saveMeta(m);
    setMeta(m);
  }, []);

  if (!loaded) return <div className="m-app"><p className="m-empty">Loading…</p></div>;

  const loginCard = (
    <div className="m-card m-login" role="alert">
      <strong>Log in to sync</strong>
      <p>Your session has ended or you have not logged in on this device.{outbox.length > 0 && ` ${outbox.length} unsent change${outbox.length === 1 ? " is" : "s are"} safe on this device.`}</p>
      <a className="m-btn m-primary" href="/login?next=/m">Log in</a>
    </div>
  );

  if (!view) {
    return (
      <div className="m-app">
        <header className="m-top"><span className="m-brand">Rounds</span></header>
        <main className="m-main">
          {auth === "login" ? loginCard
            : auth === "forbidden" ? <div className="m-card">Your role does not allow access from the mobile app. Ask the account owner.</div>
            : syncing ? <p className="m-empty">Downloading your round…</p>
            : (
              <div className="m-card">
                <p>{meta.lastError ?? "Nothing downloaded yet."}</p>
                <button className="m-btn m-primary" onClick={() => void sync()}>Try again</button>
              </div>
            )}
        </main>
      </div>
    );
  }

  const perms = new Set(view.settings.permissions);
  const api: AppApi = {
    snapshot: view, today,
    can: (p) => perms.has("administrator") || perms.has(p),
    queue, newId: uuid,
  };
  const pending = outbox.length;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "today", label: "Jobs", show: true },
    { id: "debts", label: "Debts", show: api.can("access_debt_list") },
    { id: "expense", label: "Expense", show: api.can("record_expenses") },
    { id: "mileage", label: "Mileage", show: api.can("record_expenses") },
    { id: "sync", label: "Sync", show: true },
  ];

  return (
    <div className="m-app">
      <header className="m-top">
        <span className="m-brand">{view.settings.businessName}</span>
        <button className={`m-sync-pill ${online ? "" : "off"}`} onClick={() => setTab("sync")} aria-label="Sync status">
          {syncing ? "Syncing…" : online ? (pending ? `${pending} to sync` : "Synced") : `Offline${pending ? ` · ${pending}` : ""}`}
        </button>
      </header>
      {auth === "login" && <div className="m-main m-banner">{loginCard}</div>}
      <main className="m-main">
        {tab === "today" && <TodayScreen api={api} day={day} setDay={setDay} onAddDue={() => setTab("add")} />}
        {tab === "add" && <AddDueScreen api={api} day={day} onDone={() => setTab("today")} />}
        {tab === "debts" && <DebtsScreen api={api} />}
        {tab === "expense" && <ExpenseScreen api={api} />}
        {tab === "mileage" && <MileageScreen api={api} />}
        {tab === "sync" && (
          <SyncScreen api={api} pending={outbox} meta={meta} online={online} syncing={syncing}
            onSync={() => void sync()} onReset={reset} onDismiss={dismissFailures} />
        )}
      </main>
      <div className="m-toast" role="status" aria-live="polite">{toast}</div>
      <nav className="m-tabs" aria-label="Sections">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} className={tab === t.id || (t.id === "today" && tab === "add") ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "sync" && pending > 0 && <span className="m-count">{pending}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
