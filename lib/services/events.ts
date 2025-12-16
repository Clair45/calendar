import AsyncStorage from "@react-native-async-storage/async-storage";
import { DateTime } from "luxon";

export type EventRecord = {
  id: string;
  title?: string;
  dtstart: string; // ISO
  dtend?: string; // ISO
  rrule?: string;
  exdate?: string[]; // ISO dates
  rdate?: string[]; // ISO
  timezone?: string;
  notes?: string;
  // 新增可选字段，用于提醒偏移（单位：分钟），兼容 string/number/null
  alertOffset?: number | string | null;
  // 若代码中使用 originalId / parentId，也一并声明
  originalId?: string | null;
  parentId?: string | null;
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
export async function getEventsBetween(
  startISO: string,
  endISO: string
) {
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
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

// 新增：覆盖所有事件（用于导入功能）
export async function replaceAllEvents(newEvents: EventRecord[]): Promise<void> {
  try {
    // 1. 写入存储
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newEvents));
    // 2. 通知所有订阅者（useEvents 会收到通知并更新 UI）
    notify(newEvents); 
  } catch (e) {
    console.error("Failed to replace events", e);
    throw e;
  }
}

function notify(items: EventRecord[]) {
  listeners.forEach((cb) => {
    try {
      cb(items);
    } catch (err) {
      console.error("listener callback error", err);
    }
  });
}