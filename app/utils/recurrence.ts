import { DateTime } from "luxon";
import { rrulestr } from "rrule";

//定义输入事件
export interface InputEvent {
  id: string;
  title: string;      // 标题
  dtstart: string;   // 开始时间（ISO字符串）
  dtend?: string;   // 结束时间（ISO字符串）
  rrule?: string;  // 重复规则（RRULE格式）
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

    // 2. 构造“伪 UTC”时间 忽略时区/DST 变化
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
      // 提取年/月/日/时/分
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

    // 处理 EXDATE
    if (ev.exdate && ev.exdate.length) {
      const exSet = new Set(ev.exdate.map((s) => DateTime.fromISO(s, { setZone: false }).toISO({ includeOffset: false })));
      
      for (let i = instances.length - 1; i >= 0; i--) {
        if (instances[i].originalId === ev.id) {
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