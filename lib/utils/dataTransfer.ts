import * as DocumentPicker from "expo-document-picker";
import { Alert, Platform, Share } from "react-native";

/**
 * 导出数据到文件
 * @param data 要导出的对象或数组
 * @param fileName 文件名 (不含路径)
 * @returns 写入的文件 uri（native）或 undefined（web）
 */
export async function exportData(data: any, fileName: string = "calendar_backup.json"): Promise<string | undefined> {
  const jsonString = JSON.stringify(data, null, 2);

  // Web 端：直接触发下载
  if (Platform.OS === "web") {
    try {
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return undefined;
    } catch (e) {
      console.error("Web export failed", e);
      throw new Error("导出失败（Web）");
    }
  }

  // Native：动态导入以避免在 web/build 时的类型/模块问题
  try {
    const FileSystemModule: any = await import("expo-file-system").then((m) => m.default ?? m);
    const SharingModule: any = await import("expo-sharing").then((m) => m.default ?? m);

    // 优先 documentDirectory，回退到 cacheDirectory
    const dir = FileSystemModule.documentDirectory ?? FileSystemModule.cacheDirectory ?? null;
    if (!dir) {
      console.warn("No documentDirectory or cacheDirectory available on this device.");
      // 兜底：无法写文件时，改为直接分享 JSON 文本（适用于临时导出）
      try {
        await Share.share({
          title: fileName,
          message: jsonString,
        });
        return undefined;
      } catch (shareErr) {
        console.error("Share fallback failed:", shareErr);
        throw new Error("设备存储目录不可用，且文本分享失败");
      }
    }

    const fileUri = dir + fileName;

    // 写文件（writeAsStringAsync 默认使用 UTF-8）
    await FileSystemModule.writeAsStringAsync(fileUri, jsonString);

    // 尝试分享
    const sharingAvailable = typeof SharingModule.isAvailableAsync === "function"
      ? await SharingModule.isAvailableAsync()
      : false;

    if (sharingAvailable) {
      await SharingModule.shareAsync(fileUri);
    } else {
      // 如果系统分享不可用，提示用户文件保存路径
      Alert.alert("导出完成", `已保存到：\n${fileUri}`);
    }

    return fileUri;
  } catch (err: any) {
    console.error("Export failed:", err);
    // 抛出更详细的错误，调用方可以展示具体信息
    throw new Error(`导出失败：${err?.message ?? String(err)}`);
  }
}

/**
 * 从文件导入数据
 * @returns 解析后的 JSON 对象或 null
 */
export async function importData(): Promise<any | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    // 区分 expo-document-picker 版本差异
    if ("canceled" in result && result.canceled) return null;
    // expo document picker v13+ 返回 assets 数组
    const uri = (result as any).uri ?? ((result as any).assets && (result as any).assets[0]?.uri);
    if (!uri) return null;

    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const content = await response.text();
      return JSON.parse(content);
    }

    const FileSystemModule: any = await import("expo-file-system").then((m) => m.default ?? m);
    const content = await FileSystemModule.readAsStringAsync(uri);
    return JSON.parse(content);
  } catch (e) {
    console.error("Import failed", e);
    throw new Error("导入失败：文件格式错误或无法读取");
  }
}