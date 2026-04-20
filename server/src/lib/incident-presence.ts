import type { Response } from "express";

export interface IncidentPresenceEntry {
  userId:   string;
  userName: string;
  lastSeen: number; // ms timestamp
}

// incidentId → userId → entry
const store = new Map<number, Map<string, IncidentPresenceEntry>>();

// incidentId → set of SSE response objects
const sseClients = new Map<number, Set<Response>>();

export function upsertViewer(incidentId: number, entry: IncidentPresenceEntry): void {
  if (!store.has(incidentId)) store.set(incidentId, new Map());
  store.get(incidentId)!.set(entry.userId, entry);
  broadcast(incidentId);
}

export function removeViewer(incidentId: number, userId: string): void {
  const map = store.get(incidentId);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) store.delete(incidentId);
  broadcast(incidentId);
}

export function addSseClient(incidentId: number, res: Response): void {
  if (!sseClients.has(incidentId)) sseClients.set(incidentId, new Set());
  sseClients.get(incidentId)!.add(res);
  // Send current snapshot immediately on connect
  sendToClient(res, getViewers(incidentId));
}

export function removeSseClient(incidentId: number, res: Response): void {
  const set = sseClients.get(incidentId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(incidentId);
}

function getViewers(incidentId: number): IncidentPresenceEntry[] {
  return Array.from(store.get(incidentId)?.values() ?? []);
}

function sendToClient(res: Response, viewers: IncidentPresenceEntry[]): void {
  try {
    res.write(`data: ${JSON.stringify({ viewers })}\n\n`);
  } catch {
    // Client already disconnected — ignore
  }
}

function broadcast(incidentId: number): void {
  const clients = sseClients.get(incidentId);
  if (!clients?.size) return;
  const viewers = getViewers(incidentId);
  for (const res of clients) sendToClient(res, viewers);
}

// Evict entries that haven't heartbeated in 35 s
setInterval(() => {
  const now = Date.now();
  for (const [incidentId, map] of store) {
    let changed = false;
    for (const [userId, entry] of map) {
      if (now - entry.lastSeen > 35_000) {
        map.delete(userId);
        changed = true;
      }
    }
    if (changed) broadcast(incidentId);
    if (map.size === 0) store.delete(incidentId);
  }
}, 20_000);
