import AsyncStorage from "@react-native-async-storage/async-storage";
import { DateTime } from "luxon";

export type EventRecord = {
  id: string;
  title: string;
  dtstart: string; // ISO
  dtend?: string; // ISO
  rrule?: string;
  exdate?: string[]; // ISO dates
  rdate?: string[]; // ISO
  timezone?: string;
  notes?: string;
};

const STORAGE_KEY = "myapp:events:v1";
let listeners: Array<(items: EventRecord[]) => void> = [];

async function loadAll(): Promise<EventRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as EventRecord[];
  } catch {
    return [];
  }
}

async function saveAll(items: EventRecord[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  listeners.forEach((cb) => cb(items));
}

export async function getAllEvents() {
  return await loadAll();
}

export async function addEvent(ev: EventRecord) {
  const all = await loadAll();
  all.push(ev);
  await saveAll(all);
  return ev;
}

export async function updateEvent(id: string, patch: Partial<EventRecord>) {
  const all = await loadAll();
  const idx = all.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error("not found");
  all[idx] = { ...all[idx], ...patch };
  await saveAll(all);
  return all[idx];
}

export async function deleteEvent(id: string) {
  const all = await loadAll();
  const next = all.filter((x) => x.id !== id);
  await saveAll(next);
  return;
}

/** 简单范围查询（不展开 RRULE） */
export async function getEventsBetween(startISO: string, endISO: string) {
  const all = await loadAll();
  const start = DateTime.fromISO(startISO);
  const end = DateTime.fromISO(endISO);
  return all.filter((ev) => {
    const s = DateTime.fromISO(ev.dtstart);
    const e = ev.dtend ? DateTime.fromISO(ev.dtend) : s;
    return !(s > end || e < start);
  });
}

export function subscribe(cb: (items: EventRecord[]) => void) {
  listeners.push(cb);
  // return unsubscribe
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}