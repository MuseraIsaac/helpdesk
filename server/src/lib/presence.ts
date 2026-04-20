import type { Response } from "express";

export interface PresenceEntry {
  userId: string;
  userName: string;
  composing: boolean;
  lastSeen: number; // ms timestamp
}

// ticketId → userId → entry
const store = new Map<number, Map<string, PresenceEntry>>();

// ticketId → set of SSE response objects
const sseClients = new Map<number, Set<Response>>();

export function upsertViewer(ticketId: number, entry: PresenceEntry): void {
  if (!store.has(ticketId)) store.set(ticketId, new Map());
  store.get(ticketId)!.set(entry.userId, entry);
  broadcast(ticketId);
}

export function removeViewer(ticketId: number, userId: string): void {
  const map = store.get(ticketId);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) store.delete(ticketId);
  broadcast(ticketId);
}

export function addSseClient(ticketId: number, res: Response): void {
  if (!sseClients.has(ticketId)) sseClients.set(ticketId, new Set());
  sseClients.get(ticketId)!.add(res);
  // Send current presence immediately on connect
  const viewers = getViewers(ticketId);
  sendToClient(res, viewers);
}

export function removeSseClient(ticketId: number, res: Response): void {
  const set = sseClients.get(ticketId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(ticketId);
}

function getViewers(ticketId: number): PresenceEntry[] {
  return Array.from(store.get(ticketId)?.values() ?? []);
}

function sendToClient(res: Response, viewers: PresenceEntry[]): void {
  try {
    res.write(`data: ${JSON.stringify({ viewers })}\n\n`);
  } catch {
    // Client already disconnected — ignore
  }
}

function broadcast(ticketId: number): void {
  const clients = sseClients.get(ticketId);
  if (!clients?.size) return;
  const viewers = getViewers(ticketId);
  for (const res of clients) {
    sendToClient(res, viewers);
  }
}

// Remove entries that haven't heartbeated in 35 s
setInterval(() => {
  const now = Date.now();
  for (const [ticketId, map] of store) {
    let changed = false;
    for (const [userId, entry] of map) {
      if (now - entry.lastSeen > 35_000) {
        map.delete(userId);
        changed = true;
      }
    }
    if (changed) broadcast(ticketId);
    if (map.size === 0) store.delete(ticketId);
  }
}, 20_000);
