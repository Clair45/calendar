import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useEvents } from "../../lib/hooks/useEvents";

type Props = {
  visible: boolean;
  onClose: () => void;
  initialDate?: DateTime;
};

export default function EventFormModal({ visible, onClose, initialDate }: Props) {
  const { create } = useEvents();
  const now = DateTime.local();

  const defaultStart = useMemo(() => {
    const base = initialDate ? initialDate.startOf("day").plus({ hours: now.hour }) : now;
    return base.startOf("hour");
  }, [initialDate, now]);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState<DateTime>(defaultStart);
  const [end, setEnd] = useState<DateTime>(defaultStart.plus({ hours: 1 }));
  const [recurrence, setRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const canCreate = title.trim().length > 0;

  useEffect(() => {
    if (visible) {
      setTitle("");
      setLocation("");
      const s = defaultStart;
      setStart(s);
      setEnd(s.plus({ hours: 1 }));
      setRecurrence("none");
    }
  }, [visible, defaultStart]);

  async function onCreate() {
    if (!canCreate) return;
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
      // id will be created by useEvents.create internally
    } as any); // create expects Omit<EventRecord,'id'>
    onClose();
  }

  function incHour(delta: number, which: "start" | "end") {
    if (which === "start") {
      const ns = start.plus({ hours: delta });
      // 保证 start < end
      setStart(ns);
      // 使用毫秒比较 DateTime（或 ns.toMillis() / end.toMillis()）
      if (ns.toMillis() >= end.toMillis()) {
        setEnd(ns.plus({ hours: 1 }));
      }
    } else {
      setEnd(end.plus({ hours: delta }));
    }
  }

  return (
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
              style={[styles.headerBtn, !canCreate && styles.disabledBtn]}
              disabled={!canCreate}
            >
              <Text style={[styles.createText, !canCreate && styles.disabledText]}>添加</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.label}>标题（必填）</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="事件标题" />

            <Text style={styles.label}>地点（可选）</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="地点" />

            <Text style={styles.label}>开始 / 结束</Text>
            <View style={styles.row}>
              <View style={styles.timeBox}>
                <Text style={styles.smallLabel}>开始</Text>
                <TouchableOpacity onPress={() => incHour(-1, "start")} style={styles.timeBtn}>
                  <Text>-1h</Text>
                </TouchableOpacity>
                <Text style={styles.timeText}>{start.toFormat("yyyy-LL-dd HH:mm")}</Text>
                <TouchableOpacity onPress={() => incHour(1, "start")} style={styles.timeBtn}>
                  <Text>+1h</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.timeBox}>
                <Text style={styles.smallLabel}>结束</Text>
                <TouchableOpacity onPress={() => incHour(-1, "end")} style={styles.timeBtn}>
                  <Text>-1h</Text>
                </TouchableOpacity>
                <Text style={styles.timeText}>{end.toFormat("yyyy-LL-dd HH:mm")}</Text>
                <TouchableOpacity onPress={() => incHour(1, "end")} style={styles.timeBtn}>
                  <Text>+1h</Text>
                </TouchableOpacity>
              </View>
            </View>

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
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 24 },
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
  timeBtn: { padding: 6, borderRadius: 6, borderWidth: 1, borderColor: "#eee", marginVertical: 6 },
  timeText: { fontSize: 13 },

  smallLabel: { fontSize: 12, color: "#666" },

  recurrenceBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: "#eee", marginRight: 8 },
  recurrenceSelected: { backgroundColor: "#007bff" },
  recurrenceText: { color: "#333" },
  recurrenceTextSel: { color: "#fff" },
});