import { DateTime } from "luxon";
import { useEffect, useState } from "react";
import {
    Alert,
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
  event: any | null;
  onClose: () => void;
};

export default function EventDetail({ visible, event, onClose }: Props) {
  const { items, update, remove } = useEvents(); // items 用于查找父事件以回填 exdate/rrule
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (event) {
      setTitle(event.title ?? "");
      setLocation((event as any).location ?? "");
      setNotes((event as any).notes ?? "");
    } else {
      setTitle("");
      setLocation("");
      setNotes("");
    }
  }, [event]);

  async function handleSave() {
    if (!event) return;
    const updatedFields = {
      title: title.trim(),
      location: location.trim(),
      notes,
    };
    try {
      // 识别父事件 id（优先使用 originalId，回退到 id 前缀解析）
      const instOriginalId = (event as any).originalId ?? (event as any).parentId ?? null;
      const parsedParentFromId =
        typeof event?.id === "string" && event.id.includes("::") ? event.id.split("::")[0] : null;
      const parentId = instOriginalId ?? parsedParentFromId ?? (event as any).id;

      // 若找到父事件并且父 id != 当前 instance id，则更新父事件
      const parent = (items ?? []).find((it: any) => it.id === parentId);
      if (parent && parentId !== (event as any).id) {
        // 直接更新父事件（会影响所有重复实例）
        const payload = { ...(parent as any), ...updatedFields };
        await update(parent.id, payload);
      } else {
        // 非重复或父事件未找到：按当前 id 更新
        const payload = { ...(event as any), ...updatedFields };
        await update((event as any).id, payload);
      }
    } catch (e: any) {
      console.warn("update error", e);
      Alert.alert("更新失败", String(e?.message ?? e));
    }
    onClose();
  }

  function confirmDelete() {
    if (!event) return;

    // 判断是否为由重复规则展开的实例：如果 instance.originalId 存在且与 id 不同，则为重复实例
    const instOriginalId = (event as any).originalId ?? (event as any).parentId ?? null;
    // 若 instance id 为 "parentId::occISO"，尝试从 id 解析 parent id
    const parsedParentFromId =
      typeof event?.id === "string" && event.id.includes("::") ? event.id.split("::")[0] : null;
    const parentId = instOriginalId ?? parsedParentFromId ?? (event as any).id;
    const parent = items?.find((it: any) => it.id === parentId);
    const isRecurring = Boolean(parent && parent.rrule);

    if (!isRecurring) {
      // 普通事件：简单确认删除
      Alert.alert("删除事件", "确定要删除此事件吗？此操作不可撤销。", [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              if (typeof remove === "function") await remove((event as any).id);
            } catch (e) {
              console.warn("remove error", e);
            }
            onClose();
          },
        },
      ]);
      return;
    }

    // 重复事件：询问删除范围
    Alert.alert(
      "删除重复事件",
      "请选择删除范围：仅删除当前这一次，还是删除此及之后的所有重复？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "仅删除此次",
          onPress: async () => {
            try {
              // 如果找到了父事件，则把 occurrence 的 ISO 加入父事件 exdate（避免删除其它实例）
              const occISO = (event as any).start
                ? (DateTime as any).isDateTime?.((event as any).start)
                  ? (event as any).start.toISO()
                  : DateTime.fromISO(String((event as any).start)).toISO()
                : DateTime.fromISO(String((event as any).dtstart ?? "")).toISO();
              if (parent && typeof update === "function") {
                const prevEx = Array.isArray(parent.exdate) ? parent.exdate : [];
                const newEx = Array.from(new Set([...prevEx, occISO]));
                await update(parent.id, { ...(parent as any), exdate: newEx });
              } else {
                // 回退：删除单条实例（如果没有父事件）
                if (typeof remove === "function") await remove((event as any).id);
              }
            } catch (e) {
              console.warn("remove single occurrence error", e);
            }
            onClose();
          },
        },
        {
          text: "删除此及之后",
          style: "destructive",
          onPress: async () => {
            try {
              // 把父事件的 rrule 截断到 occurrence 之前（保留该日期之前的实例）
              const occStart = (DateTime as any).isDateTime?.((event as any).start)
                ? (event as any).start
                : DateTime.fromISO(String((event as any).start ?? (event as any).dtstart));
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
                // 如果无法找到 parent 或 parent.rrule，退而删除父事件本身（保守策略）
                if (typeof remove === "function") await remove(parent ? parent.id : (event as any).id);
              }
            } catch (e) {
              console.warn("remove future occurrences error", e);
            }
            onClose();
          },
        },
      ],
      { cancelable: true }
    );
  }

  if (!visible || !event) return null;

  const start = (DateTime as any).isDateTime?.(event.start) ? event.start : DateTime.fromISO(String(event.start));
  const end = (DateTime as any).isDateTime?.(event.end) ? event.end : DateTime.fromISO(String(event.end));

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
            <View style={styles.row}>
              <Text>{start.toFormat("yyyy-LL-dd HH:mm")}</Text>
              <Text>{end.toFormat("yyyy-LL-dd HH:mm")}</Text>
            </View>

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
});