import * as Notifications from 'expo-notifications';
import { Slot } from 'expo-router'; // 引入 Slot
import { createContext, useContext, useEffect } from 'react';
import { Text, View } from 'react-native';

// 1. 定义 Context 类型（根据实际需要调整）
type RootLayoutContextType = {
  // 示例属性
  theme: string;
};

// 2. 创建 Context
const RootLayoutContext = createContext<RootLayoutContextType | null>(null);

// 3. 创建 Hook (可选，用于子组件消费)
export const useRootLayoutContext = () => {
  const context = useContext(RootLayoutContext);
  if (!context) {
    throw new Error('useRootLayoutContext must be used within a RootLayout');
  }
  return context;
};

// 配置通知行为：在前台收到通知时也显示 Alert
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, // 新增：是否显示横幅
    shouldShowList: true,   // 新增：是否显示在通知列表中
  }),
});

// 1. 临时定义 Header 组件 (或者 import Header from '../components/Header')
const Header = () => (
  <View style={{ paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 }}>
    <Text style={{ fontSize: 20, fontWeight: 'bold' }}>My App</Text>
  </View>
);

export default function RootLayout() {
  // 4. 准备 Context 的值
  const contextValue: RootLayoutContextType = {
    theme: 'light', // 示例值
  };

  // 新增：请求通知权限
  useEffect(() => {
    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
    })();
  }, []);

  return (
    <RootLayoutContext.Provider value={contextValue}>
      {/* 如果是全屏布局，通常不需要 ScrollView 包裹 Slot，视需求而定 */}
      <View style={{ flex: 1 }}> 
        <Header />
        {/* 2. 使用 Slot 渲染当前路由页面，替代 <Content /> */}
        <Slot /> 
      </View>
    </RootLayoutContext.Provider>
  );
}

// 3. 调度新通知
export async function scheduleNotification({
  title,
  minutesBefore,
  eventId,
}: { title: string; minutesBefore: number; eventId: string }) {
  const triggerDate = new Date(Date.now() + minutesBefore * 60 * 1000);
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: `${title} 将在 ${minutesBefore === 0 ? '现在' : minutesBefore + '分钟后'} 开始`,
      data: { eventId },
    },
    // 修改此处：添加 type 属性
    trigger: minutesBefore === 0 ? null : { 
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate 
    },
    identifier: `event-${eventId}`, 
  });
}

export async function cancelEventNotification(eventId: string) {
  //  标识符需要与 scheduleNotification 中设置的 identifier (`event-${eventId}`) 保持一致
  await Notifications.cancelScheduledNotificationAsync(`event-${eventId}`);
}