import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { FontSize } from '@/constants/theme';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: isDark
          ? Colors.textSecondaryDark
          : Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: isDark ? Colors.surfaceDark : Colors.surface,
          borderTopColor: isDark ? Colors.borderDark : Colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'today' : 'today-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: t('tabs.track'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pencil' : 'pencil-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="flares"
        options={{
          title: t('tabs.flares'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'flame' : 'flame-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('tabs.insights'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          href: null,
        }}
      />
    </Tabs>
  );
}
