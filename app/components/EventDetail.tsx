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
  const { update, remove } = useEvents(); // 假定 useEvents 导出 update/remove；如不同请修改
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
    const updated = {
      ...(event as any),
      title: title.trim(),
      location: location.trim(),
      notes: notes,
    };
    try {
      if (typeof update === "function") {
        // update 期望 (id, payload)
        await update(event.id, updated);
      }
    } catch (e) {
      console.warn("update error", e);
    }
    onClose();
  }

  function confirmDelete() {
    if (!event) return;
    Alert.alert("删除事件", "确定要删除此事件吗？此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            if (typeof remove === "function") {
              await remove((event as any).id);
            }
          } catch (e) {
            console.warn("remove error", e);
          }
          onClose();
        },
      },
    ]);
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