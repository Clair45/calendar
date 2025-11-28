import { DateTime } from "luxon";
import { rrulestr } from "rrule";

//定义输入事件
export interface InputEvent {
  id: string;
  title: string;
  dtstart: string; // ISO字符串（本地浮动时间，例如 "2025-11-01T17:45:00"）
  dtend?: string;
  rrule?: string;
  exdate?: string[];
  rdate?: string[];
  timezone?: string;
  [key: string]: any;
}

//事件实例接口 - 展开后的具体事件实例
export interface EventInstance {
  id: string;
  originalId: string;
  title: string;
  start: DateTime;
  end: DateTime;
  [key: string]: any;
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

  for (const ev of events) {
    // 1. 解析为本地时间（获取墙上时间的年/月/日/时/分）
    const localStart = DateTime.fromISO(ev.dtstart, { setZone: false });
    const localEnd = ev.dtend
      ? DateTime.fromISO(ev.dtend, { setZone: false })
      : localStart.plus({ hours: 1 });
    const duration = localEnd.diff(localStart);

    // 2. 构造“伪 UTC”时间 (Fake UTC)
    // 目的：让 RRULE 只处理纯数字时间（如 17:45），忽略时区/DST 变化
    const utcStart = DateTime.utc(
      localStart.year,
      localStart.month,
      localStart.day,
      localStart.hour,
      localStart.minute,
      localStart.second
    );

    // Helper: 将 RRULE 生成的“伪 UTC”还原回“本地墙上时间”
    const pushInstance = (fakeUtcDate: Date) => {
      // 把 Date 当作 UTC 解析，提取年/月/日/时/分
      const u = DateTime.fromJSDate(fakeUtcDate, { zone: "utc" });
      
      // 用提取的数字构造本地时间 (保持 17:45 不变)
      const occStart = DateTime.local(
        u.year,
        u.month,
        u.day,
        u.hour,
        u.minute,
        u.second
      );
      const occEnd = occStart.plus(duration);

      // 范围检查
      if (occEnd <= rangeStart || occStart >= rangeEnd) return;

      const instanceId = `${ev.id}::${occStart.toISO()}`;
      instances.push({
        ...ev, // 继承父事件其它属性
        id: instanceId,
        originalId: ev.id,
        title: ev.title,
        start: occStart,
        end: occEnd,
      });
    };

    if (ev.rrule) {
      try {
        // 传入“伪 UTC”给 RRULE
        const rule = rrulestr(ev.rrule, { dtstart: utcStart.toJSDate() } as any) as any;

        if (typeof rule.between === "function") {
          // 这里的 range 也需要转为 UTC 范围进行比较，或者简单地取大范围
          // 为简单起见，这里让 rule 生成所有可能，pushInstance 内部再做精确过滤
          // (或者把 rangeStart/End 转为 Fake UTC 传入以提高性能)
          const fakeRangeStart = DateTime.utc(rangeStart.year, rangeStart.month, rangeStart.day).minus({ days: 1 }).toJSDate();
          const fakeRangeEnd = DateTime.utc(rangeEnd.year, rangeEnd.month, rangeEnd.day).plus({ days: 1 }).toJSDate();
          
          const occs = rule.between(fakeRangeStart, fakeRangeEnd, true);
          for (const d of occs) pushInstance(d);
        } else if (typeof rule.all === "function") {
          const occs = rule.all();
          for (const d of occs) pushInstance(d);
        }
      } catch (e) {
        console.warn("RRULE parse error", e);
      }
    } else {
      // 非重复事件：直接使用 localStart
      if (!(localEnd <= rangeStart || localStart >= rangeEnd)) {
        instances.push({
          ...ev,
          id: ev.id,
          originalId: ev.id,
          title: ev.title,
          start: localStart,
          end: localEnd,
        });
      }
    }

    // 处理 RDATE (也按墙上时间处理)
    if (ev.rdate && ev.rdate.length) {
      for (const r of ev.rdate) {
        try {
          const rLocal = DateTime.fromISO(r, { setZone: false });
          const rUtc = DateTime.utc(rLocal.year, rLocal.month, rLocal.day, rLocal.hour, rLocal.minute, rLocal.second);
          pushInstance(rUtc.toJSDate());
        } catch {}
      }
    }

    // 处理 EXDATE (按墙上时间字符串匹配)
    if (ev.exdate && ev.exdate.length) {
      // exdate 里的字符串已经是无 offset 的 ISO (如 "2025-11-02T17:45:00")
      const exSet = new Set(ev.exdate.map((s) => DateTime.fromISO(s, { setZone: false }).toISO({ includeOffset: false })));
      
      for (let i = instances.length - 1; i >= 0; i--) {
        if (instances[i].originalId === ev.id) {
          // 比较生成的实例的墙上时间 ISO
          const iso = instances[i].start.toISO({ includeOffset: false });
          if (iso && exSet.has(iso)) {
            instances.splice(i, 1);
          }
        }
      }
    }
  }

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