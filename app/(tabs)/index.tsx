import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useDailyLog } from '@/hooks/useDailyLog';
import { useWeeklyData } from '@/hooks/useWeeklyData';
import { useFlares } from '@/hooks/useFlares';
import { useFlareRisk } from '@/hooks/useFlareRisk';
import { useHealthHistory } from '@/hooks/useHealthHistory';
import { useHealthData } from '@/hooks/useHealthData';
import { useBiologicInjections } from '@/hooks/useBiologicInjections';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SpondyMark } from '@/components/common/SpondyMark';
import { ProfileButton } from '@/components/common/ProfileButton';
import { sendFlareWarningIfNeeded, evaluateAndSendNudges } from '@/services/notifications';
import { DailyLog, Flare, Mood } from '@/types';

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

function moodToPoints(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 15;
    case 'good': return 10;
    case 'okay': return 0;
    case 'low': return -5;
    case 'very_low': return -15;
    default: return 0;
  }
}

function medicationToPoints(taken: 'yes' | 'no' | 'partial' | undefined): number {
  switch (taken) {
    case 'yes': return 15;
    case 'partial': return 7.5;
    default: return 0;
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return Colors.success;
  if (score >= 40) return Colors.warning;
  return Colors.error;
}

function stepsColor(steps: number): string {
  if (steps < 3000 || steps > 12000) return Colors.error;
  if (steps < 6000) return Colors.warning;
  return Colors.success;
}

function sleepColor(hours: number): string {
  if (hours < 5.5 || hours > 9) return Colors.error;
  if (hours < 7) return Colors.warning;
  return Colors.success;
}

function hrvColor(hrv: number): string {
  if (hrv < 25) return Colors.error;
  if (hrv < 40) return Colors.warning;
  return Colors.success;
}

function flareEndedLabel(endDate: string): string {
  const ms = Date.now() - new Date(endDate).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Flare ended today';
  if (days === 1) return 'Flare ended yesterday';
  return `Flare ended ${days} days ago`;
}

// ─── Spondy Score Card — horizontal design ────────────────────────────────────

interface ScoreBreakdown {
  painPenalty: number;
  fatiguePenalty: number;
  activeFlarePenalty: number;
  consistencyBonus: number;
  moodPoints: number;
  medPoints: number;
  logCount: number;
}

function computeBreakdown(logs: DailyLog[], activeFlare: Flare | null): ScoreBreakdown | null {
  if (logs.length === 0) return null;
  const count = logs.length;
  const avgPain = logs.reduce((s, l) => s + l.pain_score, 0) / count;
  const avgFatigue = logs.reduce((s, l) => s + l.fatigue_score, 0) / count;
  const avgMoodPoints = logs.reduce((s, l) => s + moodToPoints(l.mood), 0) / count;
  const avgMedPoints = logs.reduce((s, l) => s + medicationToPoints(l.medications_taken), 0) / count;

  let flarePenalty = 0;
  if (activeFlare) {
    switch (activeFlare.severity) {
      case 'severe': flarePenalty = 35; break;
      case 'moderate': flarePenalty = 25; break;
      default: flarePenalty = 15;
    }
  }

  return {
    painPenalty: Math.round((avgPain / 10) * 30),
    fatiguePenalty: Math.round((avgFatigue / 10) * 20),
    activeFlarePenalty: flarePenalty,
    consistencyBonus: Math.round((count / 7) * 20),
    moodPoints: Math.round(avgMoodPoints),
    medPoints: Math.round(avgMedPoints),
    logCount: count,
  };
}

function SpondyScoreCard({
  score,
  logs,
  activeFlare,
  isDark,
  t,
}: {
  score: number | null;
  logs: DailyLog[];
  activeFlare: Flare | null;
  isDark: boolean;
  t: (key: string) => string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const color = score !== null ? scoreColor(score) : Colors.textSecondary;
  const breakdown = score !== null ? computeBreakdown(logs, activeFlare) : null;
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const textPri = isDark ? Colors.textPrimaryDark : Colors.textPrimary;

  function FactorRow({ label, value, positive }: { label: string; value: number; positive: boolean }) {
    if (value === 0) return null;
    const sign = positive ? '+' : '−';
    const col = positive ? Colors.success : Colors.error;
    return (
      <View style={styles.factorRow}>
        <Text style={[styles.factorLabel, { color: textSec }]}>{label}</Text>
        <Text style={[styles.factorValue, { color: col }]}>{sign}{Math.abs(value)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <View style={styles.scoreCardHeader}>
        <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>
          {t('home.spondy_score')}
        </Text>
        {score !== null && (
          <TouchableOpacity
            onPress={() => setShowBreakdown((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={[styles.infoIcon, { color: showBreakdown ? Colors.primary : textSec }]}>ⓘ</Text>
          </TouchableOpacity>
        )}
      </View>

      {score !== null ? (
        <>
          {/* Horizontal layout: big number left, bar right */}
          <View style={styles.scoreHorizontalRow}>
            <View style={styles.scoreNumberBlock}>
              <Text style={[styles.scoreNumberLarge, { color }]}>{score}</Text>
              <Text style={[styles.scoreOutOf, { color: textSec }]}>/100</Text>
            </View>
            <View style={styles.scoreBarBlock}>
              <View style={[styles.scoreBarTrack, isDark && styles.scoreBarTrackDark]}>
                <View
                  style={[
                    styles.scoreBarFill,
                    { width: `${score}%` as any, backgroundColor: color },
                  ]}
                />
              </View>
              <Text style={[styles.scoreBarLabel, { color }]}>
                {score >= 70 ? 'Managing well' : score >= 40 ? 'Moderate symptoms' : 'High symptom load'}
              </Text>
              <Text style={[styles.scoreHint, { color: textSec }]}>
                Based on {breakdown?.logCount ?? 0} day{(breakdown?.logCount ?? 0) !== 1 ? 's' : ''} this week
              </Text>
            </View>
          </View>

          {showBreakdown && breakdown && (
            <View style={[styles.breakdownBox, isDark && styles.breakdownBoxDark]}>
              <Text style={[styles.breakdownTitle, { color: textSec }]}>Score breakdown</Text>
              <FactorRow label="Base" value={75} positive={true} />
              {breakdown.painPenalty > 0 && <FactorRow label="Pain" value={breakdown.painPenalty} positive={false} />}
              {breakdown.fatiguePenalty > 0 && <FactorRow label="Fatigue" value={breakdown.fatiguePenalty} positive={false} />}
              {breakdown.activeFlarePenalty > 0 && <FactorRow label="Active flare" value={breakdown.activeFlarePenalty} positive={false} />}
              {breakdown.consistencyBonus > 0 && <FactorRow label="Logging streak" value={breakdown.consistencyBonus} positive={true} />}
              {breakdown.moodPoints !== 0 && <FactorRow label="Mood" value={Math.abs(breakdown.moodPoints)} positive={breakdown.moodPoints >= 0} />}
              {breakdown.medPoints > 0 && <FactorRow label="Medication adherence" value={breakdown.medPoints} positive={true} />}
            </View>
          )}
        </>
      ) : (
        <Text style={[styles.noDataText, isDark && styles.textSecDark]}>
          {t('home.spondy_score_no_data')}
        </Text>
      )}
    </View>
  );
}

// ─── Mini line chart — kept for internal use ──────────────────────────────────

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

// ─── 7-day pain overview (replaces WeeklyTrends mini charts) ─────────────────

function painDotColor(pain: number): string {
  if (pain <= 3) return Colors.success;
  if (pain <= 6) return Colors.warning;
  return Colors.error;
}

function SevenDayOverview({
  logs,
  isDark,
  t,
}: {
  logs: DailyLog[];
  isDark: boolean;
  t: (key: string) => string;
}) {
  // Build last 7 days (Mon-Sun style, most recent 7 calendar days)
  const days: { dayLabel: string; log: DailyLog | null }[] = [];
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const log = logs.find((l) => l.date === dateStr) ?? null;
    days.push({ dayLabel: DAY_ABBR[d.getDay()], log });
  }

  const hasAnyData = days.some((d) => d.log !== null);
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const textPri = isDark ? Colors.textPrimaryDark : Colors.textPrimary;

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>
        {t('home.this_week')}
      </Text>
      {!hasAnyData ? (
        <Text style={[styles.noDataText, isDark && styles.textSecDark]}>
          {t('home.no_data_yet')}
        </Text>
      ) : (
        <View style={styles.weekDotRow}>
          {days.map(({ dayLabel, log }, idx) => {
            const hasPain = log !== null;
            const dotColor = hasPain ? painDotColor(log!.pain_score) : (isDark ? '#3A3330' : '#F5F5F4');
            const textColor = hasPain ? '#FFFFFF' : textSec;
            return (
              <View key={idx} style={styles.weekDotItem}>
                <View style={[styles.weekDot, { backgroundColor: dotColor }]}>
                  <Text style={[styles.weekDotNumber, { color: textColor }]}>
                    {hasPain ? log!.pain_score : '·'}
                  </Text>
                </View>
                <Text style={[styles.weekDotDay, { color: textSec }]}>{dayLabel}</Text>
              </View>
            );
          })}
        </View>
      )}
      {hasAnyData && (
        <View style={styles.weekLegendRow}>
          <View style={styles.weekLegendItem}>
            <View style={[styles.weekLegendDot, { backgroundColor: Colors.success }]} />
            <Text style={[styles.weekLegendText, { color: textSec }]}>Low (0–3)</Text>
          </View>
          <View style={styles.weekLegendItem}>
            <View style={[styles.weekLegendDot, { backgroundColor: Colors.warning }]} />
            <Text style={[styles.weekLegendText, { color: textSec }]}>Moderate (4–6)</Text>
          </View>
          <View style={styles.weekLegendItem}>
            <View style={[styles.weekLegendDot, { backgroundColor: Colors.error }]} />
            <Text style={[styles.weekLegendText, { color: textSec }]}>High (7–10)</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── WeeklyTrends — kept (used internally, referenced by SevenDayOverview) ───

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
          <MiniChart data={painData} label={t('home.pain')} color={Colors.error} isDark={isDark} maxValue={10} />
          <MiniChart data={fatigueData} label={t('home.fatigue')} color={Colors.warning} isDark={isDark} maxValue={10} />
          <MiniChart data={moodData} label={t('home.mood')} color={Colors.moodGood} isDark={isDark} maxValue={5} />
        </View>
      )}
    </View>
  );
}

// ─── Flare Risk Card ──────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  pain_rising: '↑ Pain trending up',
  fatigue_rising: '↑ Fatigue increasing',
  stiffness_worsening: '⏱ Long morning stiffness',
  missed_medication: '💊 Missed medications',
  mood_declining: '↓ Mood declining',
  hrv_dropping: '❤️ HRV dropping',
  poor_sleep: '😴 Poor sleep',
  hr_elevated: '❤️‍🔥 Elevated heart rate',
  low_activity: '🚶 Reduced activity',
  inflammatory_diet: '🍽️ Inflammatory diet',
  recent_alcohol: '🍷 Recent alcohol',
  high_starch_intake: '🌾 High starch intake',
};

function FlareRiskCard({
  level,
  signals,
  isDark,
}: {
  level: 'watch' | 'warning';
  signals: string[];
  isDark: boolean;
}) {
  const isWarning = level === 'warning';
  const accentColor = isWarning ? Colors.error : Colors.warning;
  const bgColor = isWarning
    ? isDark ? '#450A0A' : Colors.error + '12'
    : isDark ? '#3A2500' : Colors.warning + '12';
  const borderColor = isWarning ? Colors.error + '50' : Colors.warning + '50';

  return (
    <View style={[styles.flareRiskCard, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.flareRiskTitle, { color: accentColor }]}>
        {isWarning ? '⚠️ Possible flare building' : '👀 Symptoms to watch'}
      </Text>
      <Text style={[styles.flareRiskBody, isDark && styles.textSecDark]}>
        {isWarning
          ? 'Several signals suggest a flare could be building. Rest up and check your medications.'
          : 'A couple of signals worth watching. Keep an eye on how you feel over the next day or two.'}
      </Text>
      <View style={styles.flareRiskSignals}>
        {signals.map((s) => (
          <View key={s} style={[styles.flareRiskChip, { borderColor: accentColor + '60' }]}>
            <Text style={[styles.flareRiskChipText, { color: accentColor }]}>
              {SIGNAL_LABELS[s] ?? s}
            </Text>
          </View>
        ))}
      </View>
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

  const { todayLog, todayLogged, streak, isLoading: logLoading, refresh: refreshLog } = useDailyLog();
  const { logs, isLoading: weekLoading, spondyScore, refresh: refreshWeekly } = useWeeklyData();
  const { activeFlare, flares, isLoading: flaresLoading } = useFlares();
  const { history: healthHistory } = useHealthHistory(7);
  const { isConnected: healthConnected, todayData: healthData } = useHealthData();
  const flareRisk = useFlareRisk(logs, activeFlare, healthHistory);
  const { injections: biologicInjections } = useBiologicInjections();

  const nextBiologicDue = useMemo(() => {
    if (biologicInjections.length === 0) return null;
    const last = biologicInjections[0];
    const due = new Date(last.injected_at + 'T12:00:00');
    due.setDate(due.getDate() + last.interval_days);
    const daysUntil = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { name: last.medication_name, daysUntil, dueDate: due.toISOString().split('T')[0] };
  }, [biologicInjections]);

  // Refresh streak and weekly data when returning from Track tab
  useFocusEffect(useCallback(() => {
    refreshLog();
    refreshWeekly();
  }, [refreshLog, refreshWeekly]));

  // Send flare warning notification when risk is elevated (once per day max)
  useEffect(() => {
    if (!user || flareRisk.level === 'none') return;
    sendFlareWarningIfNeeded(user.id, flareRisk.level).catch(() => {});
  }, [user, flareRisk.level]);

  // Proactive nudges — sleep, pain trend, fatigue, mood (once per day max)
  useEffect(() => {
    if (!user || logs.length < 3) return;
    evaluateAndSendNudges(user.id, logs).catch(() => {});
  }, [user, logs]);

  const greetingKey = getGreetingKey();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? '';

  const isLoading = logLoading || weekLoading;

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentEndedFlare = flares.find(
    (f) => f.end_date && new Date(f.end_date) >= weekAgo && !activeFlare
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
        {/* 1. Greeting — text only, no logo */}
        <View style={styles.headerRow}>
          <Text style={[styles.greeting, isDark && styles.textPrimaryDark]} numberOfLines={2}>
            {t(`home.${greetingKey}`)}
            {firstName ? `, ${firstName}` : ''}
          </Text>
          <ProfileButton />
        </View>

        {/* 2. Active flare card — FIRST prominent thing (bad news up top) */}
        {activeFlare && (
          <View style={[styles.activeFlareCard, isDark && styles.activeFlareCardDark]}>
            <Text style={styles.activeFlareBadge}>🔴 {t('flares.active_flare')}</Text>
            <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
              {t('flares.started')}: {new Date(activeFlare.start_date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          </View>
        )}

        {/* 2b. Flare risk card — shown prominently if no active flare */}
        {!activeFlare && flareRisk.level !== 'none' && (
          <FlareRiskCard level={flareRisk.level} signals={flareRisk.signals} isDark={isDark} />
        )}

        {/* 2c. Biologic countdown */}
        {nextBiologicDue && (
          <View style={[styles.biologicCard, isDark && styles.biologicCardDark]}>
            <Text style={[styles.biologicTitle, isDark && styles.textPrimaryDark]}>
              {nextBiologicDue.name}
            </Text>
            <Text style={[
              styles.biologicCountdown,
              { color: nextBiologicDue.daysUntil <= 0 ? Colors.error : nextBiologicDue.daysUntil <= 2 ? Colors.warning : Colors.success }
            ]}>
              {nextBiologicDue.daysUntil <= 0
                ? 'Due today'
                : nextBiologicDue.daysUntil === 1
                ? 'Due tomorrow'
                : `Due in ${nextBiologicDue.daysUntil} days`}

            </Text>
          </View>
        )}

        {/* 3. Check-in hero (before logging) or today summary (after logging) */}
        {!todayLogged ? (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/track')}
            style={[styles.checkInHero, isDark && styles.checkInHeroDark]}
            activeOpacity={0.85}
          >
            <View style={styles.checkInHeroInner}>
              <Text style={styles.checkInHeroTitle}>{t('home.check_in_card_title')}</Text>
              <Text style={styles.checkInHeroSubtitle}>{t('home.check_in_card_subtitle')}</Text>
              <View style={styles.checkInHeroButton}>
                <Text style={styles.checkInHeroButtonText}>Start check-in →</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : todayLog ? (
          <View style={[styles.todaySummaryCard, isDark && styles.todaySummaryCardDark]}>
            <View style={styles.todaySummaryHeader}>
              <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>Today's log</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/track')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.todaySummaryEdit, { color: Colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.todaySummaryRow}>
              <View style={styles.todaySummaryItem}>
                <Text style={[styles.todaySummaryValue, { color: painDotColor(todayLog.pain_score) }]}>
                  {todayLog.pain_score}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>Pain</Text>
              </View>
              <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
              <View style={styles.todaySummaryItem}>
                <Text style={[styles.todaySummaryValue, {
                  color: todayLog.fatigue_score >= 7 ? Colors.error : todayLog.fatigue_score >= 4 ? Colors.warning : Colors.success
                }]}>
                  {todayLog.fatigue_score}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>Fatigue</Text>
              </View>
              <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
              <View style={styles.todaySummaryItem}>
                <Text style={styles.todaySummaryMoodEmoji}>
                  {todayLog.mood === 'great' ? '😄' : todayLog.mood === 'good' ? '🙂' : todayLog.mood === 'okay' ? '😐' : todayLog.mood === 'low' ? '😔' : '😞'}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>Mood</Text>
              </View>
              <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
              <View style={styles.todaySummaryItem}>
                <Text style={[styles.todaySummaryValue, {
                  color: todayLog.medications_taken === 'yes' ? Colors.success : todayLog.medications_taken === 'partial' ? Colors.warning : Colors.error
                }]}>
                  {todayLog.medications_taken === 'yes' ? '✓' : todayLog.medications_taken === 'partial' ? '~' : '✗'}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>Meds</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Health data — shown after logging, when Apple Health is connected */}
        {todayLogged && healthConnected && healthData && (
          <View style={[styles.healthCard, isDark && styles.healthCardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>
              {t('health.today_context')}
            </Text>
            <View style={styles.todaySummaryRow}>
              {healthData.steps !== null && (
                <>
                  <View style={styles.todaySummaryItem}>
                    <Text style={[styles.healthStatValue, { color: stepsColor(healthData.steps) }]}>
                      {(healthData.steps / 1000).toFixed(1)}k
                    </Text>
                    <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>Steps</Text>
                  </View>
                  {(healthData.sleep_duration !== null || healthData.hrv !== null) && (
                    <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
                  )}
                </>
              )}
              {healthData.sleep_duration !== null && (
                <>
                  <View style={styles.todaySummaryItem}>
                    <Text style={[styles.healthStatValue, { color: sleepColor(healthData.sleep_duration) }]}>
                      {healthData.sleep_duration}h
                    </Text>
                    <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>Sleep</Text>
                  </View>
                  {healthData.hrv !== null && (
                    <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
                  )}
                </>
              )}
              {healthData.hrv !== null && (
                <View style={styles.todaySummaryItem}>
                  <Text style={[styles.healthStatValue, { color: hrvColor(healthData.hrv) }]}>
                    {healthData.hrv}
                  </Text>
                  <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>HRV</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 4. Spondy score — horizontal design */}
        <SpondyScoreCard score={spondyScore} logs={logs} activeFlare={activeFlare} isDark={isDark} t={t} />

        {/* 5. 7-day pain overview — colored pill indicators */}
        <SevenDayOverview logs={logs} isDark={isDark} t={t} />

        {/* 6. Flare recovery card at bottom */}
        {!activeFlare && recentEndedFlare?.end_date && (
          <View style={[styles.flareRecoveryCard, isDark && styles.flareRecoveryCardDark]}>
            <Text style={[styles.flareRecoveryText, isDark && styles.textSecDark]}>
              ✓ {flareEndedLabel(recentEndedFlare.end_date)}
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

  // Header — greeting only
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  greeting: {
    fontSize: FontSize.xl,
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
  },
  streakText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Active flare card — red
  activeFlareCard: {
    backgroundColor: Colors.error + '15',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.error + '50',
    gap: Spacing.xs,
  },
  activeFlareCardDark: {
    backgroundColor: '#450A0A',
    borderColor: Colors.error + '60',
  },
  activeFlareBadge: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.error,
  },
  activeFlareDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Check-in hero card (pre-log)
  checkInHero: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  checkInHeroDark: {
    backgroundColor: Colors.primaryDark,
  },
  checkInHeroInner: {
    gap: Spacing.sm,
  },
  checkInHeroTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 30,
  },
  checkInHeroSubtitle: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 22,
  },
  checkInHeroButton: {
    marginTop: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
  },
  checkInHeroButtonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Today summary card (post-log)
  todaySummaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  todaySummaryCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  todaySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todaySummaryLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  todaySummaryEdit: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  todaySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  todaySummaryItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  todaySummaryValue: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    lineHeight: 30,
  },
  todaySummaryMoodEmoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  todaySummaryItemLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  todaySummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  todaySummaryDividerDark: {
    backgroundColor: Colors.borderDark,
  },

  // Legacy check-in card styles kept for unused component compatibility
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

  // Spondy score — horizontal
  scoreCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoIcon: {
    fontSize: FontSize.lg,
  },
  scoreHorizontalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreNumberBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  scoreNumberLarge: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 52,
  },
  scoreOutOf: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    paddingBottom: 6,
  },
  scoreBarBlock: {
    flex: 1,
    gap: 4,
  },
  scoreBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  scoreBarTrackDark: {
    backgroundColor: Colors.borderDark,
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  scoreBarLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  scoreHint: {
    fontSize: FontSize.xs,
    lineHeight: 16,
  },

  // Score circle kept for internal use
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: FontSize.xxxl,
    fontWeight: '900',
    lineHeight: 40,
  },
  scoreLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  scoreRight: {
    flex: 1,
    gap: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  breakdownBox: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  breakdownBoxDark: {
    backgroundColor: '#2A2420',
  },
  breakdownTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  factorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  factorLabel: {
    fontSize: FontSize.xs,
  },
  factorValue: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // No data
  noDataText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // 7-day overview
  weekDotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  weekDotItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  weekDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotNumber: {
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  weekDotDay: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  weekLegendRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
  },
  weekLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weekLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  weekLegendText: {
    fontSize: 10,
  },

  // Charts row (kept for WeeklyTrends internal use)
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

  // Flare recovery
  flareRecoveryCard: {
    backgroundColor: Colors.success + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  flareRecoveryCardDark: {
    backgroundColor: '#052E16',
    borderColor: Colors.success + '60',
  },
  flareRecoveryText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.success,
  },

  // Flare risk card
  flareRiskCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  flareRiskTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  flareRiskBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  flareRiskSignals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  flareRiskChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  flareRiskChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },

  // Unused flare info card styles kept for unused component compatibility
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

  // Health card (Today screen) — same size/structure as todaySummaryCard
  healthCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  healthCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  healthStatValue: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    lineHeight: 30,
    color: Colors.textPrimary,
  },

  // Biologic countdown card
  biologicCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biologicCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  biologicTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  biologicCountdown: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
