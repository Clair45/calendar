import DateTimePicker from "@react-native-community/datetimepicker";
import { DateTime } from "luxon";
import { useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Props = {
  start: DateTime | null;
  end: DateTime | null;
  onChange: (args: { start: DateTime; end: DateTime }) => void;
  allDay?: boolean;
};

const { height: SCREEN_H } = Dimensions.get("window");
const TIME_ITEM_HEIGHT = 40;
const VISIBLE_TIME_ITEMS = 7;

function buildTimeOptions(): string[] {
  const list: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      list.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return list;
}
const TIME_OPTIONS = buildTimeOptions();

export default function InlineDateTimePicker({ start, end, onChange }: Props) {
  const iosOrAndroid = Platform.OS !== "web";

  const handleWebChange = (value: string, which: "start" | "end") => {
    if (!value) return;
    const dt = DateTime.fromISO(value);
    if (!dt.isValid) return;
    if (which === "start") onChange({ start: dt, end: end ?? dt.plus({ minutes: 30 }) });
    else onChange({ start: start ?? dt.minus({ minutes: 30 }), end: dt });
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>开始</Text>
        {Platform.OS === "web" ? (
          <TextInput
            style={styles.input}
            value={
              start
                ? start.toISO({ suppressMilliseconds: true, includeOffset: false }).slice(0, 16)
                : ""
            }
            onChangeText={(v) => handleWebChange(v, "start")}
            placeholder="YYYY-MM-DDTHH:mm"
          />
        ) : (
          <TouchableOpacity style={styles.inputBtn}>
            <Text style={styles.inputText}>{start ? start.toFormat("yyyy-LL-dd HH:mm") : "选择开始时间"}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>结束</Text>
        {Platform.OS === "web" ? (
          <TextInput
            style={styles.input}
            value={end ? end.toISO({ suppressMilliseconds: true, includeOffset: false }).slice(0, 16) : ""}
            onChangeText={(v) => handleWebChange(v, "end")}
            placeholder="YYYY-MM-DDTHH:mm"
          />
        ) : (
          <TouchableOpacity style={styles.inputBtn}>
            <Text style={styles.inputText}>{end ? end.toFormat("yyyy-LL-dd HH:mm") : "选择结束时间"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {iosOrAndroid && start && end && (
        <View>
          <DateTimePicker
            value={start.toJSDate()}
            mode="datetime"
            display="default"
            onChange={(_, d) => {
              if (!d) return;
              const s = DateTime.fromJSDate(d);
              const newEnd = end < s ? s.plus({ hours: 1 }) : end;
              onChange({ start: s, end: newEnd });
            }}
          />
          <DateTimePicker
            value={end.toJSDate()}
            mode="datetime"
            display="default"
            onChange={(_, d) => {
              if (!d) return;
              const e = DateTime.fromJSDate(d);
              onChange({ start: start, end: e });
            }}
          />
        </View>
      )}
    </View>
  );
}

/* 导出可复用的内联小日历与内联时间滚轮组件，API 与原来 EventFormModal 中一致 */
export function CalendarPicker({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: DateTime;
  onPick: (d: DateTime) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState<DateTime>(() => value.startOf("month"));
  useEffect(() => setMonth(value.startOf("month")), [value]);

  const startWeek = month.startOf("month").startOf("week");
  const days: DateTime[] = [];
  for (let i = 0; i < 42; i++) days.push(startWeek.plus({ days: i }));

  if (!visible) return null;
  return (
    <View style={styles.calendarInline}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={() => setMonth((m) => m.minus({ months: 1 }))}><Text>{"<"}</Text></TouchableOpacity>
        <Text style={styles.calendarTitle}>{month.toFormat("LLLL yyyy")}</Text>
        <TouchableOpacity onPress={() => setMonth((m) => m.plus({ months: 1 }))}><Text>{">"}</Text></TouchableOpacity>
      </View>

      <View style={styles.weekDays}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <Text key={w} style={styles.weekDayText}>{w}</Text>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {days.map((d) => {
          const inMonth = d.hasSame(month, "month");
          const isSelected = d.hasSame(value, "day");
          return (
            <TouchableOpacity
              key={d.toISODate()}
              style={[styles.dayCell, !inMonth && styles.dayCellMuted, isSelected && styles.dayCellSel]}
              onPress={() => onPick(d)}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSel]}>{d.day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ alignItems: "flex-end", marginTop: 8 }}>
        <TouchableOpacity onPress={onClose}><Text style={{ color: "#007bff" }}>取消</Text></TouchableOpacity>
      </View>
    </View>
  );
}

export function TimePicker({
  visible,
  which,
  base,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  which: "start" | "end";
  base: DateTime;
  onConfirm: (d: DateTime) => void;
  onClose: () => void;
}) {
  const timeScrollRef = useRef<ScrollView | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(() => {
    const t = base;
    const hhmm = `${String(t.hour).padStart(2, "0")}:${String(Math.floor(t.minute / 5) * 5).padStart(2, "0")}`;
    const idx = TIME_OPTIONS.indexOf(hhmm);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    if (!visible) return;
    const idx = selectedIdx;
    setTimeout(() => {
      if (timeScrollRef.current) {
        timeScrollRef.current.scrollTo({
          y: Math.max(0, idx - Math.floor(VISIBLE_TIME_ITEMS / 2)) * TIME_ITEM_HEIGHT,
          animated: false,
        });
      }
    }, 50);
  }, [visible, selectedIdx]);

  function handleScrollEnd(e: any) {
    const y = e.nativeEvent.contentOffset.y ?? 0;
    const mid = Math.floor(VISIBLE_TIME_ITEMS / 2);
    const idx = Math.round(y / TIME_ITEM_HEIGHT) + mid;
    const clamped = Math.max(0, Math.min(TIME_OPTIONS.length - 1, idx));
    setSelectedIdx(clamped);
  }

  function confirmSelect() {
    const [hh, mm] = TIME_OPTIONS[selectedIdx].split(":").map((s) => parseInt(s, 10));
    const updated = base.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
    onConfirm(updated);
    onClose();
  }

  if (!visible) return null;
  return (
    <View style={[styles.timePickerInline, { maxHeight: Math.min(420, SCREEN_H * 0.7) }]}>
      <View style={styles.timePickerHeader}>
        <TouchableOpacity onPress={confirmSelect}>
          <Text style={{ color: "#007bff" }}>完成</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={(r) => (timeScrollRef.current = r)}
        showsVerticalScrollIndicator={false}
        snapToInterval={TIME_ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: (VISIBLE_TIME_ITEMS / 2) * TIME_ITEM_HEIGHT }}
      >
        {TIME_OPTIONS.map((t, i) => (
          <TouchableOpacity
            key={t}
            activeOpacity={0.7}
            onPress={() => {
              setSelectedIdx(i);
              if (timeScrollRef.current) {
                timeScrollRef.current.scrollTo({
                  y: Math.max(0, i - Math.floor(VISIBLE_TIME_ITEMS / 2)) * TIME_ITEM_HEIGHT,
                  animated: true,
                });
              }
            }}
          >
            <View style={[styles.timeItem, { height: TIME_ITEM_HEIGHT }, i === selectedIdx && styles.timeItemSel]}>
              <Text style={[styles.timeItemText, i === selectedIdx && styles.timeItemTextSel]}>{t}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  label: { width: 56, color: "#444" },
  input: { flex: 1, borderWidth: 1, borderColor: "#eee", padding: 8, borderRadius: 6 },
  inputBtn: { flex: 1, padding: 10, borderRadius: 6, backgroundColor: "#f6f6f6" },
  inputText: { color: "#222" },

  // 新增：面板外层统一 wrapper（供外部文件使用）
  panelWrap: { width: "100%", paddingTop: 8 },

  calendarInline: { width: "100%", backgroundColor: "#fff", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#eee", marginTop: -30 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  calendarTitle: { fontWeight: "600" },
  weekDays: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 6 },
  weekDayText: { width: 40, textAlign: "center", color: "#666", fontSize: 12 },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", paddingTop: 8 },
  dayCell: { width: 40, height: 40, alignItems: "center", justifyContent: "center", margin: 2, borderRadius: 6 },
  dayCellMuted: { opacity: 0.4 },
  dayCellSel: { backgroundColor: "#007bff" },
  dayText: { color: "#333" },
  dayTextSel: { color: "#fff", fontWeight: "600" },

  timePickerInline: { width: "100%", backgroundColor: "#fff", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#eee" },
  timePickerHeader: { padding: 8, alignItems: "flex-end" },
  timeItem: { alignItems: "center", justifyContent: "center" },
  timeItemText: { fontSize: 16 },
  timeItemSel: { backgroundColor: "#eef6ff" },
  timeItemTextSel: { color: "#007bff", fontWeight: "700" },
});
// 导出样式供其它组件复用，保持外观一致
export const pickerStyles = styles;