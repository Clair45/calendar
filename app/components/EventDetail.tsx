import { DateTime } from "luxon";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useEvents } from "../../lib/hooks/useEvents";
import InlineDateTimePicker, { CalendarPicker, TimePicker, pickerStyles } from "./InlineDateTimePicker";

export default function EventDetail({ visible, event, onClose }: Props) {
  const { items = [], update, remove } = useEvents();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [showDelOptions, setShowDelOptions] = useState(false);
  const [startDT, setStartDT] = useState<DateTime | null>(null);
  const [endDT, setEndDT] = useState<DateTime | null>(null);
  const [showCalendarFor, setShowCalendarFor] = useState<"start" | "end" | null>(null);
  const [showTimePicker, setShowTimePicker] = useState<"start" | "end" | null>(null);

  const invalidTime = Boolean(startDT && endDT && endDT.toMillis() <= startDT.toMillis());

  useEffect(() => {
    if (event) {
      setTitle(event.title ?? "");
      setLocation((event as any).location ?? "");
      setNotes((event as any).notes ?? "");
      setStartDT((DateTime as any).isDateTime?.(event.start) ? event.start : DateTime.fromISO(String(event.start ?? event.dtstart)));
      setEndDT((DateTime as any).isDateTime?.(event.end) ? event.end : DateTime.fromISO(String(event.end ?? event.dtend ?? event.start ?? event.dtstart)));
    } else {
      setTitle("");
      setLocation("");
      setNotes("");
      setStartDT(null);
      setEndDT(null);
    }
  }, [event]);

  // helper: determine parent id (original event id) for an instance
  const resolveParentId = (ev: any) => {
    const instOriginalId = ev?.originalId ?? ev?.parentId ?? null;
    const parsedParentFromId =
      typeof ev?.id === "string" && ev.id.includes("::") ? ev.id.split("::")[0] : null;
    return instOriginalId ?? parsedParentFromId ?? ev?.id;
  };

  async function handleSave() {
    if (invalidTime) {
      Alert.alert("结束时间无效", "结束时间必须晚于开始时间。请修改后保存。");
      return;
    }
    if (!event) return;
    const updatedFields: any = {
      title: title.trim(),
      location: location.trim(),
      notes,
    };
    if (startDT) updatedFields.dtstart = startDT.toISO();
    if (endDT) updatedFields.dtend = endDT.toISO();

    try {
      const parentId = resolveParentId(event);
      const parent = items.find((it: any) => it.id === parentId);

      if (parent && parentId !== event.id) {
        const payload = { ...(parent as any), ...updatedFields };
        await update(parent.id, payload);
      } else {
        const payload = { ...(event as any), ...updatedFields };
        await update(event.id, payload);
      }
    } catch (e: any) {
      console.warn("update error", e);
      Alert.alert("更新失败", String(e?.message ?? e));
    } finally {
      onClose();
    }
  }

  // 抽成函数复用：仅删除此次（把 occ 加入 parent.exdate，或回退删除实例）
  const handleDeleteSingleOccurrence = async () => {
    if (!event) return;
    try {
      const parentId = resolveParentId(event);
      const parent = items.find((it: any) => it.id === parentId);

      const occISO =
        event?.start
          ? (DateTime as any).isDateTime?.(event.start)
            ? event.start.toISO()
            : DateTime.fromISO(String(event.start)).toISO()
          : DateTime.fromISO(String(event?.dtstart ?? "")).toISO();

      if (parent && typeof update === "function") {
        const prevEx = Array.isArray(parent.exdate) ? parent.exdate : [];
        const newEx = Array.from(new Set([...prevEx, occISO]));
        await update(parent.id, { ...(parent as any), exdate: newEx });
      } else {
        // fallback: delete this id (for non-recurring)
        if (typeof remove === "function") await remove(event.id);
      }
    } catch (e) {
      console.warn("remove single occurrence error", e);
      Alert.alert("删除失败", String(e));
    } finally {
      setShowDelOptions(false);
      onClose();
    }
  };

  // 抽成函数复用：删除此及之后（截断 parent.rrule 的 UNTIL）
  const handleDeleteFutureOccurrences = async () => {
    if (!event) return;
    try {
      const parentId = resolveParentId(event);
      const parent = items.find((it: any) => it.id === parentId);

      const occStart = (DateTime as any).isDateTime?.(event.start)
        ? event.start
        : DateTime.fromISO(String(event.start ?? event.dtstart));

      if (parent && parent.rrule && typeof update === "function") {
        const until = occStart.minus({ seconds: 1 }).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
        let newRrule = String(parent.rrule);
        if (/UNTIL=/i.test(newRrule)) {
          newRrule = newRrule.replace(/UNTIL=[^;]*/i, `UNTIL=${until}`);
        } else {
          newRrule = `${newRrule};UNTIL=${until}`;
        }
        await update(parent.id, { ...(parent as any), rrule: newRrule });
      } else {
        // fallback: delete parent or this id
        if (typeof remove === "function") await remove(parent ? parent.id : event.id);
      }
    } catch (e) {
      console.warn("remove future occurrences error", e);
      Alert.alert("删除失败", String(e));
    } finally {
      setShowDelOptions(false);
      onClose();
    }
  };

  function confirmDelete() {
    if (!event) return;
    const parentId = resolveParentId(event);
    const parent = items.find((it: any) => it.id === parentId);
    const isRecurring = Boolean(parent && parent.rrule);

    if (!isRecurring) {
      if (Platform.OS === "web") {
        const ok = (window as any).confirm("确定要删除此事件吗？此操作不可撤销。");
        if (!ok) return;
        (async () => {
          try {
            if (typeof remove === "function") await remove(event.id);
          } catch (e) {
            console.warn("remove error", e);
            Alert.alert("删除失败", String(e));
          }
          onClose();
        })();
        return;
      }
      Alert.alert("删除事件", "确定要删除此事件吗？此操作不可撤销。", [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              if (typeof remove === "function") await remove(event.id);
            } catch (e) {
              console.warn("remove error", e);
            }
            onClose();
          },
        },
      ]);
      return;
    }

    // recurring
    if (Platform.OS === "web") {
      setShowDelOptions(true);
      return;
    }

    Alert.alert(
      "删除重复事件",
      "请选择删除范围：仅删除当前这一次，还是删除此及之后的所有重复？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "仅删除此次",
          onPress: handleDeleteSingleOccurrence,
        },
        {
          text: "删除此及之后",
          style: "destructive",
          onPress: handleDeleteFutureOccurrences,
        },
      ],
      { cancelable: true }
    );
  }

  const pickDate = (date: DateTime, which: "start" | "end") => {
    if (which === "start") {
      setStartDT(date);
      if (endDT && date.toMillis() >= endDT.toMillis()) {
        const candidate = date.plus({ minutes: 5 });
        const endOfDay = date.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
        setEndDT(candidate.day !== date.day ? endOfDay : candidate);
      }
    } else {
      setEndDT(date);
    }
    setShowCalendarFor(null);
  };

  if (!visible || !event) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Text style={styles.cancelText}>关闭</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>事件详情</Text>
            <View style={styles.headerBtn} />
          </View>

          <ScrollView style={styles.content}>
            <Text style={styles.label}>标题</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="事件标题" />

            <Text style={styles.label}>地点</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="地点" />

            <Text style={styles.label}>开始 / 结束</Text>
            <InlineDateTimePicker
              start={startDT ?? DateTime.local()}
              end={endDT ?? (startDT ? startDT.plus({ hours: 1 }) : DateTime.local().plus({ hours: 1 }))}
              onChange={({ start, end }) => {
                setStartDT(start);
                setEndDT(end);
              }}
              startInvalid={false}
              endInvalid={invalidTime}
            />
            {invalidTime && <Text style={styles.errorText}>结束时间必须晚于开始时间</Text>}
            {showCalendarFor === "start" && (
              <View style={pickerStyles.panelWrap}>
                <CalendarPicker
                  visible={true}
                  value={startDT ?? DateTime.local()}
                  onPick={(d): void => pickDate(d, "start")}
                  onClose={(): void => setShowCalendarFor(null)}
                />
              </View>
            )}
            {showTimePicker === "start" && (
              <View style={pickerStyles.panelWrap}>
                <TimePicker
                  visible={true}
                  which="start"
                  base={startDT ?? DateTime.local()}
                  onConfirm={(d) => {
                    setStartDT(d);
                    if (endDT && d.toMillis() >= endDT.toMillis()) {
                      const candidate = d.plus({ minutes: 5 });
                      const endOfDay = d.set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
                      setEndDT(candidate.day !== d.day ? endOfDay : candidate);
                    }
                  }}
                  onClose={(): void => setShowTimePicker(null)}
                />
              </View>
            )}
            {showCalendarFor === "end" && (
              <View style={pickerStyles.panelWrap}>
                <CalendarPicker
                  visible={true}
                  value={endDT ?? DateTime.local()}
                  onPick={(d): void => pickDate(d, "end")}
                  onClose={(): void => setShowCalendarFor(null)}
                />
              </View>
            )}
            {showTimePicker === "end" && (
              <View style={pickerStyles.panelWrap}>
                <TimePicker
                  visible={true}
                  which="end"
                  base={endDT ?? DateTime.local()}
                  onConfirm={(d) => setEndDT(d)}
                  onClose={(): void => setShowTimePicker(null)}
                />
              </View>
            )}

            <Text style={styles.label}>备注</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="备注"
              multiline
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={confirmDelete} style={[styles.btn, styles.deleteBtn]}>
              <Text style={styles.deleteText}>删除</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[styles.btn, styles.saveBtn]}>
              <Text style={styles.saveText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* web 删除选项 modal */}
        {Platform.OS === "web" && showDelOptions && (
          <View style={styles.webDelBackdrop}>
            <View style={styles.webDelBox}>
              <Text style={styles.webDelTitle}>删除重复事件</Text>
              <Text style={styles.webDelDesc}>
                请选择删除范围：仅删除当前这一次，还是删除此及之后的所有重复？
              </Text>
              <View style={{ flexDirection: "row", marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.webDelBtn, { flex: 1, marginRight: 8 }]}
                  onPress={handleDeleteSingleOccurrence}
                >
                  <Text>仅删除此次</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.webDelBtn, { flex: 1 }]} onPress={handleDeleteFutureOccurrences}>
                  <Text style={{ color: "#ff3b30" }}>删除此及之后</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setShowDelOptions(false)} style={{ marginTop: 10 }}>
                <Text>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { flex: 1, marginTop: 80, backgroundColor: "#fff", borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: "hidden" },
  header: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: "600" },
  cancelText: { color: "#444" },

  content: { paddingHorizontal: 16, paddingTop: 8 },
  label: { marginTop: 12, color: "#444", fontSize: 13 },
  input: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8, fontSize: 15 },

  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },

  footer: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#f2f2f2", backgroundColor: "#fff" },
  btn: { flex: 1, padding: 12, alignItems: "center", borderRadius: 6 },
  deleteBtn: { marginRight: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ff3b30" },
  saveBtn: { backgroundColor: "#007bff" },
  deleteText: { color: "#ff3b30", fontWeight: "600" },
  saveText: { color: "#fff", fontWeight: "600" },

  errorText: {
    color: "#D32F2F",       // 红色提示
    fontSize: 12,
    marginTop: 6,
  },

  webDelBackdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center", zIndex: 9999 },
  webDelBox: { width: 420, backgroundColor: "#fff", padding: 16, borderRadius: 8, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10 },
  webDelTitle: { fontSize: 16, fontWeight: "600" },
  webDelDesc: { marginTop: 8, color: "#444" },
  webDelBtn: { padding: 10, borderRadius: 6, backgroundColor: "#f2f2f2", alignItems: "center" },
});