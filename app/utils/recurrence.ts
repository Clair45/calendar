import { DateTime } from "luxon";
import { rrulestr } from "rrule";

//定义输入事件
export interface InputEvent {
  id: string;
  title: string;
  dtstart: string; // ISO开始时间
  dtend?: string; // ISO结束时间
  rrule?: string; // RFC5545 RRULE（重复规则）
  exdate?: string[]; // 排除日期
  rdate?: string[]; // 附加日期
  allDay?: boolean;
  timezone?: string; // 时区（本地）
}

//事件实例接口 - 展开后的具体事件实例
export interface EventInstance {
  // id 对应实例（instance id），originalId 指向原始父事件 id
  id: string;
  originalId: string;
  title: string;
  start: DateTime;
  end: DateTime;
}

/**
 * 将带有RRULE/RDATE/EXDATE的事件展开为指定时间范围内的具体实例
 * 使用luxon进行时区感知解析，使用rrule进行重复规则展开
 * @param events - 输入事件数组
 * @param rangeStart - 范围开始时间
 * @param rangeEnd - 范围结束时间
 * @returns 在指定时间范围内的具体事件实例数组
 */
export function expandRecurrences(
  events: InputEvent[],
  rangeStart: DateTime,
  rangeEnd: DateTime
): EventInstance[] {

  const instances: EventInstance[] = [];

  // 遍历所有输入事件
  for (const ev of events) {
    const zone = ev.timezone || "local"; //时区默认为本地时区
    const dtstart = DateTime.fromISO(ev.dtstart, { zone });
    const dtend = ev.dtend? DateTime.fromISO(ev.dtend, { zone })
                          : dtstart.plus({ hours: 1 });
    const duration = dtend.diff(dtstart);

    // Helper function 推送单个事件实例到结果数组(instances)
    const pushInstance = (occDate: Date) => {
      const occStart = DateTime.fromJSDate(occDate, { zone });
      const occEnd = occStart.plus(duration);
      // overlap check with range
      if (occEnd <= rangeStart || occStart >= rangeEnd) return;
      // 实例 id 使用父 id + occurrence 时间，避免与父事件 id 冲突
      const instanceId = `${ev.id}::${occStart.toISO()}`;
      instances.push({ id: instanceId, originalId: ev.id, title: ev.title, start: occStart, end: occEnd });
    };
 
    // 重复事件 - 使用RRULE展开
    if (ev.rrule) {
      try {
        // 解析重复规则字符串，提供基准开始时间
        const rule = rrulestr(ev.rrule, { dtstart: dtstart.toJSDate() } as any) as any;
        // Get occurrences within [rangeStart, rangeEnd]
        if (typeof rule.between === "function") {
          const occs = rule.between(rangeStart.toJSDate(), rangeEnd.toJSDate(), true);
          for (const d of occs) pushInstance(d);
        } else if (typeof rule.all === "function") {
          // fallback
          const occs = rule.all();
          for (const d of occs) {
            if (d >= rangeStart.toJSDate() && d <= rangeEnd.toJSDate()) pushInstance(d);
          }
        }
      } catch {
        // 如果解析失败，跳过该事件的重复展开
      }
    } else {
      // 单次事件：直接检查范围
      if (!(dtend <= rangeStart || dtstart >= rangeEnd)) {
        // 对于非重复事件，instance id 与 originalId 均为父 id（兼容原逻辑）
        instances.push({ id: ev.id, originalId: ev.id, title: ev.title, start: dtstart, end: dtend });
      }
    }
 
    // 处理额外日期 (RDATE)
    if (ev.rdate && ev.rdate.length) {
      for (const r of ev.rdate) {
        try {
          const d = DateTime.fromISO(r, { zone }).toJSDate();
          pushInstance(d);
        } catch {}
      }
    }
 
    // 处理排除日期 (EXDATE)
    if (ev.exdate && ev.exdate.length) {
      const exSet = new Set(ev.exdate.map((s) => DateTime.fromISO(s, { zone }).toISO()));
      // 反向遍历 移除属于当前事件且开始时间匹配排除日期的事件实例
      for (let i = instances.length - 1; i >= 0; i--) {
        // instances[i].originalId 对应父 id（单次事件 originalId === id）
        if (instances[i].originalId === ev.id) {
          const iso = instances[i].start.toISO();
          if (exSet.has(iso)) instances.splice(i, 1);
        }
      }
    }
  }
 
  // Sort instances by start
  instances.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  return instances;
}

/**
 * 按日期对事件实例进行分组
 * @param instances - 事件实例数组
 * @param zone - 时区（默认为本地时区）
 * @returns 按日期分组的对象，键为ISO日期字符串（如'2025-11-05'）
 */
export function groupByDate(instances: EventInstance[], zone = "local") {
  const map: Record<string, EventInstance[]> = {};
  for (const inst of instances) {
    const key = inst.start.setZone(zone).toISODate();
    if (key == null) continue; // skip invalid dates
    if (!map[key]) map[key] = [];
    map[key].push(inst);
  }
  return map;
}

export default expandRecurrences;
