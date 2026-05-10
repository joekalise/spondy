import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  useColorScheme,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/common/Button';
import { SpondyMark } from '@/components/common/SpondyMark';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/contexts/AuthContext';

export function ProfileReadyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { saveProfile } = useProfile();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const params = useLocalSearchParams<{
    welcome_message: string;
    insights: string;
    watch_summary: string;
  }>();

  const welcomeMessage = params.welcome_message ?? '';
  const insights: string[] = params.insights ? JSON.parse(params.insights) : [];
  const watchSummary = params.watch_summary ?? '';

  const [isSaving, setIsSaving] = useState(false);

  // Mark onboarding complete only when the user taps the button — not on mount.
  // Saving on mount triggers the nav guard in _layout.tsx to redirect immediately,
  // causing the screen to flash and disappear before the user reads anything.
  const handleEnterApp = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await Promise.all([
        saveProfile({
          user_id: user.id,
          onboarding_complete: true,
          welcome_message: welcomeMessage,
        }),
        AsyncStorage.setItem(
          `@spondy_welcome_${user.id}`,
          JSON.stringify({ insights, watch_summary: watchSummary })
        ),
      ]);
    } catch (err) {
      console.error('Failed to mark onboarding complete:', err);
    } finally {
      setIsSaving(false);
    }
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <SpondyMark size={72} />
          <Text style={[styles.title, isDark && styles.titleDark]}>
            {t('profile_ready.title')}
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
            {t('profile_ready.subtitle')}
          </Text>
        </View>

        {/* Welcome message card */}
        <View style={[styles.welcomeCard, isDark && styles.welcomeCardDark]}>
          <Text style={styles.welcomeText}>{welcomeMessage}</Text>
        </View>

        {/* Insights section */}
        {insights.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
              {t('profile_ready.insights_title')}
            </Text>
            {insights.map((insight, idx) => (
              <View
                key={idx}
                style={[styles.insightCard, isDark && styles.insightCardDark]}
              >
                <View style={styles.insightNumber}>
                  <Text style={styles.insightNumberText}>{idx + 1}</Text>
                </View>
                <Text
                  style={[styles.insightText, isDark && styles.insightTextDark]}
                >
                  {insight}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Watch summary section */}
        {watchSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
              {t('profile_ready.watch_title')}
            </Text>
            <View
              style={[styles.watchCard, isDark && styles.watchCardDark]}
            >
              <Text
                style={[styles.watchText, isDark && styles.watchTextDark]}
              >
                {watchSummary}
              </Text>
            </View>
          </View>
        )}

        {/* CTA */}
        <View style={styles.ctaContainer}>
          <Button
            label={t('profile_ready.enter_app')}
            onPress={handleEnterApp}
            isLoading={isSaving}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenDark: {
    backgroundColor: Colors.backgroundDark,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    lineHeight: 34,
  },
  titleDark: {
    color: Colors.textPrimaryDark,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  subtitleDark: {
    color: Colors.textSecondaryDark,
  },
  welcomeCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  welcomeCardDark: {
    backgroundColor: Colors.primaryDark,
  },
  welcomeText: {
    fontSize: FontSize.md,
    color: '#FFFFFF',
    lineHeight: 24,
    fontWeight: '500',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  sectionTitleDark: {
    color: Colors.textPrimaryDark,
  },
  insightCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insightCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  insightNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightNumberText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  insightText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
    flex: 1,
  },
  insightTextDark: {
    color: Colors.textPrimaryDark,
  },
  watchCard: {
    backgroundColor: Colors.secondaryLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  watchCardDark: {
    backgroundColor: '#0C4A6E',
  },
  watchText: {
    fontSize: FontSize.sm,
    color: '#0C4A6E',
    lineHeight: 20,
  },
  watchTextDark: {
    color: '#BAE6FD',
  },
  ctaContainer: {
    marginTop: Spacing.md,
  },
});
