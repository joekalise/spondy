import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useDailyLog } from '@/hooks/useDailyLog';
import { useWeeklyData } from '@/hooks/useWeeklyData';
import { useFlares } from '@/hooks/useFlares';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DailyLog, Mood } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'greeting_morning';
  if (hour < 17) return 'greeting_afternoon';
  return 'greeting_evening';
}

function moodToNumeric(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 5;
    case 'good': return 4;
    case 'okay': return 3;
    case 'low': return 2;
    case 'very_low': return 1;
    default: return 0;
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return Colors.success;
  if (score >= 40) return Colors.warning;
  return Colors.error;
}

function daysBetween(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// ─── Spondy Score Circle ──────────────────────────────────────────────────────

function SpondyScoreCard({
  score,
  isDark,
  t,
}: {
  score: number | null;
  isDark: boolean;
  t: (key: string) => string;
}) {
  const color = score !== null ? scoreColor(score) : Colors.textSecondary;

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>
        {t('home.spondy_score')}
      </Text>
      {score !== null ? (
        <View style={styles.scoreRow}>
          <View style={[styles.scoreCircle, { borderColor: color }]}>
            <Text style={[styles.scoreNumber, { color }]}>{score}</Text>
            <Text style={[styles.scoreOutOf, { color }]}>/100</Text>
          </View>
          <Text style={[styles.scoreSubtitle, isDark && styles.textSecDark]}>
            {t('home.spondy_score_subtitle')}
          </Text>
        </View>
      ) : (
        <Text style={[styles.noDataText, isDark && styles.textSecDark]}>
          {t('home.spondy_score_no_data')}
        </Text>
      )}
    </View>
  );
}

// ─── Mini line chart ──────────────────────────────────────────────────────────

interface MiniChartProps {
  data: { value: number }[];
  label: string;
  color: string;
  isDark: boolean;
  maxValue?: number;
}

function MiniChart({ data, label, color, isDark, maxValue = 10 }: MiniChartProps) {
  const W = 90;
  const H = 60;
  const pad = 4;

  const points = data.length > 1
    ? data.map((d, i) => {
        const x = pad + (i / (data.length - 1)) * (W - pad * 2);
        const y = H - pad - (Math.min(d.value, maxValue) / maxValue) * (H - pad * 2);
        return `${x},${y}`;
      }).join(' ')
    : null;

  return (
    <View style={styles.miniChartContainer}>
      <Text style={[styles.miniChartLabel, isDark && styles.textSecDark]}>{label}</Text>
      {points ? (
        <Svg width={W} height={H}>
          <Polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.length <= 5 && data.map((d, i) => {
            const x = pad + (i / (data.length - 1)) * (W - pad * 2);
            const y = H - pad - (Math.min(d.value, maxValue) / maxValue) * (H - pad * 2);
            return <Circle key={i} cx={x} cy={y} r={3} fill={color} />;
          })}
        </Svg>
      ) : (
        <View style={[styles.miniChartEmpty, { width: W, height: H }]}>
          <Text style={styles.miniChartEmptyDot}>···</Text>
        </View>
      )}
    </View>
  );
}

// ─── Weekly Trends section ────────────────────────────────────────────────────

function WeeklyTrends({
  logs,
  isDark,
  t,
}: {
  logs: DailyLog[];
  isDark: boolean;
  t: (key: string) => string;
}) {
  const hasEnoughData = logs.length >= 3;

  const painData = logs.map((l) => ({ value: l.pain_score }));
  const fatigueData = logs.map((l) => ({ value: l.fatigue_score }));
  const moodData = logs.map((l) => ({ value: moodToNumeric(l.mood) }));

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>
        {t('home.this_week')}
      </Text>
      {!hasEnoughData ? (
        <Text style={[styles.noDataText, isDark && styles.textSecDark]}>
          {t('home.no_data_yet')}
        </Text>
      ) : (
        <View style={styles.chartsRow}>
          <MiniChart
            data={painData}
            label={t('home.pain')}
            color={Colors.error}
            isDark={isDark}
            maxValue={10}
          />
          <MiniChart
            data={fatigueData}
            label={t('home.fatigue')}
            color={Colors.warning}
            isDark={isDark}
            maxValue={10}
          />
          <MiniChart
            data={moodData}
            label={t('home.mood')}
            color={Colors.moodGood}
            isDark={isDark}
            maxValue={5}
          />
        </View>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();

  const { todayLogged, streak, isLoading: logLoading } = useDailyLog();
  const { logs, isLoading: weekLoading, spondyScore } = useWeeklyData();
  const { activeFlare, flares, isLoading: flaresLoading } = useFlares();

  const greetingKey = getGreetingKey();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? '';

  const isLoading = logLoading || weekLoading;

  // Find most recent ended flare for this week
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentEndedFlare = flares.find(
    (f) =>
      f.end_date &&
      new Date(f.end_date) >= weekAgo &&
      !activeFlare
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <LoadingSpinner fullScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.greeting, isDark && styles.textPrimaryDark]} numberOfLines={2}>
            {t(`home.${greetingKey}`)}
            {firstName ? `, ${firstName}` : ''}
          </Text>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
        </View>

        {/* Check-in prompt */}
        {!todayLogged && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/track')}
            style={[styles.checkInCard, isDark && styles.checkInCardDark]}
            activeOpacity={0.8}
          >
            <View>
              <Text style={styles.checkInTitle}>{t('home.check_in_card_title')}</Text>
              <Text style={styles.checkInSubtitle}>{t('home.check_in_card_subtitle')}</Text>
            </View>
            <Text style={styles.checkInArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Spondy score */}
        <SpondyScoreCard score={spondyScore} isDark={isDark} t={t} />

        {/* Weekly trends */}
        <WeeklyTrends logs={logs} isDark={isDark} t={t} />

        {/* Active flare info */}
        {activeFlare && (
          <View style={[styles.flareInfoCard, isDark && styles.flareInfoCardDark]}>
            <Text style={styles.flareInfoBadge}>🔴 {t('flares.active_flare')}</Text>
            <Text style={[styles.flareInfoText, isDark && styles.textSecDark]}>
              {t('flares.started')}: {new Date(activeFlare.start_date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          </View>
        )}

        {!activeFlare && recentEndedFlare && recentEndedFlare.end_date && (
          <View style={[styles.flareInfoCard, isDark && styles.flareInfoCardDark]}>
            <Text style={[styles.flareInfoBadge, { color: Colors.textSecondary }]}>
              {t('flares.ended_ago', { days: daysBetween(recentEndedFlare.end_date) })}
            </Text>
          </View>
        )}

        <View style={styles.bottomPad} />
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  greeting: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  textPrimaryDark: {
    color: Colors.textPrimaryDark,
  },
  textSecDark: {
    color: Colors.textSecondaryDark,
  },
  streakBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  streakText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Check-in card
  checkInCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkInCardDark: {
    backgroundColor: Colors.primaryDark,
  },
  checkInTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  checkInSubtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
  },
  checkInArrow: {
    fontSize: FontSize.xl,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Generic card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  cardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Spondy score
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: FontSize.xxxl,
    fontWeight: '900',
    lineHeight: 42,
  },
  scoreOutOf: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    opacity: 0.7,
  },
  scoreSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },

  // No data
  noDataText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // Charts row
  chartsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  miniChartContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  miniChartLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  miniChartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniChartEmptyDot: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    letterSpacing: 4,
  },

  // Flare info
  flareInfoCard: {
    backgroundColor: Colors.error + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '40',
    gap: Spacing.xs,
  },
  flareInfoCardDark: {
    backgroundColor: '#450A0A',
    borderColor: Colors.error + '60',
  },
  flareInfoBadge: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.error,
  },
  flareInfoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  bottomPad: {
    height: Spacing.xl,
  },
});
