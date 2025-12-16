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
// 补充导入调度函数
import { cancelEventNotification, REMINDER_OPTIONS, scheduleEventNotification } from "../../lib/utils/notifications";
import InlineDateTimePicker, { CalendarPicker, pickerStyles, TimePicker } from "./InlineDateTimePicker";

type Props = {
  visible: boolean;
  event: any | null;
  onClose: () => void;
};


export default function EventDetail({ visible, event, onClose }: Props) {
  const { items = [], create, update, remove } = useEvents();
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
    if (!event) {
      setTitle("");
      setLocation("");
      setNotes("");
      setStartDT(null);
      setEndDT(null);
      setAlertOffset(-1);
      return;
    }

    // --- 新增：从 items 中查找最新数据 ---
    // 因为 event prop 可能是旧的（父组件未重新计算实例），我们需要从 items 中获取最新的 title/notes/location
    let currentData = event;
    if (items && items.length > 0) {
      // 1. 尝试直接匹配 ID (非重复事件或父事件)
      const exactMatch = items.find((it: any) => it.id === event.id);
      if (exactMatch) {
        currentData = exactMatch;
      } else {
        // 2. 如果是重复实例，尝试找到父事件获取共享字段 (title, notes, location)
        const instOriginalId = (event as any).originalId ?? (event as any).parentId ?? null;
        const parsedParentFromId = typeof event?.id === "string" && event.id.includes("::") ? event.id.split("::")[0] : null;
        const parentId = instOriginalId ?? parsedParentFromId ?? event.id;
        
        const parent = items.find((it: any) => it.id === parentId);
        if (parent) {
          // 合并父事件的最新信息，但保留实例的时间信息
          currentData = {
            ...event,
            title: parent.title,
            location: (parent as any).location, // <--- 修改此处：添加 (parent as any)
            notes: parent.notes,
            alertOffset: (parent as any).alertOffset // 如果 alertOffset 报错也同样处理
          };
        }
      }
    }
    // ------------------------------------

    setTitle(currentData.title ?? "");
    setLocation((currentData as any).location ?? "");
    setNotes((currentData as any).notes ?? "");

    const parseToLocal = (v: any) =>
      (DateTime as any).isDateTime?.(v) ? (v as DateTime).toLocal() : v ? DateTime.fromISO(String(v), { setZone: true }).toLocal() : null;
    
    // 时间仍优先使用 event 中的（因为实例的时间是计算出来的，items 里存的是规则）
    setStartDT(parseToLocal(event.start ?? event.dtstart));
    setEndDT(parseToLocal(event.end ?? event.dtend ?? event.start ?? event.dtstart));

    // 读取 alertOffset：优先实例自身 -> 回退 parent（从 items 中查找） -> 默认 -1
    try {
      const rawAlert = (currentData as any).alertOffset; // 使用 currentData
      let ao: number | null = null;
      if (rawAlert != null) {
        ao = typeof rawAlert === "number" ? rawAlert : Number(rawAlert);
      }

      if (ao == null || Number.isNaN(ao)) {
        // 如果 currentData 已经是 parent 或合并了 parent，上面的 rawAlert 应该已经取到了
        // 这里保留兜底逻辑
        const instOriginalId = (event as any).originalId ?? (event as any).parentId ?? null;
        const parsedParentFromId = typeof event?.id === "string" && event.id.includes("::") ? event.id.split("::")[0] : null;
        const parentId = instOriginalId ?? parsedParentFromId ?? event.id;

        if (parentId && Array.isArray(items)) {
          const parent = (items as any[]).find((it) => it.id === parentId);
          const pRaw = parent?.alertOffset;
          if (pRaw != null) {
            ao = typeof pRaw === "number" ? pRaw : Number(pRaw);
          }
        }
      }

      setAlertOffset(Number.isFinite(ao as number) ? (ao as number) : -1);
    } catch (e) {
      setAlertOffset(-1);
    }
  }, [event, items]);

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
        // --- 新增：更新系统通知 ---
        // 无论更新的是 parent 还是 child，我们都尝试为当前正在查看的这个事件 ID 设定通知
        // 注意：如果是重复事件的 parent，这里只为 parent 本身设定了通知。
        // 若需要为所有子事件设定通知，逻辑会较复杂。此处仅保证“当前查看的事件”有提醒。
        
        // 获取最终的开始时间 (优先使用 startDT，否则用 event 原有时间)
        const finalStartDT = startDT ?? toDT(event.start ?? event.dtstart);
        
        // 只有当时间有效且 ID 存在时才调度
        if (finalStartDT && finalStartDT.isValid && event.id) {
          if (alertOffset >= 0) {
            // 调度新提醒
            await scheduleEventNotification(
              event.id, 
              title.trim(), 
              finalStartDT.toLocal(), 
              alertOffset
            );
          } else {
            // 如果选择了“无”，则取消旧提醒
            await cancelEventNotification(event.id);
          }
        }
        // ---------------------------

        onClose();
        return;
      }

      // parent 存在且为重复系列，并且当前是某次 instance（parentId !== event.id）
      // 目标分两种情况：
      // 1) 用户编辑的是“单次实例”（event.id !== parent.id）：只更新该 child（可修改日期或时间）
      // 2) 用户编辑的是 parent（series）本身：按原逻辑更新 parent 及其所有子项（仅应用 time-of-day / 全局时长）
      const isEditingInstance = event.id !== parent.id;
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

      if (isEditingInstance) {
        try {
          // 查找是否已有例外 child（独立事件）存在
          const child = items.find((it: any) => it.id === event.id);

          // 计算此 child 的持续时长：优先 globalDurationMins，否则使用原 child/instance 持续时长
          let childDuration = 0;
          if (globalDurationMins !== null) {
            childDuration = globalDurationMins;
          } else {
            const childStartOrig = toDT(child?.dtstart ?? (child as any).start ?? event.start ?? event.dtstart);
            const childEndOrig = toDT(child?.dtend ?? (child as any).end ?? event.end ?? event.dtend);
            if (childStartOrig && childEndOrig && childStartOrig.isValid && childEndOrig.isValid) {
              childDuration = Math.max(1, Math.round(childEndOrig.diff(childStartOrig, "minutes").minutes || 0));
            } else {
              childDuration = 60; // fallback
            }
          }

          const childNewStart = newStartRef.set({ millisecond: newStartRef.millisecond ?? 0 });
          const childNewEnd = childNewStart.plus({ minutes: childDuration });

          if (child) {
            // 已有例外事件 -> 直接更新该条记录
            const payload = { ...(child as any), ...(updatedFields || {}) };
            payload.dtstart = childNewStart.toISO();
            payload.dtend = childNewEnd.toISO();
            await update(child.id, payload);

            // 更新通知
            if (alertOffset >= 0) await scheduleEventNotification(child.id, title.trim(), childNewStart.toLocal(), alertOffset);
            else await cancelEventNotification(child.id);
          } else {
            // 没有例外事件 -> 创建例外：1) 在 parent 添加 exdate 排除原实例 2) 创建一个新的单次事件作为覆盖
            const occISO =
              event?.start
                ? (DateTime as any).isDateTime?.(event.start)
                  ? event.start.toISO()
                  : DateTime.fromISO(String(event.start)).toISO()
                : DateTime.fromISO(String(event?.dtstart ?? "")).toISO();

            // 在 parent 上加入 exdate（排除原始实例）
            const prevEx = Array.isArray(parent.exdate) ? parent.exdate : [];
            const newEx = Array.from(new Set([...prevEx, occISO]));
            await update(parent.id, { ...(parent as any), exdate: newEx });

            // 创建覆盖事件（单次），关联 originalId/parentId
            const newOneOff: any = {
              ...((parent as any) || {}),
              ...updatedFields,
              dtstart: childNewStart.toISO(),
              dtend: childNewEnd.toISO(),
              originalId: parent.id,
              parentId: parent.id,
              rrule: undefined,
              exdate: undefined,
              rdate: undefined,
            };
            // 删除不应复制的字段
            delete newOneOff.id;
            // 使用 create 创建新事件（确保 useEvents 中有 create）
            if (typeof create === "function") {
              const created = await create(newOneOff);
              if (created && created.id) {
                if (alertOffset >= 0) await scheduleEventNotification(created.id, title.trim(), childNewStart.toLocal(), alertOffset);
                else await cancelEventNotification(created.id);
              }
            } else {
              // 如果没有 create，退回到直接 update parent 并告知用户
              console.warn("useEvents.create not available, unable to create override event");
              Alert.alert("更新失败", "无法创建例外事件，请稍后重试。");
              return;
            }
          }

          setStartDT(childNewStart.toLocal());
          setEndDT(childNewEnd.toLocal());
          onClose();
          return;
        } catch (e) {
          console.warn("update single occurrence failed", e);
          Alert.alert("更新失败", String(e));
          return;
        }
      }

      // 否则：编辑的是 parent series —— 保持原来行为（修改 parent 的 time-of-day 与所有子项的 time）
      // 计算 parent 原始日期参考（用 parent.dtstart 的日期部分）
      const parentStartOrig = toDT(parent.dtstart ?? (parent as any).start) ?? newStartRef;

      const newParentStart = parentStartOrig.set({
        hour: newStartRef.hour,
        minute: newStartRef.minute,
        second: newStartRef.second ?? 0,
        millisecond: newStartRef.millisecond ?? 0,
      });

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

      const parentPayload: any = { ...(parent as any), ...(updatedFields || {}) };
      parentPayload.dtstart = newParentStart.toISO();
      if (newParentEnd) parentPayload.dtend = newParentEnd.toISO();

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

      // 更新所有子项：仅替换 time-of-day（保留各自日期），或应用 globalDuration
      const children = items.filter((it: any) => it.originalId === parent.id || it.parentId === parent.id);
      for (const child of children) {
        try {
          const childStartOrig = toDT(child.dtstart ?? (child as any).start);
          if (!childStartOrig || !childStartOrig.isValid) continue;
          let childDuration = 0;
          if (globalDurationMins !== null) {
            childDuration = globalDurationMins;
          } else {
            const childEndOrig = toDT(child.dtend ?? (child as any).end);
            if (childEndOrig && childStartOrig && childEndOrig.isValid && childStartOrig.isValid) {
              const diff = childEndOrig.diff(childStartOrig, "minutes").minutes;
              childDuration = Math.max(1, Math.round(diff));
            } else {
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
      // 新增：取消通知
      await cancelEventNotification(event.id);
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
              // 新增：取消通知
              await cancelEventNotification(event.id);
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