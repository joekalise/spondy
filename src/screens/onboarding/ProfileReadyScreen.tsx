import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/common/Button';
import { DragSlider } from '@/components/common/DragSlider';
import { SpondyMark } from '@/components/common/SpondyMark';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/contexts/AuthContext';
import { saveDailyLog } from '@/services/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityToPain(s: string | null | undefined): number {
  switch (s) {
    case 'mild': return 2;
    case 'moderate': return 5;
    case 'severe': return 7;
    case 'very_severe': return 9;
    default: return 4;
  }
}

function insightIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('sleep')) return '😴';
  if (t.includes('flare')) return '⚠️';
  if (t.includes('medication') || t.includes('medicine')) return '💊';
  if (t.includes('fatigue') || t.includes('tired')) return '😮‍💨';
  if (t.includes('exercise') || t.includes('activity') || t.includes('movement')) return '🚶';
  if (t.includes('stress') || t.includes('mental') || t.includes('mood')) return '🧘';
  if (t.includes('diet') || t.includes('food')) return '🥗';
  if (t.includes('pain')) return '🔥';
  return '💡';
}

const ACCENT_COLORS = [Colors.primary, Colors.secondary, Colors.success, Colors.warning];

function localDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileReadyScreen() {
  const router = useRouter();
  const { saveProfile, profile } = useProfile();
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

  const initPain = severityToPain(profile?.severity);
  const [painScore, setPainScore] = useState(initPain);
  const [fatigueScore, setFatigueScore] = useState(Math.max(1, initPain - 1));
  const [logSkipped, setLogSkipped] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  const handleEnterApp = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const tasks: Promise<unknown>[] = [
        saveProfile({
          user_id: user.id,
          onboarding_complete: true,
          welcome_message: welcomeMessage,
        }),
        AsyncStorage.setItem(
          `@spondy_welcome_${user.id}`,
          JSON.stringify({ insights, watch_summary: watchSummary })
        ),
      ];

      if (!logSkipped) {
        tasks.push(
          saveDailyLog({
            user_id: user.id,
            date: localDateString(),
            pain_score: painScore,
            fatigue_score: fatigueScore,
            stiffness_duration: profile?.morning_stiffness ?? null,
            mood: null,
            notes: '',
            medications_taken: (profile?.medications?.length ?? 0) > 0 ? 'yes' : 'no',
            diet_quality: null,
            diet_triggers: null,
            exercise_done: false,
            exercise_minutes: null,
            exercise_type: null,
          })
        );
      }

      await Promise.all(tasks);
    } catch (err) {
      console.error('ProfileReadyScreen save error:', err);
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
          <SpondyMark size={60} />
          <Text style={[styles.title, isDark && styles.titleDark]}>
            Your profile is ready
          </Text>
        </View>

        {/* Welcome message */}
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>{welcomeMessage}</Text>
        </View>

        {/* ── Day-one log ─────────────────────────────────────────────────── */}
        {!logSkipped ? (
          <View style={[styles.logCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.logHeader}>
              <Text style={[styles.logTitle, { color: textPrimary }]}>Log today while you're here</Text>
              <TouchableOpacity onPress={() => setLogSkipped(true)} activeOpacity={0.7}>
                <Text style={[styles.skipLink, { color: textSecondary }]}>Skip</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.logHint, { color: textSecondary }]}>
              Pre-filled from your answers — adjust if needed.
            </Text>

            <Text style={[styles.logLabel, { color: textSecondary }]}>Pain  <Text style={{ color: textPrimary, fontWeight: '700' }}>{painScore}/10</Text></Text>
            <DragSlider value={painScore} onChange={setPainScore} isDark={isDark} minLabel="None" maxLabel="Severe" />

            <Text style={[styles.logLabel, { color: textSecondary, marginTop: Spacing.md }]}>Fatigue  <Text style={{ color: textPrimary, fontWeight: '700' }}>{fatigueScore}/10</Text></Text>
            <DragSlider value={fatigueScore} onChange={setFatigueScore} isDark={isDark} minLabel="None" maxLabel="Severe" />
          </View>
        ) : (
          <TouchableOpacity onPress={() => setLogSkipped(false)} style={styles.undoSkip} activeOpacity={0.7}>
            <Text style={[styles.skipLink, { color: Colors.primary }]}>+ Log today instead</Text>
          </TouchableOpacity>
        )}

        {/* ── Insights ────────────────────────────────────────────────────── */}
        {insights.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>A few things worth knowing</Text>
            {insights.map((insight, idx) => {
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              const icon = insightIcon(insight);
              return (
                <View
                  key={idx}
                  style={[styles.insightCard, { backgroundColor: cardBg, borderColor: cardBorder, borderLeftColor: accent }]}
                >
                  <Text style={styles.insightIcon}>{icon}</Text>
                  <Text style={[styles.insightText, { color: textPrimary }]}>{insight}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Watch summary ───────────────────────────────────────────────── */}
        {watchSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>What Spondy will watch for you</Text>
            <View style={[styles.watchCard, { borderColor: Colors.secondary + '50' }]}>
              <Text style={styles.watchIcon}>👀</Text>
              <Text style={[styles.watchText, { color: isDark ? Colors.textPrimaryDark : '#0C4A6E' }]}>
                {watchSummary}
              </Text>
            </View>
          </View>
        )}

        <Button
          label="Let's go"
          onPress={handleEnterApp}
          isLoading={isSaving}
          style={styles.cta}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  screenDark: { backgroundColor: Colors.backgroundDark },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  titleDark: { color: Colors.textPrimaryDark },

  // Welcome
  welcomeCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  welcomeText: {
    fontSize: FontSize.md,
    color: '#FFFFFF',
    lineHeight: 24,
    fontWeight: '500',
  },

  // Day-one log
  logCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  logTitle: { fontSize: FontSize.md, fontWeight: '700' },
  logHint: { fontSize: FontSize.xs, marginBottom: Spacing.md },
  logLabel: { fontSize: FontSize.sm, marginBottom: Spacing.xs },
  skipLink: { fontSize: FontSize.sm, fontWeight: '600' },
  undoSkip: { marginBottom: Spacing.xl, alignItems: 'center', paddingVertical: Spacing.sm },

  // Insights
  section: { marginBottom: Spacing.xl },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  insightCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  insightIcon: { fontSize: 20, width: 28, textAlign: 'center', marginTop: 1 },
  insightText: { fontSize: FontSize.sm, lineHeight: 20, flex: 1 },

  // Watch
  watchCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  watchIcon: { fontSize: 20, width: 28, textAlign: 'center', marginTop: 1 },
  watchText: { fontSize: FontSize.sm, lineHeight: 20, flex: 1 },

  cta: { marginTop: Spacing.md },
});
