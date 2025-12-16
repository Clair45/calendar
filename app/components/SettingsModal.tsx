import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEvents } from '../../lib/hooks/useEvents';
import { exportData, importData } from '../../lib/utils/dataTransfer';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SettingsModal({ visible, onClose }: Props) {
  const { items, replaceAll } = useEvents();

  const handleExport = async () => {
    try {
      await exportData(items, `calendar_backup_${new Date().toISOString().split('T')[0]}.json`);
    } catch (e) {
      Alert.alert('错误', '导出失败');
    }
  };

  const handleImport = async () => {
    try {
      const data = await importData();
      if (!data) return; // 用户取消

      if (!Array.isArray(data)) {
        Alert.alert('错误', '文件格式不正确，必须是事件数组。');
        return;
      }

      Alert.alert(
        '恢复备份',
        `即将导入 ${data.length} 个事件，这将覆盖当前所有日程。确定吗？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定覆盖',
            style: 'destructive',
            onPress: async () => {
              const success = await replaceAll(data);
              if (success) {
                Alert.alert('成功', '数据已恢复');
                onClose();
              } else {
                Alert.alert('错误', '写入数据失败');
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('错误', '导入过程中发生错误');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>设置 & 数据</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>关闭</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>数据备份</Text>
              <Text style={styles.desc}>将所有日程导出为 JSON 文件，或从备份文件恢复。</Text>
              
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, styles.exportBtn]} onPress={handleExport}>
                  <Text style={styles.btnText}>导出备份</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={[styles.btn, styles.importBtn]} onPress={handleImport}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>导入恢复</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40, minHeight: 300 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 18, fontWeight: '600' },
  closeBtn: { padding: 4 },
  closeText: { color: '#007bff', fontSize: 16 },
  content: { padding: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#333' },
  desc: { fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  exportBtn: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
  importBtn: { backgroundColor: '#007bff' },
  btnText: { fontSize: 15, fontWeight: '500', color: '#333' },
});