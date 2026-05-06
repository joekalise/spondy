import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '@/constants/colors';
import { FontSize } from '@/constants/theme';

function TabBarIcon({ symbol }: { symbol: string }) {
  return null; // Placeholder — replace with SVG icons in Phase 2
}

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
          tabBarIcon: () => <TabBarIcon symbol="house" />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: t('tabs.track'),
          tabBarIcon: () => <TabBarIcon symbol="plus.circle" />,
        }}
      />
      <Tabs.Screen
        name="flares"
        options={{
          title: t('tabs.flares'),
          tabBarIcon: () => <TabBarIcon symbol="flame" />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('tabs.insights'),
          tabBarIcon: () => <TabBarIcon symbol="chart.line.uptrend.xyaxis" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: () => <TabBarIcon symbol="person.circle" />,
        }}
      />
    </Tabs>
  );
}
