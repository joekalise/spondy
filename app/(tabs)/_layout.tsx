import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { FontSize, FontFamily } from '@/constants/theme';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();
  // Android's edge-to-edge mode (mandatory since Expo SDK 54) renders content
  // behind the system nav bar, so a fixed paddingBottom only clears nav bars of
  // exactly that height — taller 3-button bars/OEM overlays overlap the tabs.
  // Use the device's real inset instead of guessing.
  const insets = useSafeAreaInsets();

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
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: '500',
          fontFamily: FontFamily.medium,
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
