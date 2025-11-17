import { useRouter } from "expo-router";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { Button, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useEvents } from '../../lib/hooks/useEvents';
import EventDetail from '../components/EventDetail';
import EventFormModal from '../components/EventFormModal';
import { expandRecurrences, groupByDate, InputEvent } from "../utils/recurrence";

/**
 * 生成月份日历矩阵（6行7列的日期网格）
 * @param monthDate - 当前月份日期
 * @param weekStartsOnMonday - 是否周一开始（默认true）
 * @returns 6x7的DateTime矩阵
 */
function generateMonthMatrix(monthDate: DateTime, weekStartsOnMonday = true) {
  const startOfMonth = monthDate.startOf("month");
  const start = weekStartsOnMonday
    ? startOfMonth.startOf("week") // luxon默认周一开始
    : startOfMonth.startOf("week");

  const matrix: DateTime[][] = [];
  let cur = start;
  for (let week = 0; week < 6; week++) {
    const row: DateTime[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(cur);
      cur = cur.plus({ days: 1 });
    }
    matrix.push(row);
  }
  return matrix;
}

export default function MonthView() {
   // 当前显示的月份状态（默认为当前月份）
   const [current, setCurrent] = useState<DateTime>(() => DateTime.local().startOf("month"));
   const [pickerVisible, setPickerVisible] = useState(false);
   const [pickerYear, setPickerYear] = useState<number>(current.year);
   const [showCreateModal, setShowCreateModal] = useState(false);
   const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  // 从持久化中读取事件
  const { items: storedEvents } = useEvents();
  const inputEvents = useMemo<InputEvent[]>(
    () =>
      (storedEvents ?? []).map((ev) => ({
        id: ev.id,
        title: ev.title,
        dtstart: ev.dtstart,
        dtend: ev.dtend,
        rrule: ev.rrule,
        exdate: ev.exdate,
        rdate: ev.rdate,
        timezone: ev.timezone,
      })),
    [storedEvents]
  );

  // 当前月份的日历矩阵
  const matrix = useMemo(() => generateMonthMatrix(current), [current]);
  const matrixStart = matrix[0][0].startOf("day");
  const matrixEnd = matrix[5][6].endOf("day");

  // 展开重复事件，获取在显示范围内的所有事件实例
  const instances = useMemo(() => expandRecurrences(inputEvents, matrixStart, matrixEnd), [inputEvents, matrixStart, matrixEnd]);
  const eventsByDate = useMemo(() => groupByDate(instances, "local"), [instances]); //按日期分组事件
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrent((c) => c.minus({ months: 1 }))} style={styles.navButton}>
          <Text>{"<"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setPickerYear(current.year); setPickerVisible(true); }}>
          <Text style={styles.title}>{current.toFormat("LLLL yyyy")}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setCurrent((c) => c.plus({ months: 1 }))} style={styles.navButton}>
          <Text>{">"}</Text>
        </TouchableOpacity>

        {/* Add button (右上) */}
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={{ padding: 6 }}>
            <Text style={styles.addButton}>＋</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.weekDaysRow}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <Text key={d} style={styles.weekDay}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {matrix.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day) => {
              const key = day.toISODate();
              const dayEvents = key ? (eventsByDate?.[key] ?? []) : [];
              const inMonth = day.month === current.month;
              const isToday = day.hasSame(DateTime.local(), "day");
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.cell, !inMonth && styles.outsideCell]}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/day?date=${encodeURIComponent(String(key))}`)}
                >
                  <Text style={[styles.dayNumber, isToday && styles.today]}>{day.day}</Text>
                  {dayEvents.slice(0, 2).map((e) => (
                    <TouchableOpacity key={e.start.toISO()} onPress={() => setSelectedEvent(e)} activeOpacity={0.8}>
                      <Text numberOfLines={1} style={styles.eventText}>{e.title}</Text>
                    </TouchableOpacity>
                  ))}
                  {dayEvents.length > 2 && <Text style={styles.moreText}>+{dayEvents.length - 2} more</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
  {/* 底部：回到今天按钮 */}
      <View style={styles.footer}>
        <Button title="Today" onPress={() => setCurrent(DateTime.local().startOf("month"))} />
      </View>

      <Modal
        visible={pickerVisible}
        animationType="slide"
        // use transparent modal on web, full-screen native modal on mobile for reliable touch handling
        transparent={Platform.OS === 'web'}
        onRequestClose={() => setPickerVisible(false)}
      >
  <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.pickerHeader}>Select Year and Month</Text>
            <View style={styles.pickerRow}>
              <View style={styles.yearColumn}> 
                <ScrollView keyboardShouldPersistTaps="always">
                  {Array.from({ length: 41 }).map((_, i) => {
                    const y = current.year - 20 + i; // 当前年份前后各20年
                    const selected = y === pickerYear;
                    return (
                      <TouchableOpacity key={y} style={[styles.yearItem, selected && styles.yearItemSelected]} onPress={() => setPickerYear(y)}>
                        <Text style={selected ? styles.yearTextSelected : styles.yearText}>{String(y)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 月份选择列 */}
              <View style={styles.monthColumn}>
                {Array.from({ length: 12 }).map((_, m) => {
                  const monthName = DateTime.local().set({ month: m + 1 }).toFormat('LLL');
                  return (
                    <TouchableOpacity
                      key={m}
                      style={styles.monthItem}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      onPress={() => {
                        // 更新当前显示日期为选中的年份和月份的第一天
                        setCurrent(DateTime.local().set({ year: pickerYear, month: m + 1, day: 1 }).startOf('month'));
                        setPickerVisible(false);
                      }}
                    >
                      <Text style={styles.monthText}>{monthName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <Button title="Close" onPress={() => setPickerVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>
      <EventFormModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} initialDate={current} />
      {/* 事件详情弹窗（查看 / 编辑 / 删除） */}
      <EventDetail visible={selectedEvent !== null} event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </View>
  );
}

// 样式定义
const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  navButton: { padding: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  weekDaysRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 6 },
  weekDay: { width: `${100 / 7}%`, textAlign: "center", color: "#666" },
  grid: { flexDirection: "column", flex: 1 },
  weekRow: { flexDirection: "row", flex: 1 },
  cell: { flex: 1, borderWidth: 0.5, borderColor: "#eee", padding: 6, minHeight: 0, justifyContent: "flex-start" },
  outsideCell: { backgroundColor: "#fafafa", opacity: 0.8 },
  dayNumber: { fontSize: 12, color: "#333" },
  today: { color: "#007bff", fontWeight: "700" },
  eventText: { fontSize: 12, color: "#222" },
  moreText: { fontSize: 12, color: "#777" },
  footer: { paddingTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  pickerHeader: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  pickerRow: { flexDirection: 'row' },
  yearColumn: { width: '35%', borderRightWidth: 1, borderRightColor: '#eee', paddingRight: 8 },
  yearItem: { paddingVertical: 8, paddingHorizontal: 6 },
  yearItemSelected: { backgroundColor: '#007bff', borderRadius: 4 },
  yearText: { fontSize: 14, color: '#333' },
  yearTextSelected: { fontSize: 14, color: '#fff', fontWeight: '600' },
  monthColumn: { flex: 1, paddingLeft: 8, flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'space-between' },
  monthItem: { width: '30%', paddingVertical: 10, alignItems: 'center', marginBottom: 8, borderRadius: 6, backgroundColor: '#f7f7f7' },
  monthText: { fontSize: 14, color: '#222' },
  headerRight: { position: 'absolute', right: 12, top: 12 },
  addButton: { fontSize: 22, color: '#007bff' },
});