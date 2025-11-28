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
import { REMINDER_OPTIONS } from "../utils/notifications";
import InlineDateTimePicker, { CalendarPicker, pickerStyles, TimePicker } from "./InlineDateTimePicker";

type Props = {
  visible: boolean;
  event: any | null;
  onClose: () => void;
};


export default function EventDetail({ visible, event, onClose }: Props) {
  const { items = [], update, remove } = useEvents();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [alertOffset, setAlertOffset] = useState<number>(-1);
  const [showAlertPicker, setShowAlertPicker] = useState(false);
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
      // 按字符串中的 zone/ Z 解析，最后转换为本地显示
      const parseToLocal = (v: any) =>
        (DateTime as any).isDateTime?.(v) ? (v as DateTime).toLocal() : v ? DateTime.fromISO(String(v), { setZone: true }).toLocal() : null;
      setStartDT(parseToLocal(event.start ?? event.dtstart));
      setEndDT(parseToLocal(event.end ?? event.dtend ?? event.start ?? event.dtstart));
      // 初始化读取
      setAlertOffset((event as any).alertOffset ?? -1);
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
    // 1. 准备更新数据
    const updatedFields: any = {
      title: title.trim(),
      location: location.trim(),
      notes,
      alertOffset,
    };
    // 先强制为本地时区（保留用户在 UI 中输入的时刻），再转 UTC 存储，避免 web 时区偏差
    const normalizeLocal = (dt: DateTime) =>
      dt.setZone(DateTime.local().zoneName, { keepLocalTime: true });
    if (startDT) updatedFields.dtstart = normalizeLocal(startDT).toISO();
    if (endDT) updatedFields.dtend = normalizeLocal(endDT).toISO();

    // helper: normalize to DateTime
    const toDT = (v: any) => ((DateTime as any).isDateTime?.(v) ? v : v ? DateTime.fromISO(String(v)) : null);

    try {
      const parentId = resolveParentId(event);
      const parent = items.find((it: any) => it.id === parentId);

      // 非重复或直接编辑父事件本身：直接更新
      if (!parent || parentId === event.id || !parent.rrule) {
        const targetId = parent && parentId !== event.id ? parent.id : event.id;
        const base = parent && parentId !== event.id ? parent : event;
        const payload = { ...(base as any), ...updatedFields };
        await update(targetId, payload);
        onClose();
        return;
      }

      // parent 存在且为重复系列，并且当前是某次 instance（parentId !== event.id）
      // 目标：保留每个实例的日期，只替换 time-of-day；时长严格依据用户输入：
      //  - 若用户同时提供 startDT 与 endDT -> 使用两者差值（统一应用到所有实例）
      //  - 否则对每个子实例保持其原有持续时长
      const newStartRef = startDT ?? toDT(event.start ?? event.dtstart);
      const newEndRef = endDT ?? toDT(event.end ?? event.dtend ?? event.start ?? event.dtstart);

      if (!newStartRef || !newStartRef.isValid) {
        Alert.alert("错误", "无效的开始时间。");
        return;
      }

      // 计算全局时长（仅当用户同时提供 startDT 和 endDT）
      let globalDurationMins: number | null = null;
      if (startDT && endDT) {
        const diff = newEndRef.diff(newStartRef, "minutes").minutes;
        if (!isNaN(diff) && diff > 0) globalDurationMins = Math.round(diff);
        else {
          Alert.alert("错误", "结束时间必须晚于开始时间。");
          return;
        }
      }

      // 计算 parent 原始日期参考
      const parentStartOrig = toDT(parent.dtstart ?? parent.start ?? parent.dtstart) ?? newStartRef;

      // newParentStart：保留 parent 日期，替换 time-of-day 为 newStartRef 的时分秒
      const newParentStart = parentStartOrig.set({
        hour: newStartRef.hour,
        minute: newStartRef.minute,
        second: newStartRef.second ?? 0,
        millisecond: newStartRef.millisecond ?? 0,
      });

      // newParentEnd：若 globalDurationMins 存在则用它，否则保持 parent 原有持续时长（若有）
      let newParentEnd = null;
      if (globalDurationMins !== null) {
        newParentEnd = newParentStart.plus({ minutes: globalDurationMins });
      } else if (parent.dtend) {
        const parentEndOrig = toDT(parent.dtend);
        if (parentEndOrig && parentStartOrig && parentEndOrig.isValid && parentStartOrig.isValid) {
          const parentDuration = Math.round(parentEndOrig.diff(parentStartOrig, "minutes").minutes || 0);
          newParentEnd = newParentStart.plus({ minutes: Math.max(1, parentDuration) });
        }
      }

      // 更新 parent（替换 dtstart；若 newParentEnd 存在则一并替换 dtend）
      const parentPayload: any = { ...(parent as any), ...(updatedFields || {}) };
      parentPayload.dtstart = newParentStart.toISO();
      if (newParentEnd) parentPayload.dtend = newParentEnd.toISO();
      // 同步 exdate/rdate 的 time-of-day（保留日期部分）
      const mapDatesToNewTime = (arr: any[] | undefined) => {
        if (!Array.isArray(arr)) return arr || [];
        return arr
          .map((iso) => {
            try {
              const d = toDT(iso);
              if (!d || !d.isValid) return null;
              return d
                .set({
                  hour: newParentStart.hour,
                  minute: newParentStart.minute,
                  second: newParentStart.second,
                  millisecond: newParentStart.millisecond,
                })
                .toISO();
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      };
      parentPayload.exdate = mapDatesToNewTime(parent.exdate);
      parentPayload.rdate = mapDatesToNewTime(parent.rdate);

      await update(parent.id, parentPayload);

      // 更新所有以 parent 为 originalId / parentId 的单次例外事件：保留各自日期，仅替换 time-of-day
      const children = items.filter((it: any) => it.originalId === parent.id || it.parentId === parent.id);
      for (const child of children) {
        try {
          const childStartOrig = toDT(child.dtstart ?? child.start ?? child.dtstart);
          if (!childStartOrig || !childStartOrig.isValid) continue;
          // 计算此 child 的持续时长：若全局时长存在则使用它；否则使用该 child 原始持续时长
          let childDuration = 0;
          if (globalDurationMins !== null) {
            childDuration = globalDurationMins;
          } else {
            const childEndOrig = toDT(child.dtend ?? child.end ?? child.dtend);
            if (childEndOrig && childStartOrig && childEndOrig.isValid && childStartOrig.isValid) {
              const diff = childEndOrig.diff(childStartOrig, "minutes").minutes;
              childDuration = Math.max(1, Math.round(diff));
            } else {
              // 若既没有 global 时长也无法求出 child 原有时长，则跳过更新 child（避免使用任意默认）
              continue;
            }
          }

          const childNewStart = childStartOrig.set({
            hour: newParentStart.hour,
            minute: newParentStart.minute,
            second: newParentStart.second ?? 0,
            millisecond: newParentStart.millisecond ?? 0,
          });
          const childNewEnd = childNewStart.plus({ minutes: childDuration });
          await update(child.id, {
            ...(child as any),
            dtstart: childNewStart.toISO(),
            dtend: childNewEnd.toISO(),
          });
          if (event.id === child.id) {
            setStartDT(childNewStart);
            setEndDT(childNewEnd);
          }
        } catch (eChild) {
          console.warn("update child occurrence failed", eChild);
        }
      }

      // 如果当前打开的是 parent 本身，更新本地显示
      if (event.id === parent.id) {
        setStartDT(newParentStart.toLocal());
        if (newParentEnd) setEndDT(newParentEnd.toLocal());
      }

      onClose();
      return;
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

      // 确保获取的是本地时间对象（墙上时间）
      const getLocalDT = (v: any) => {
        if ((DateTime as any).isDateTime?.(v)) return (v as DateTime).toLocal();
        if (v) return DateTime.fromISO(String(v), { setZone: true }).toLocal();
        return DateTime.local();
      };

      const occStart = getLocalDT(event.start ?? event.dtstart);

      if (parent && parent.rrule && typeof update === "function") {
        // 目标：删除包含当前实例在内的后续所有实例
        // UNTIL 是包含性的，所以要设为“当前开始时间 - 1秒”
        const untilLocal = occStart.minus({ seconds: 1 });

        // 关键修复：配合 recurrence.ts 的“伪 UTC”策略
        // 我们必须把“本地时间组件”直接拼成 UTC 字符串，而不是转为真实 UTC。
        // 否则在 UTC-X 时区会导致 UNTIL 晚于当前时间（导致没删掉），或 UTC+X 时区导致多删。
        const untilUtc = DateTime.utc(
          untilLocal.year,
          untilLocal.month,
          untilLocal.day,
          untilLocal.hour,
          untilLocal.minute,
          untilLocal.second
        );
        const until = untilUtc.toFormat("yyyyMMdd'T'HHmmss'Z'");

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

            <Text style={styles.label}>提醒</Text>
            <TouchableOpacity
              style={styles.inputBtn}
              onPress={() => setShowAlertPicker(!showAlertPicker)}
            >
              <Text style={styles.inputText}>
                {REMINDER_OPTIONS.find((o) => o.value === alertOffset)?.label ?? "无"}
              </Text>
            </TouchableOpacity>

            {showAlertPicker && (
              <View style={{ backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 10 }}>
                {REMINDER_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                    onPress={() => {
                      setAlertOffset(opt.value);
                      setShowAlertPicker(false);
                    }}
                  >
                    <Text style={{ color: opt.value === alertOffset ? '#007bff' : '#333' }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  inputBtn: {
    borderWidth: 1,
    borderColor: "#007bff",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  inputText: { color: "#007bff", fontSize: 15 },

  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },

  footer: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#f2f2f2", backgroundColor: "#fff" },
  btn: { flex: 1, padding: 12, alignItems: "center", borderRadius: 6 },
  deleteBtn: { marginRight: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ff3b30" },
  saveBtn: { backgroundColor: "#007bff" },
  deleteText: { color: "#ff3b30", fontWeight: "600" },
  saveText: { color: "#fff", fontWeight: "600" },

  errorText: {
    color: "#D32F2F",       
    fontSize: 12,
    marginTop: 6,
  },

  webDelBackdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center", zIndex: 9999 },
  webDelBox: { width: 420, backgroundColor: "#fff", padding: 16, borderRadius: 8, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10 },
  webDelTitle: { fontSize: 16, fontWeight: "600" },
  webDelDesc: { marginTop: 8, color: "#444" },
  webDelBtn: { padding: 10, borderRadius: 6, backgroundColor: "#f2f2f2", alignItems: "center" },
});