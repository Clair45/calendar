import * as Notifications from 'expo-notifications';
import { DateTime } from 'luxon';

export async function scheduleEventNotification(
  eventId: string,
  title: string,
  startTime: DateTime,
  minutesBefore: number
) {
  // 1. 先取消该事件旧的通知（如果有）
  await cancelEventNotification(eventId);

  if (minutesBefore < 0) return; // "无" = -1

  // 2. 计算触发时间
  const triggerDate = startTime.minus({ minutes: minutesBefore }).toJSDate();
  
  // 如果时间已过，不调度
  if (triggerDate.getTime() <= Date.now()) return;

  // 3. 调度新通知
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "日程提醒",
      body: `${title} 将在 ${minutesBefore === 0 ? '现在' : minutesBefore + '分钟后'} 开始`,
      data: { eventId },
    },
    // 修改此处：将 Date 包装在对象中，并指定类型
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
    identifier: `event-${eventId}`, // 使用固定 ID 方便覆盖/取消
  });
}

export async function cancelEventNotification(eventId: string) {
  await Notifications.cancelScheduledNotificationAsync(`event-${eventId}`);
}

// 辅助：选项列表
export const REMINDER_OPTIONS = [
  { label: "无", value: -1 },
  { label: "日程开始时", value: 0 },
  { label: "5 分钟前", value: 5 },
  { label: "10 分钟前", value: 10 },
  { label: "15 分钟前", value: 15 },
  { label: "30 分钟前", value: 30 },
  { label: "1 小时前", value: 60 },
  { label: "2 小时前", value: 120 },
  { label: "1 天前", value: 1440 },
  { label: "2 天前", value: 2880 },
  { label: "1 周前", value: 10080 },
];