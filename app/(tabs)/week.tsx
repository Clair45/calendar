import { useLocalSearchParams, useRouter } from "expo-router";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useEvents } from '../../lib/hooks/useEvents';
import EventFormModal from '../components/EventFormModal';
import { expandRecurrences, groupByDate, InputEvent } from "../utils/recurrence";

const HOUR_HEIGHT = 80;

type DemoEvent = {
  id: string;
  title: string;
  start: DateTime;
  end: DateTime;
};

export default function WeekView() {
  const params = useLocalSearchParams() as { date?: string | string[] | undefined };
  const router = useRouter();
  const { items: storedEvents } = useEvents();
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  // 使用持久化事件并展开重复，按日期分组
  const instances = useMemo(() => {
    const input: InputEvent[] = (storedEvents ?? []).map((ev) => ({
      id: ev.id,
      title: ev.title,
      dtstart: ev.dtstart,
      dtend: ev.dtend,
      rrule: ev.rrule,
      exdate: ev.exdate,
      rdate: ev.rdate,
      timezone: ev.timezone,
    }));
    const rangeStart = weekStart.startOf('day');
    const rangeEnd = weekStart.plus({ days: 6 }).endOf('day');
    return expandRecurrences(input, rangeStart, rangeEnd);
  }, [storedEvents, weekStart]);

  const eventsByDate = useMemo(() => groupByDate(instances, 'local'), [instances]);

  // compute positioned events for rendering
  const positionedByDay = useMemo(() => {
    const out: Record<string, Array<DemoEvent & { top: number; height: number }>> = {};
    for (const d of days) {
      const key = d.toISODate();
      if (!key) continue; // <- guard: 避免 key 为 null 导致类型错误

      const evs = (eventsByDate[key] ?? []).map((x) => ({
        id: x.id,
        title: x.title,
        start: DateTime.fromISO(x.start),
        end: DateTime.fromISO(x.end),
      })) as DemoEvent[];
      out[key] = evs.map((ev) => {
        const startHour = ev.start.hour + ev.start.minute / 60;
        const durationHours = Math.max(0.25, ev.end.diff(ev.start, "minutes").minutes / 60); // 最小 15 分钟
        const top = startHour * HOUR_HEIGHT;
        const height = Math.max(24, durationHours * HOUR_HEIGHT);
        return { ...ev, top, height };
      });
    }
    return out;
  }, [days, eventsByDate]);

  return (
    <View style={styles.container}>
      {/* header: week range */}
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
          {/* hours column */}
          <View style={styles.hoursColumn}>
            {Array.from({ length: 24 }).map((_, h) => (
              <View key={h} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{String(h).padStart(2, "0")}:00</Text>
              </View>
            ))}
          </View>

          {/* 7 day columns */}
          <View style={styles.daysRow}>
            {days.map((d) => {
              const key = d.toISODate() ?? d.toISO() ?? `day-${d.toMillis()}`; // 保证为 string
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
                      <View key={ev.id} style={[styles.eventBlock, { top: ev.top, height: ev.height }]}>
                        <Text style={styles.eventTitle}>{ev.title}</Text>
                        <Text style={styles.eventTime}>
                          {ev.start.toFormat("HH:mm")} - {ev.end.toFormat("HH:mm")}
                        </Text>
                      </View>
                    ))}
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

  eventBlock: { position: "absolute", left: 6, right: 6, backgroundColor: "#007bff", borderRadius: 6, padding: 6, zIndex: 10, opacity: 0.95 },
  eventTitle: { color: "#fff", fontWeight: "600", fontSize: 12 },
  eventTime: { color: "#eaf4ff", fontSize: 11, marginTop: 4 },
});
