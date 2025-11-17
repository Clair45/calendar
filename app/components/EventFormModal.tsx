import { DateTime } from "luxon";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useEvents } from "../../lib/hooks/useEvents";

type Props = {
  visible: boolean;
  onClose: () => void;
  initialDate?: DateTime;
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

export default function EventFormModal({ visible, onClose, initialDate }: Props) {
  const { create } = useEvents();

  // 计算默认开始时间：把 DateTime.local() 放到 useMemo 内，确保依赖只和 initialDate 变化相关
  const defaultStart = useMemo(() => {
    const now = DateTime.local();
    const baseDate = initialDate ? initialDate.startOf("day") : now.startOf("day");
    const base = baseDate.plus({ hours: now.hour });
    return base.startOf("hour");
  }, [initialDate]);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState<DateTime>(defaultStart);
  const [end, setEnd] = useState<DateTime>(defaultStart.plus({ hours: 1 }));
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");

  // 是否已选定日期（若没有 initialDate 则要求用户先选）
  const [datePicked, setDatePicked] = useState<boolean>(!!initialDate);
  // 控制哪一项正在显示内联日历：null | 'start' | 'end'
  const [showCalendarFor, setShowCalendarFor] = useState<null | "start" | "end">(null);
   const [showTimePicker, setShowTimePicker] = useState<null | "start" | "end">(null);
   const timeScrollRef = useRef<ScrollView | null>(null);
 
   const canCreate = title.trim().length > 0;
 
   useEffect(() => {
     if (visible) {
       setTitle("");
       setLocation("");
       const s = defaultStart;
       setStart(s);
       setEnd(s.plus({ hours: 1 }));
       setRecurrence("none");
      // 若没有传入 initialDate，强制先选择开始日期（显示内联日历）
      if (!initialDate) {
        setDatePicked(false);
        setShowCalendarFor("start");
      } else {
        setDatePicked(true);
        setShowCalendarFor(null);
      }
     }
   }, [visible, defaultStart]);
 
   const invalidTime = end.toMillis() <= start.toMillis(); // 结束不得早于或等于开始

   async function onCreate() {
     if (!canCreate) return;
     if (invalidTime) {
       Alert.alert("结束时间无效", "结束时间必须晚于开始时间。请选择合理的结束时间。", [
         { text: "返回修改", style: "cancel" },
         {
           text: "重置为开始后5分钟",
           onPress: () => {
             setEnd(start.plus({ minutes: 5 }));
           },
         },
       ]);
       return;
     }

     const rrule =
       recurrence === "none"
         ? undefined
         : recurrence === "daily"
         ? "FREQ=DAILY"
         : recurrence === "weekly"
         ? "FREQ=WEEKLY"
         : "FREQ=MONTHLY";

     await create({
       title: title.trim(),
       dtstart: start.toISO(),
       dtend: end.toISO(),
       rrule,
       exdate: [],
       rdate: [],
       timezone: start.zoneName,
       notes: "",
     } as any);

     onClose();
   }

  // 指定为 start / end 的日期选择（不改变时间部分）
  function pickDate(date: DateTime, which: "start" | "end") {
    if (which === "start") {
      setStart((s) => s.set({ year: date.year, month: date.month, day: date.day }));
    } else {
      setEnd((e) => e.set({ year: date.year, month: date.month, day: date.day }));
    }
    setDatePicked(true);
    setShowCalendarFor(null);
  }

  function openTimePicker(which: "start" | "end") {
    if (!datePicked) {
      // 强制先选日期
      setShowCalendarFor("start");
      return;
    }
    setShowTimePicker(which);
    setTimeout(() => {
      const t = which === "start" ? start : end;
      const hhmm = `${String(t.hour).padStart(2, "0")}:${String(Math.floor(t.minute / 5) * 5).padStart(2, "0")}`;
      const idx = TIME_OPTIONS.indexOf(hhmm);
      if (idx >= 0 && timeScrollRef.current) {
        timeScrollRef.current.scrollTo({
          y: Math.max(0, idx - Math.floor(VISIBLE_TIME_ITEMS / 2)) * TIME_ITEM_HEIGHT,
          animated: false,
        });
      }
    }, 100);
  }

  function onTimeScrollEnd(e: any, which: "start" | "end") {
    const y = e.nativeEvent.contentOffset.y ?? 0;
    const mid = Math.floor(VISIBLE_TIME_ITEMS / 2);
    const idx = Math.round(y / TIME_ITEM_HEIGHT) + mid;
    const clamped = Math.max(0, Math.min(TIME_OPTIONS.length - 1, idx));
    const [hh, mm] = TIME_OPTIONS[clamped].split(":").map((s) => parseInt(s, 10));
    // 只修改当天的时分，不允许改变日期
    const baseDate = which === "start" ? start : end;
    const updated = baseDate.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
    if (which === "start") {
      setStart(updated);
      // 若 start >= end，自动把 end 设置为 start + 5 分钟，但也保证不跨天（cap 到当天 23:59）
      if (updated.toMillis() >= end.toMillis()) {
        const candidate = updated.plus({ minutes: 5 });
        const endOfDay = updated.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
        setEnd(candidate.day !== updated.day ? endOfDay : candidate);
      }
    } else {
      // 对 end 的选择只修改当日时间，不自动把 start 移到前一天
      setEnd(updated);
      // 不再自动调整 start 到 updated 之前，交由 invalidTime 处理并提示用户
    }
  }
  
  function incHour(delta: number, which: "start" | "end") {
    // 使用直接设置小时的方法，避免使用 plus 导致日期变化
    if (which === "start") {
      let newHour = start.hour + delta;
      if (newHour < 0) newHour = 0;
      if (newHour > 23) newHour = 23;
      const ns = start.set({ hour: newHour });
      setStart(ns);
      // 若 start >= end，调整 end 为 start + 5 分钟，且不跨天
      if (ns.toMillis() >= end.toMillis()) {
        const candidate = ns.plus({ minutes: 5 });
        const endOfDay = ns.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
        setEnd(candidate.day !== ns.day ? endOfDay : candidate);
      }
    } else {
      let newHour = end.hour + delta;
      if (newHour < 0) newHour = 0;
      if (newHour > 23) newHour = 23;
      const ne = end.set({ hour: newHour });
      setEnd(ne);
    }
  }

  // 小日历内联面板（渲染在 start/end 区块下方）
  function CalendarPicker({ visible, value, onPick, onClose }: { visible: boolean; value: DateTime; onPick: (d: DateTime) => void; onClose: () => void }) {
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

  function TimePicker({ visible, which, onClose }: { visible: boolean; which: "start" | "end"; onClose: () => void }) {
     const [selectedIdx, setSelectedIdx] = useState<number>(() => {
       const t = which === "start" ? start : end;
       const hhmm = `${String(t.hour).padStart(2, "0")}:${String(Math.floor(t.minute / 5) * 5).padStart(2, "0")}`;
       const idx = TIME_OPTIONS.indexOf(hhmm);
       return idx >= 0 ? idx : 0;
     });
 
     // 当打开或 which 变化时滚动到当前索引
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
     }, [visible, which]);
 
     function handleScrollEnd(e: any) {
       const y = e.nativeEvent.contentOffset.y ?? 0;
       const mid = Math.floor(VISIBLE_TIME_ITEMS / 2);
       const idx = Math.round(y / TIME_ITEM_HEIGHT) + mid;
       const clamped = Math.max(0, Math.min(TIME_OPTIONS.length - 1, idx));
       setSelectedIdx(clamped);
     }
 
     function confirmSelect() {
       const [hh, mm] = TIME_OPTIONS[selectedIdx].split(":").map((s) => parseInt(s, 10));
       const baseDate = which === "start" ? start : end;
       const updated = baseDate.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
       if (which === "start") {
         setStart(updated);
         if (updated.toMillis() >= end.toMillis()) {
           const candidate = updated.plus({ minutes: 5 });
           const endOfDay = updated.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
           setEnd(candidate.day !== updated.day ? endOfDay : candidate);
         }
       } else {
         setEnd(updated);
       }
      setShowTimePicker(null);
      onClose();
    }

    if (!visible) return null;
    // 内联时间滚轮，渲染在对应字段下方
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
 
  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" style={styles.headerBtn}>
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>新建日程</Text>
              <TouchableOpacity
                onPress={onCreate}
                accessibilityRole="button"
                style={[styles.headerBtn, (!canCreate || invalidTime) && styles.disabledBtn]}
                disabled={!canCreate}
              >
                <Text style={[styles.createText, (!canCreate || invalidTime) && styles.disabledText]}>添加</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Text style={styles.label}>标题（必填）</Text>
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="事件标题" />

              <Text style={styles.label}>地点（可选）</Text>
              <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="地点" />

              <Text style={styles.label}>开始 / 结束</Text>

              {/* 垂直排列：先选择开始日期/时间，再选择结束日期/时间（适配手机） */}
              <View style={styles.verticalGroup}>
                <View style={styles.verticalItem}>
                  <Text style={styles.smallLabel}>开始</Text>
                  <View style={styles.timeControlRow}>
                    <View style={styles.sideButtons}>
                      <TouchableOpacity onPress={() => incHour(-1, "start")} style={styles.smallBtn}><Text>-1h</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => incHour(1, "start")} style={styles.smallBtn}><Text>+1h</Text></TouchableOpacity>
                    </View>
                    <View style={styles.centerControls}>
                      <TouchableOpacity onPress={() => setShowCalendarFor("start")} style={styles.dateBtnFull}>
                        <Text>{start.toFormat("yyyy-LL-dd")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openTimePicker("start")} style={styles.timeDisplayFull} disabled={!datePicked}>
                        <Text style={[styles.timeTextBig, invalidTime && styles.invalidText]}>{start.toFormat("HH:mm")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.verticalItem}>
                  <Text style={styles.smallLabel}>结束</Text>
                  <View style={styles.timeControlRow}>
                    <View style={styles.sideButtons}>
                      <TouchableOpacity onPress={() => incHour(-1, "end")} style={styles.smallBtn}><Text>-1h</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => incHour(1, "end")} style={styles.smallBtn}><Text>+1h</Text></TouchableOpacity>
                    </View>
                    <View style={styles.centerControls}>
                      <TouchableOpacity onPress={() => setShowCalendarFor("end")} style={styles.dateBtnFull}>
                        <Text>{end.toFormat("yyyy-LL-dd")}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openTimePicker("end")} style={styles.timeDisplayFull} disabled={!datePicked}>
                        <Text style={[styles.timeTextBig, invalidTime && styles.invalidText]}>{end.toFormat("HH:mm")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                {/* 内联面板：在对应字段下方显示日历或时间滚轮 */}
                {showCalendarFor === "start" && (
                  <View style={{ width: "100%", paddingTop: 8 }}>
                    <CalendarPicker
                      visible={true}
                      value={start}
                      onPick={(d): void => pickDate(d, "start")}
                      onClose={(): void => setShowCalendarFor(null)}
                    />
                  </View>
                )}
                {showTimePicker === "start" && (
                  <View style={{ width: "100%", paddingTop: 8 }}>
                    <TimePicker
                      visible={true}
                      which="start"
                      onClose={(): void => setShowTimePicker(null)}
                    />
                  </View>
                )}
                {showCalendarFor === "end" && (
                  <View style={{ width: "100%", paddingTop: 8 }}>
                    <CalendarPicker
                      visible={true}
                      value={end}
                      onPick={(d): void => pickDate(d, "end")}
                      onClose={(): void => setShowCalendarFor(null)}
                    />
                  </View>
                )}
                {showTimePicker === "end" && (
                  <View style={{ width: "100%", paddingTop: 8 }}>
                    <TimePicker
                      visible={true}
                      which="end"
                      onClose={(): void => setShowTimePicker(null)}
                    />
                  </View>
                )}
               </View>
 
               {invalidTime && <Text style={styles.errorText}>结束时间必须晚于开始时间</Text>}

               <Text style={styles.label}>重复</Text>
               <View style={styles.row}>
                 {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                   <TouchableOpacity
                     key={r}
                     onPress={() => setRecurrence(r)}
                     style={[styles.recurrenceBtn, recurrence === r && styles.recurrenceSelected]}
                   >
                     <Text style={recurrence === r ? styles.recurrenceTextSel : styles.recurrenceText}>
                       {r === "none" ? "无" : r === "daily" ? "每天" : r === "weekly" ? "每周" : "每月"}
                     </Text>
                   </TouchableOpacity>
                 ))}
               </View>
             </View>
           </View>
         </View>
       </Modal>
 
       <CalendarPicker
         visible={showCalendarFor !== null}
         value={start}
         onPick={(d) => pickDate(d, showCalendarFor!)}
         onClose={() => setShowCalendarFor(null)}
       />
       <TimePicker visible={showTimePicker !== null} which={(showTimePicker as any) || "start"} onClose={() => setShowTimePicker(null)} />
     </>
   );
 }
 
 const styles = StyleSheet.create({
   backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
   sheet: { flex: 1, marginTop: 60, backgroundColor: "#fff", borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 24, overflow: "hidden" },
   header: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
   headerBtn: { padding: 8 },
   headerTitle: { fontSize: 16, fontWeight: "600" },
   cancelText: { color: "#444" },
   createText: { color: "#007bff", fontWeight: "600" },
   disabledBtn: { opacity: 0.4 },
   disabledText: { color: "#999" },
 
   content: { paddingHorizontal: 16, paddingTop: 8 },
   label: { marginTop: 12, color: "#444", fontSize: 13 },
   input: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8, fontSize: 15 },
 
   row: { flexDirection: "row", marginTop: 8, alignItems: "center", justifyContent: "space-between" },
   timeBox: { flex: 1, alignItems: "center" },
   timeBtn: { padding: 6, borderRadius: 6, borderWidth: 1, borderColor: "#eee", marginVertical: 6, marginHorizontal: 6 },
   dateBtn: { padding: 8, borderRadius: 6, borderWidth: 1, borderColor: "#eee", marginHorizontal: 6 },
   timeDisplay: { padding: 8, borderRadius: 6, borderWidth: 1, borderColor: "#eee", marginHorizontal: 6 },
   /* 新增：垂直布局样式，适配手机屏幕 */
   verticalGroup: { flexDirection: "column", gap: 8, marginTop: 6 },
   verticalItem: { paddingVertical: 6 },
   timeControlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
   sideButtons: { width: 88, flexDirection: "column", justifyContent: "space-between", alignItems: "center" },
   smallBtn: { padding: 6, borderRadius: 6, borderWidth: 1, borderColor: "#eee", width: 64, alignItems: "center", marginVertical: 4 },
   centerControls: { flex: 1, alignItems: "center" },
   dateBtnFull: { padding: 10, borderRadius: 6, borderWidth: 1, borderColor: "#eee", width: "90%", alignItems: "center", marginBottom: 8 },
   timeDisplayFull: { padding: 10, borderRadius: 6, borderWidth: 1, borderColor: "#eee", width: "90%", alignItems: "center" },
 
   timeText: { fontSize: 13 },
   timeTextBig: { fontSize: 16, fontWeight: "600" },
 
   smallLabel: { fontSize: 12, color: "#666" },
 
   recurrenceBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: "#eee", marginRight: 8 },
   recurrenceSelected: { backgroundColor: "#007bff" },
   recurrenceText: { color: "#333" },
   recurrenceTextSel: { color: "#fff" },
 
   errorText: { color: "#c00", marginTop: 8 },
 
   pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" },
   calendar: { width: 320, backgroundColor: "#fff", borderRadius: 10, padding: 12 },
   /* 内联日历样式（放在字段下方，宽度适配容器） */
   calendarInline: { width: "100%", backgroundColor: "#fff", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#eee", marginTop: -30},
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
   calendarFooter: { marginTop: 8, alignItems: "flex-end" },
 
   timePicker: { width: 200, backgroundColor: "#fff", borderRadius: 10, overflow: "hidden" },
   /* 内联时间滚轮样式 */
   timePickerInline: { width: "100%", backgroundColor: "#fff", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#eee" },
   timePickerHeader: { padding: 8, alignItems: "flex-end" },
   timeItem: { alignItems: "center", justifyContent: "center" },
   timeItemText: { fontSize: 16 },
   timeItemSel: { backgroundColor: "#eef6ff" },
   timeItemTextSel: { color: "#007bff", fontWeight: "700" },
 
   invalidText: { textDecorationLine: "line-through", color: "#c00" },
 });