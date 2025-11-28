import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEvents } from '../../lib/hooks/useEvents';
import EventDetail from '../components/EventDetail';
import EventFormModal from '../components/EventFormModal';
import { expandRecurrences } from '../utils/recurrence';

const HOUR_HEIGHT = 80; // px per hour

export default function DayView() {
  const { date } = useLocalSearchParams();
  const router = useRouter();
  const { items: storedEvents } = useEvents();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const selected = useMemo(() => {
    try {
      return date ? DateTime.fromISO(String(date)) : DateTime.local();
    } catch {
      return DateTime.local();
    }
  }, [date]);

  const dayStart = selected.startOf('day');
  const dayEnd = selected.endOf('day');

  // 一周起点与周条（用于在日视图顶部显示周 7 天）
  const weekStart = selected.startOf('week');
  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => weekStart.plus({ days: i }).startOf('day')),
    [weekStart]
  );

  const dayEvents = useMemo(() => {
    try {
      const input = (storedEvents ?? []).map((ev) => ({
        id: ev.id,
        // 确保 title 始终为 string，避免传入 undefined
        title: ev.title ?? 'Event',
        dtstart: ev.dtstart,
        dtend: ev.dtend,
        rrule: ev.rrule,
        exdate: ev.exdate,
        rdate: ev.rdate,
        timezone: ev.timezone,
        location: (ev as any).location ?? '',
      }));
      const locMap: Record<string, string> = {};
      for (const ev of input) if (ev.id) locMap[ev.id] = ev.location ?? '';

      // 扩展范围以包含前一天开始但延续到今日的事件
      const instances = expandRecurrences(input, dayStart.minus({ days: 1 }), dayEnd.plus({ days: 1 })) ?? [];

      const toDT = (v: any) => ((DateTime as any).isDateTime?.(v) ? v : DateTime.fromISO(String(v)));

      // 归一并裁剪到当前 day 的显示区间（保证跨天事件在今日显示当天片段）
      return (instances ?? [])
        .map((ins: any) => {
          const start = toDT(ins.start ?? ins.dtstart);
          const end = ins.end ?? ins.dtend ? toDT(ins.end ?? ins.dtend) : start.plus({ minutes: 30 });
          const parentId = (ins as any).originalId ?? (ins as any).id;
          return {
            id: ins.id ?? `${ins.title}-${ins.start}`,
            title: ins.title ?? 'Event',
            start,
            end,
            location: (ins as any).location ?? locMap[parentId] ?? '',
          };
        })
        // 过滤与当日有交集的事件
        .filter((ev: any) => ev.start < dayEnd && ev.end > dayStart)
        // 裁剪到当天显示区间
        .map((ev: any) => {
          const clippedStart = ev.start < dayStart ? dayStart : ev.start;
          const clippedEnd = ev.end > dayEnd ? dayEnd : ev.end;
          return { ...ev, start: clippedStart, end: clippedEnd };
        });
    } catch {
      // fallback to non-repeat events
    }

    return (storedEvents ?? [])
      .map((ev) => {
        const s = DateTime.fromISO(ev.dtstart);
        const e = ev.dtend ? DateTime.fromISO(ev.dtend) : s;
        return { id: ev.id, title: ev.title, start: s, end: e, location: (ev as any).location ?? '' };
      })
      .filter((ev) => ev.start < dayEnd && ev.end > dayStart)
      .map((ev) => {
        const clippedStart = ev.start < dayStart ? dayStart : ev.start;
        const clippedEnd = ev.end > dayEnd ? dayEnd : ev.end;
        return { ...ev, start: clippedStart, end: clippedEnd };
      });
  }, [storedEvents, dayStart, dayEnd]);

  const positionedEvents = useMemo(() => {
    // 1. 按开始时间排序
    const sorted = [...dayEvents].sort((a, b) => a.start.toMillis() - b.start.toMillis());

    // 2. 分组重叠事件 (Cluster) 并分配列 (Column)
    const clusters: any[][] = [];
    let currentCluster: any[] = [];
    let clusterEnd = -1;

    for (const ev of sorted) {
      const startMs = ev.start.toMillis();
      const endMs = ev.end.toMillis();

      // 如果当前事件开始时间早于当前簇的结束时间，说明有重叠（或连带重叠）
      if (currentCluster.length > 0 && startMs < clusterEnd) {
        currentCluster.push(ev);
        clusterEnd = Math.max(clusterEnd, endMs);
      } else {
        if (currentCluster.length > 0) clusters.push(currentCluster);
        currentCluster = [ev];
        clusterEnd = endMs;
      }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    const result: any[] = [];

    // 3. 计算每个事件的布局位置
    for (const cluster of clusters) {
      // 简单的列分配算法 (First Fit)
      const columns: number[] = []; // 记录每一列最后一个事件的结束时间

      for (const ev of cluster) {
        let placed = false;
        // 尝试放入已有的列
        for (let i = 0; i < columns.length; i++) {
          if (columns[i] <= ev.start.toMillis()) {
            columns[i] = ev.end.toMillis();
            (ev as any).colIndex = i;
            placed = true;
            break;
          }
        }
        // 放不下则开启新列
        if (!placed) {
          columns.push(ev.end.toMillis());
          (ev as any).colIndex = columns.length - 1;
        }
      }

      const totalCols = columns.length;
      for (const ev of cluster) {
        const top = (ev.start.hour + ev.start.minute / 60) * HOUR_HEIGHT;
        const durationHours = Math.max(0.25, (ev.end.diff(ev.start, 'minutes').minutes || 15) / 60);
        const height = Math.max(24, durationHours * HOUR_HEIGHT);
        
        // 计算宽度和左边距百分比
        const colIndex = (ev as any).colIndex || 0;
        const widthPct = 100 / totalCols;
        const leftPct = colIndex * widthPct;

        result.push({ ...ev, top, height, leftPct, widthPct });
      }
    }
    return result;
  }, [dayEvents]);

  const scrollRef = useRef<ScrollView | null>(null);
  const [nowTop, setNowTop] = useState<number | null>(null);

  // scroll to "now" when viewing today 
  useMemo(() => {
    const isToday = selected.hasSame(DateTime.local(), 'day');
    if (!isToday) {
      setNowTop(null);
      return;
    }
    const now = DateTime.local();
    const top = (now.hour + now.minute / 60 + now.second / 3600) * HOUR_HEIGHT;
    setNowTop(top);
    if (scrollRef.current) {
      const offset = Math.max(0, top - HOUR_HEIGHT * 3);
      // @ts-ignore
      scrollRef.current.scrollTo({ y: offset, animated: true });
    }
  }, [selected]);

  return (
    <View style={styles.container}>
      {/* 顶部：月份/操作 行 */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.push('/month')} style={styles.monthBackButton}>
          <Text style={styles.monthBackText}>{selected.toFormat('LLLL yyyy')}</Text>
        </TouchableOpacity>
        <View style={styles.rightControls}>
          <TouchableOpacity onPress={() => router.push(`/week?date=${selected.toISODate()}`)} style={styles.headerAction} accessibilityRole="button">
            <Text style={styles.headerActionText}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.headerAction} accessibilityRole="button">
            <Text style={styles.addButton}>＋</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 周条：显示当前周的 7 天（点击跳转到对应的日视图） */}
      <View style={styles.weekStrip}>
        {days.map((d) => {
          const key = d.toISODate();
          const isSel = d.hasSame(selected, 'day');
          return (
            <TouchableOpacity
              key={key}
              style={[styles.weekDay, isSel && styles.weekDaySelected]}
              onPress={() => router.push(`/day?date=${key}`)}
              accessibilityRole="button"
            >
              <Text style={[styles.weekDayText, isSel && styles.weekDayTextSelected]}>{d.toFormat('ccc')}</Text>
              <Text style={[styles.weekDayNumber, isSel && styles.weekDayNumberSelected]}>{d.day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView ref={scrollRef} style={styles.timelineScroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ height: 24 * HOUR_HEIGHT, flexDirection: 'row', position: 'relative' }}>
          <View style={styles.hoursColumn}>
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
              </View>
            ))}
          </View>

          <View style={styles.eventsArea}>
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={[styles.hourSlot, { height: HOUR_HEIGHT }]} />
            ))}

            {positionedEvents.map((ev) => (
              <TouchableOpacity
                key={ev.id + '-' + ev.start.toISO()}
                activeOpacity={0.85}
                onPress={() => setSelectedEvent(ev)}
                // 动态设置 left 和 width，实现并列排放
                style={[
                  styles.eventBlock,
                  {
                    top: ev.top,
                    height: ev.height,
                    left: `${ev.leftPct}%`,
                    width: `${ev.widthPct}%`,
                  },
                ]}
              >
                <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                {ev.location ? <Text style={styles.eventLocation} numberOfLines={1}>{ev.location}</Text> : null}
                <Text style={styles.eventTime} numberOfLines={1}>{ev.start.toFormat('HH:mm')} - {ev.end.toFormat('HH:mm')}</Text>
              </TouchableOpacity>
            ))}
            <EventDetail visible={selectedEvent !== null} event={selectedEvent} onClose={() => setSelectedEvent(null)} />

            {nowTop !== null && selected.hasSame(DateTime.local(), 'day') && (
              <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]} />
            )}
          </View>

          {nowTop !== null && selected.hasSame(DateTime.local(), 'day') && (
            <>
              <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]} />
              <View pointerEvents="none" style={[styles.nowLabel, { top: Math.max(0, nowTop - 10) }]}>
                <Text style={styles.nowLabelText}>{DateTime.local().toFormat('HH:mm')}</Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <EventFormModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} initialDate={selected} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  weekStrip: { height: 72, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee' },
  weekDay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weekDaySelected: { backgroundColor: '#f0f8ff' },
  weekDayText: { fontSize: 12, color: '#666' },
  weekDayTextSelected: { color: '#007bff', fontWeight: '600' },
  weekDayNumber: { fontSize: 16, marginTop: 4 },
  weekDayNumberSelected: { color: '#007bff', fontWeight: '700' },
  timelineScroll: { flex: 1 },
  hoursColumn: { width: 80, backgroundColor: '#fff' },
  hourRow: { alignItems: 'flex-end', paddingRight: 8 },
  hourLabel: { color: '#999', fontSize: 12 },
  eventsArea: { flex: 1, position: 'relative', paddingLeft: 8, paddingRight: 12 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#ff3b30', zIndex: 50 },
  nowLabel: { position: 'absolute', left: 64, minWidth: 56, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#ff3b30', zIndex: 60 },
  nowLabelText: { color: '#ff3b30', fontWeight: '700', fontSize: 12 },
  hourSlot: { borderTopWidth: 1, borderTopColor: '#f2f2f2' },

  // 修改 eventBlock 样式：移除固定的 left/right，改由内联样式控制
  eventBlock: {
    position: 'absolute',
    // left: 8, right: 8,  <-- 移除这些固定值
    backgroundColor: '#007bff',
    borderRadius: 4,
    padding: 4,
    zIndex: 10,
    opacity: 0.9,
    borderWidth: 1,
    borderColor: '#fff', // 增加白边区分并列事件
  },
  eventTitle: { color: '#fff', fontWeight: '600', fontSize: 13 },
  eventLocation: { color: '#eaf4ff', fontSize: 11, marginTop: 2, opacity: 0.95 },
  eventTime: { color: '#eaf4ff', fontSize: 11, marginTop: 2 },

  headerRow: { height: 44, justifyContent: 'center', paddingLeft: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  monthBackButton: { paddingVertical: 6, paddingHorizontal: 8 },
  monthBackText: { fontSize: 16, fontWeight: '600', color: '#007bff' },
  rightHeaderBtn: { position: 'absolute', right: 12, top: 8, padding: 8 },
  rightControls: { position: 'absolute', right: 12, top: 6, flexDirection: 'row', alignItems: 'center' },
  headerAction: { marginLeft: 8, padding: 6 },
  headerActionText: { color: '#007bff', fontWeight: '600' },
  addButton: { fontSize: 22, color: '#007bff' },
});