import { useLocalSearchParams, useRouter } from "expo-router";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useEvents } from '../../lib/hooks/useEvents';
import EventDetail from '../components/EventDetail';
import EventFormModal from '../components/EventFormModal';
import { expandRecurrences, groupByDate } from "../utils/recurrence";

const HOUR_HEIGHT = 80;

type DemoEvent = {
  id: string;
  title: string;
  start: DateTime;
  end: DateTime;
  location?: string;
  originalId: string; // <- 新增：与 EventInstance 对齐
};

export default function WeekView() {
  const params = useLocalSearchParams() as { date?: string | string[] | undefined };
  const router = useRouter();
  const { items: storedEvents } = useEvents();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const selected = useMemo(() => {
    try {
      const raw = Array.isArray(params.date) ? params.date[0] : params.date;
      return raw ? DateTime.fromISO(String(raw)) : DateTime.local();
    } catch {
      return DateTime.local();
    }
  }, [params.date]);

  const weekStart = selected.startOf("week");
  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => weekStart.plus({ days: i }).startOf("day")),
    [weekStart]
  );

  const instances = useMemo(() => {
    // 保留 location 字段并建立映射
    const input = (storedEvents ?? []).map((ev) => ({
      id: ev.id,
      title: ev.title,
      dtstart: ev.dtstart,
      dtend: ev.dtend,
      rrule: ev.rrule,
      exdate: ev.exdate,
      rdate: ev.rdate,
      timezone: ev.timezone,
      location: (ev as any).location ?? '',
    }));
    const rangeStart = weekStart.startOf('day');
    const rangeEnd = weekStart.plus({ days: 6 }).endOf('day');

    const locMap: Record<string, string> = {};
    for (const e of input) if (e.id) locMap[e.id] = e.location ?? '';

    const expanded = expandRecurrences(input, rangeStart, rangeEnd) ?? [];
    // expanded items may or may not contain location — fallback to locMap
    const toDT = (v: any) => ((DateTime as any).isDateTime?.(v) ? v : DateTime.fromISO(String(v)));
    return (expanded ?? []).map((ins: any) => {
      const s = toDT(ins.start ?? ins.dtstart);
      const e = ins.end ?? ins.dtend ? toDT(ins.end ?? ins.dtend) : s.plus({ minutes: 30 });
      const parentId = (ins as any).originalId ?? (ins as any).id;
      return {
        id: ins.id,
        title: ins.title,
        start: s,
        end: e,
        location: (ins as any).location ?? locMap[parentId] ?? '',
        originalId: parentId, // <- 填充 originalId
      } as DemoEvent;
    });
  }, [storedEvents, weekStart]);

  const eventsByDate = useMemo(() => groupByDate(instances, 'local'), [instances]);

  const positionedByDay = useMemo(() => {
    const out: Record<string, Array<DemoEvent & { top: number; height: number }>> = {};
    for (const d of days) {
      const key = d.toISODate();
      if (!key) continue;
      const dayStart = d.startOf("day");
      const dayEnd = d.endOf("day");

      // 找出与该日有时间交集的所有实例（包含跨天事件）
      const evs = (instances ?? []).filter((ev: any) => {
        // ev.start < dayEnd && ev.end > dayStart 说明有交集
        return ev.start < dayEnd && ev.end > dayStart;
      }) as DemoEvent[];

      out[key] = evs.map((ev) => {
        // 裁剪到当前 day 的可见区间
        const clippedStart = ev.start < dayStart ? dayStart : ev.start;
        const clippedEnd = ev.end > dayEnd ? dayEnd : ev.end;

        const startHour = clippedStart.hour + clippedStart.minute / 60 + clippedStart.second / 3600;
        const durationMins = Math.max(15, clippedEnd.diff(clippedStart, "minutes").minutes || 15);
        const durationHours = durationMins / 60;
        const top = startHour * HOUR_HEIGHT;
        const height = Math.max(40, durationHours * HOUR_HEIGHT);

        // 返回时覆盖 start/end 为裁剪后的时间，便于渲染时显示正确的时段（也保留原 location 等）
        return { ...ev, start: clippedStart, end: clippedEnd, top, height };
      });
    }
    return out;
  }, [days, instances]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Week of {weekStart.toFormat("LLL dd, yyyy")}</Text>
        <View style={styles.rightControlsHeader}>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.headerAction}>
            <Text style={styles.addButton}>＋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", minHeight: 24 * HOUR_HEIGHT }}>
          <View style={styles.hoursColumn}>
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{String(h).padStart(2, "0")}:00</Text>
              </View>
            ))}
          </View>

          <View style={styles.daysRow}>
            {days.map((d) => {
              const key = d.toISODate() ?? d.toISO() ?? `day-${d.toMillis()}`;
              const positioned = positionedByDay[key] ?? [];
              const isToday = d.hasSame(DateTime.local(), "day");
              return (
                <View key={key} style={[styles.dayColumn]}>
                  <TouchableOpacity
                    style={[styles.dayHeader, isToday && styles.todayHeader]}
                    onPress={() => router.push(`/day?date=${key}`)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.dayHeaderText}>{d.toFormat("ccc")}</Text>
                    <Text style={styles.dayHeaderNumber}>{d.day}</Text>
                  </TouchableOpacity>

                  <View style={styles.dayBody}>
                    {Array.from({ length: 24 }).map((_, h) => (
                      <View key={h} style={[styles.hourSlot, { height: HOUR_HEIGHT }]} />
                    ))}

                    {positioned.map((ev) => (
                      <TouchableOpacity key={ev.id + '-' + ev.start.toISO()} activeOpacity={0.85} onPress={() => setSelectedEvent(ev)} style={[styles.eventBlock, { top: ev.top, height: ev.height }]}>
                        <Text style={styles.eventTitle}>{ev.title}</Text>
                        {ev.location ? <Text style={styles.eventLocation} numberOfLines={1}>{ev.location}</Text> : null}
                        <Text style={styles.eventTime}>
                          {ev.start.toFormat("HH:mm")} - {ev.end.toFormat("HH:mm")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <EventDetail visible={selectedEvent !== null} event={selectedEvent} onClose={() => setSelectedEvent(null)} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <EventFormModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} initialDate={selected} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { height: 56, justifyContent: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 18, fontWeight: "600" },
  rightControlsHeader: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center' },
  headerAction: { padding: 6 },
  addButton: { fontSize: 22, color: '#007bff' },

  hoursColumn: { width: 80, backgroundColor: "#fff" },
  hourRow: { alignItems: "flex-end", paddingRight: 8 },
  hourLabel: { color: "#999", fontSize: 12 },

  daysRow: { flex: 1, flexDirection: "row" },
  dayColumn: { flex: 1, borderLeftWidth: 1, borderLeftColor: "#f2f2f2" },

  dayHeader: { height: 56, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "#eee" },
  todayHeader: { backgroundColor: "#f0f8ff" },
  dayHeaderText: { fontSize: 12, color: "#666" },
  dayHeaderNumber: { fontSize: 16, marginTop: 4 },

  dayBody: { position: "relative", flex: 1 },
  hourSlot: { borderTopWidth: 1, borderTopColor: "#f9f9f9" },

  eventBlock: { position: "absolute", left: 6, right: 6, backgroundColor: "#007bff", borderRadius: 6, padding: 8, zIndex: 10, opacity: 0.95 },
  eventTitle: { color: "#fff", fontWeight: "600", fontSize: 12 },
  eventLocation: { color: "#eaf4ff", fontSize: 11, opacity: 0.95, marginTop: 4 },
  eventTime: { color: "#eaf4ff", fontSize: 11, marginTop: 4 },
});