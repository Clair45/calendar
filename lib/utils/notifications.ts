import * as Notifications from "expo-notifications";
import { DateTime } from "luxon";

export async function scheduleEventNotification(
  eventId: string,
  title: string,
  startTime: DateTime,
  minutesBefore: number
) {
  await cancelEventNotification(eventId);
  if (minutesBefore < 0) return;
  const triggerDate = startTime.minus({ minutes: minutesBefore }).toJSDate();
  if (triggerDate.getTime() <= Date.now() - 5000) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "日程提醒",
      body: `${title} ${minutesBefore === 0 ? "现在开始" : `将在 ${minutesBefore} 分钟后开始`}`,
      data: { eventId },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
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