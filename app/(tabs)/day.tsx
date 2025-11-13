import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEvents } from '../../lib/hooks/useEvents';
import EventFormModal from '../components/EventFormModal';
import { expandRecurrences } from '../utils/recurrence';

const HOUR_HEIGHT = 80; // px per hour

/**
 * 日视图组件 - 显示单日的时间轴和事件安排
 */
export default function DayView() {
  const { date } = useLocalSearchParams();
  const router = useRouter();
  const { items: storedEvents, loading } = useEvents();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const selected = useMemo(() => {
    try {
      return date ? DateTime.fromISO(String(date)) : DateTime.local();
    } catch {
      return DateTime.local();
    }
  }, [date]);

  const dayStart = selected.startOf('day');
  const dayEnd = selected.endOf('day');

  const dayEvents = useMemo(() => {
    // 优先使用 expandRecurrences（如果存在），这样会处理 RRULE/EXDATE/RDATE
    try {
      if (typeof expandRecurrences === 'function') {
        // 统一把存储事件映射为 utils/recurrence 接受的 InputEvent（string 字段）
        const input = (storedEvents ?? []).map((ev) => ({
          id: ev.id,
          title: ev.title,
          dtstart: ev.dtstart,
          dtend: ev.dtend,
          rrule: ev.rrule,
          exdate: ev.exdate,
          rdate: ev.rdate,
          timezone: ev.timezone,
        }));

        // 传入 DateTime 范围（与 month/week 保持一致）
        const instances = expandRecurrences(input, dayStart, dayEnd);

        // 规范化实例：实例的 start/end 可能为 ISO 字符串或 DateTime，统一转为 DateTime
        return instances
          .map((ins: any) => {
            const start =
              (DateTime as any).isDateTime?.(ins.start) ?? false ? ins.start : DateTime.fromISO(String(ins.start));
            const end =
              (DateTime as any).isDateTime?.(ins.end) ?? false ? ins.end : DateTime.fromISO(String(ins.end));
            return {
              id: ins.id ?? `${ins.title}-${ins.start}`,
              title: ins.title ?? 'Event',
              start,
              end,
            };
          })
          // 确保仅保留在当天范围内的实例（使用 toMillis 比较）
          .filter((ev: any) => !(ev.start.toMillis() > dayEnd.toMillis() || ev.end.toMillis() < dayStart.toMillis()));
      }
    } catch (e) {
      // 如果 expandRecurrences 出错，退回到简单过滤
    }

    // fallback: 只处理非重复事件（简单过滤），并用 toMillis 做比较
    return (storedEvents ?? [])
      .map((ev) => {
        const s = DateTime.fromISO(ev.dtstart);
        const e = ev.dtend ? DateTime.fromISO(ev.dtend) : s;
        return { id: ev.id, title: ev.title, start: s, end: e };
      })
      .filter((ev) => !(ev.start.toMillis() > dayEnd.toMillis() || ev.end.toMillis() < dayStart.toMillis()));
  }, [storedEvents, dayStart, dayEnd]);

  // compute absolute positions for events
  const positionedEvents = useMemo(() => {
    return dayEvents.map((ev) => {
      const top = (ev.start.hour + ev.start.minute / 60) * HOUR_HEIGHT;
      const height = Math.max(12, (ev.end.diff(ev.start, 'minutes').minutes / 60) * HOUR_HEIGHT);
      return { ...ev, top, height };
    });
  }, [dayEvents]);

  // ref to timeline scroll view so we can scroll to current time
  const scrollRef = useRef<ScrollView | null>(null);
  const [nowTop, setNowTop] = useState<number | null>(null);

  useEffect(() => {
    const isToday = selected.hasSame(DateTime.local(), 'day');
    if (!isToday) {
      // clear any existing indicator when not today
      setNowTop(null);
      return;
    }

    // compute now position and scroll to it once on mount or when selected changes
    const computeNow = () => {
      const now = DateTime.local();
      const top = (now.hour + now.minute / 60 + now.second / 3600) * HOUR_HEIGHT;
      setNowTop(top);
      // scroll so that now is a bit below top (some padding)
      if (scrollRef.current) {
        const offset = Math.max(0, top - HOUR_HEIGHT * 3);
        // @ts-ignore - react-native ScrollView typing for scrollTo
        scrollRef.current.scrollTo({ y: offset, animated: true });
      }
    };

    computeNow();
    // update every 30 seconds so the line moves
    const id = setInterval(computeNow, 30 * 1000);
    return () => clearInterval(id);
  }, [selected]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.push('/month')} style={styles.monthBackButton}>
          <Text style={styles.monthBackText}>{selected.toFormat('LLLL yyyy')}</Text>
        </TouchableOpacity>

        {/* Week button (if exists) */}
        <TouchableOpacity onPress={() => router.push(`/week?date=${selected.toISODate()}`)} style={styles.rightHeaderBtn}>
          <Text style={{ color: '#007bff', fontWeight: '600' }}>Week</Text>
        </TouchableOpacity>

        {/* Add event button (右上 +) */}
        <TouchableOpacity onPress={() => setShowCreateModal(true)} style={[styles.rightHeaderBtn, { marginRight: 12 }]}>
          <Text style={{ fontSize: 22, color: '#007bff' }}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Week strip */}
      <View style={styles.weekStrip}>
        {Array.from({ length: 7 }).map((_, i) => {
          const d = selected.startOf('week').plus({ days: i });
          const isSelected = d.hasSame(selected, 'day');
          return (
            <TouchableOpacity key={d.toISODate()} style={[styles.weekDay, isSelected && styles.weekDaySelected]} onPress={() => router.push(`/day?date=${d.toISODate()}`)}>
              <Text style={[styles.weekDayText, isSelected && styles.weekDayTextSelected]}>{d.toFormat('ccc')}</Text>
              <Text style={[styles.weekDayNumber, isSelected && styles.weekDayNumberSelected]}>{d.day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 时间轴区域（可滚动） */}
      <ScrollView ref={scrollRef} style={styles.timelineScroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ height: 24 * HOUR_HEIGHT, flexDirection: 'row', position: 'relative' }}>
          {/* 小时标签列 */}
          <View style={styles.hoursColumn}>
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
              </View>
            ))}
          </View>

          {/* 事件显示区域（使用绝对定位） */}
          <View style={styles.eventsArea}>
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={[styles.hourSlot, { height: HOUR_HEIGHT }]} />
            ))}

            {positionedEvents.map((ev) => (
              <View key={ev.id} style={[styles.eventBlock, { top: ev.top, height: ev.height }]}>
                <Text style={styles.eventTitle}>{ev.title}</Text>
                <Text style={styles.eventTime}>{ev.start.toFormat('HH:mm')} - {ev.end.toFormat('HH:mm')}</Text>
              </View>
            ))}
            {/* current time indicator */}
            {nowTop !== null && selected.hasSame(DateTime.local(), 'day') && (
              <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]} />
            )}
          </View>
          {/* global now-line + label placed relative to the full timeline row so label can sit to left */}
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
  eventBlock: { position: 'absolute', left: 8, right: 8, backgroundColor: '#007bff', borderRadius: 6, padding: 8, zIndex: 10, opacity: 0.95 },
  eventTitle: { color: '#fff', fontWeight: '600' },
  eventTime: { color: '#eaf4ff', fontSize: 12, marginTop: 4 },
  headerRow: { height: 44, justifyContent: 'center', paddingLeft: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  monthBackButton: { paddingVertical: 6, paddingHorizontal: 8 },
  monthBackText: { fontSize: 16, fontWeight: '600', color: '#007bff' },
  rightHeaderBtn: { position: 'absolute', right: 12, top: 8, padding: 8 },
});
