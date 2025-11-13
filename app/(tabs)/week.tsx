import { useLocalSearchParams, useRouter } from "expo-router";
import { DateTime } from "luxon";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

  // demo events per day (replace with real events from expandRecurrences)
  const eventsByDay = useMemo((): Record<string, DemoEvent[]> => {
    return days.reduce<Record<string, DemoEvent[]>>((acc, d, idx) => {
      const day = d; // DateTime at startOf('day')
      const iso = d.toISODate();
      if (!iso) {
        return acc; // skip invalid dates
      }
      acc[iso] = [
        {
          id: `m-${idx}-1`,
          title: "Meeting",
          start: day.plus({ hours: 9 + (idx % 2), minutes: 0 }),
          end: day.plus({ hours: 10, minutes: 0 }),
        },
        {
          id: `m-${idx}-2`,
          title: "Call",
          start: day.plus({ hours: 12, minutes: 30 }),
          end: day.plus({ hours: 13, minutes: 15 }),
        },
        {
          id: `m-${idx}-3`,
          title: "Review",
          start: day.plus({ hours: 15, minutes: 0 }),
          end: day.plus({ hours: 16, minutes: 0 }),
        },
      ];
      return acc;
    }, {});
  }, [days]);

  // compute positioned events for rendering
  const positionedByDay = useMemo(() => {
    const out: Record<string, Array<DemoEvent & { top: number; height: number }>> = {};
    for (const d of days) {
      const key = d.toISODate();
      if (!key) continue; // <- guard: 避免 key 为 null 导致类型错误

      const evs = eventsByDay[key] ?? [];
      out[key] = evs.map((ev) => {
        const startHour = ev.start.hour + ev.start.minute / 60;
        const durationHours = Math.max(0.25, ev.end.diff(ev.start, "minutes").minutes / 60); // 最小 15 分钟
        const top = startHour * HOUR_HEIGHT;
        const height = Math.max(24, durationHours * HOUR_HEIGHT);
        return { ...ev, top, height };
      });
    }
    return out;
  }, [days, eventsByDay]);

  return (
    <View style={styles.container}>
      {/* header: week range */}
      <View style={styles.header}>
        <Text style={styles.title}>Week of {weekStart.toFormat("LLL dd, yyyy")}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { height: 56, justifyContent: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 18, fontWeight: "600" },

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
