import * as Notifications from 'expo-notifications';
import { DateTime } from 'luxon';

export async function scheduleEventNotification(
  eventId: string,
  title: string,
  startTime: DateTime,
  minutesBefore: number
) {
  // 1. 先取消旧通知
  await cancelEventNotification(eventId);

  if (minutesBefore < 0) return;

  // 2. 计算触发时间
  // 如果 minutesBefore = 0，则在 startTime 触发
  const triggerDate = startTime.minus({ minutes: minutesBefore }).toJSDate();
  
  // 如果触发时间已过（容差 5秒），则不调度
  if (triggerDate.getTime() <= Date.now() - 5000) return;

  // 3. 调度
  // 注意：triggerDate 如果是过去的时间，scheduleNotificationAsync 会立即触发或失败
  // 我们希望它在指定时间触发。
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "日程提醒",
      body: `${title} ${minutesBefore === 0 ? '现在开始' : `将在 ${minutesBefore} 分钟后开始`}`,
      data: { eventId },
      sound: true, // 确保有声音
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate, // 必须是未来的时间
    },
    identifier: `event-${eventId}`,
  });
}

export async function cancelEventNotification(eventId: string) {
  await Notifications.cancelScheduledNotificationAsync(`event-${eventId}`);
}

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