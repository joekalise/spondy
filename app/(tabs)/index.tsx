import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { tPlural } from '@/i18n';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { FontSize, FontFamily, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useDailyLog } from '@/hooks/useDailyLog';
import { useWeeklyData } from '@/hooks/useWeeklyData';
import { useFlares } from '@/hooks/useFlares';
import { useFlareRisk } from '@/hooks/useFlareRisk';
import { useHealthHistory } from '@/hooks/useHealthHistory';
import { useHealthData } from '@/hooks/useHealthData';
import { useRecoveryData } from '@/hooks/useRecoveryData';
import { useBiologicInjections } from '@/hooks/useBiologicInjections';
import { useMedicationTracking } from '@/hooks/useMedicationTracking';
import { useMedications } from '@/hooks/useMedications';
import { useSubscription } from '@/hooks/useSubscription';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { useWeatherHumidity } from '@/hooks/useWeatherHumidity';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { SpondyMark } from '@/components/common/SpondyMark';
import { ProfileButton } from '@/components/common/ProfileButton';
import { InfoButton } from '@/components/common/InfoButton';
import { PremiumModal } from '@/components/common/PremiumModal';
import { sendFlareWarningIfNeeded, evaluateAndSendNudges } from '@/services/notifications';
import { logEvent, Events } from '@/services/analytics';
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

function spo2Color(v: number): string {
  if (v >= 95) return Colors.success;
  if (v >= 90) return Colors.warning;
  return Colors.error;
}

function respColor(v: number): string {
  if (v >= 12 && v <= 18) return Colors.success;
  if (v > 18 && v <= 22) return Colors.warning;
  return Colors.error;
}

function humidityColor(pct: number): string {
  if (pct > 70) return Colors.error;
  if (pct >= 40) return Colors.warning;
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

function SpondyScoreCard({
  score,
  breakdown,
  logs,
  isDark,
  t,
}: {
  score: number | null;
  breakdown: import('@/hooks/useWeeklyData').ScoreBreakdown | null;
  logs: DailyLog[];
  isDark: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const color = score !== null ? scoreColor(score) : Colors.textSecondary;
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  function FactorRow({ label, value }: { label: string; value: number }) {
    if (value === 0) return null;
    const sign = value > 0 ? '+' : '−';
    const col = value > 0 ? Colors.success : Colors.error;
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
                {score >= 70 ? t('home.score_managing_well') : score >= 40 ? t('home.score_moderate_symptoms') : t('home.score_high_symptom_load')}
              </Text>
              <Text style={[styles.scoreHint, { color: textSec }]}>
                {tPlural(t, 'home.score_based_on_days', breakdown?.logCount ?? 0)}
              </Text>
            </View>
          </View>

          {showBreakdown && breakdown && (
            <View style={[styles.breakdownBox, isDark && styles.breakdownBoxDark]}>
              <Text style={[styles.breakdownTitle, { color: textSec }]}>{t('score.breakdown')}</Text>
              <FactorRow label={t('score.factor_base')} value={breakdown.base} />
              <FactorRow label={t('score.factor_pain')} value={breakdown.painPoints} />
              <FactorRow label={t('score.factor_fatigue')} value={breakdown.fatiguePoints} />
              {breakdown.activeFlarePenalty > 0 && <FactorRow label={t('score.factor_active_flare')} value={-breakdown.activeFlarePenalty} />}
              {breakdown.recentFlarePenalty > 0 && <FactorRow label={t('score.factor_recent_flare')} value={-breakdown.recentFlarePenalty} />}
              {breakdown.conditionPenalty > 0 && <FactorRow label={t('score.factor_condition')} value={-breakdown.conditionPenalty} />}
              <FactorRow label={t('score.factor_streak')} value={breakdown.consistencyBonus} />
              <FactorRow label={t('score.factor_mood')} value={breakdown.moodPoints} />
              <FactorRow label={t('score.factor_medication')} value={breakdown.medPoints} />
            </View>
          )}
        </>
      ) : (
        <Text style={[styles.noDataText, isDark && styles.textSecDark]}>
          {logs.length === 0
            ? t('home.spondy_score_no_data')
            : logs.length === 1
            ? 'Log 2 more days to see your score'
            : 'Log 1 more day to see your score'}
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
  const DAY_ABBR_KEYS = ['common.day_short.sun', 'common.day_short.mon', 'common.day_short.tue', 'common.day_short.wed', 'common.day_short.thu', 'common.day_short.fri', 'common.day_short.sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const log = logs.find((l) => l.date === dateStr) ?? null;
    days.push({ dayLabel: t(DAY_ABBR_KEYS[d.getDay()]), log });
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
            <Text style={[styles.weekLegendText, { color: textSec }]}>{t('home.legend_low')}</Text>
          </View>
          <View style={styles.weekLegendItem}>
            <View style={[styles.weekLegendDot, { backgroundColor: Colors.warning }]} />
            <Text style={[styles.weekLegendText, { color: textSec }]}>{t('home.legend_moderate')}</Text>
          </View>
          <View style={styles.weekLegendItem}>
            <View style={[styles.weekLegendDot, { backgroundColor: Colors.error }]} />
            <Text style={[styles.weekLegendText, { color: textSec }]}>{t('home.legend_high')}</Text>
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

const SIGNAL_LABEL_KEYS: Record<string, string> = {
  pain_rising: 'home.signal.pain_rising',
  fatigue_rising: 'home.signal.fatigue_rising',
  stiffness_worsening: 'home.signal.stiffness_worsening',
  missed_medication: 'home.signal.missed_medication',
  mood_declining: 'home.signal.mood_declining',
  hrv_dropping: 'home.signal.hrv_dropping',
  poor_sleep: 'home.signal.poor_sleep',
  hr_elevated: 'home.signal.hr_elevated',
  low_activity: 'home.signal.low_activity',
  inflammatory_diet: 'home.signal.inflammatory_diet',
  recent_alcohol: 'home.signal.recent_alcohol',
  high_starch_intake: 'home.signal.high_starch_intake',
  low_spo2: 'home.signal.low_spo2',
  elevated_resp_rate: 'home.signal.elevated_resp_rate',
};

function FlareRiskCard({
  level,
  signals,
  isDark,
  isPremium,
  onChatPress,
  onUpgradePress,
}: {
  level: 'watch' | 'warning';
  signals: string[];
  isDark: boolean;
  isPremium: boolean;
  onChatPress: () => void;
  onUpgradePress: () => void;
}) {
  const { t } = useTranslation();
  const isWarning = level === 'warning';
  const accentColor = isWarning ? Colors.error : Colors.warning;
  const bgColor = isWarning
    ? isDark ? '#450A0A' : Colors.error + '12'
    : isDark ? '#3A2500' : Colors.warning + '12';
  const borderColor = isWarning ? Colors.error + '50' : Colors.warning + '50';

  return (
    <View style={[styles.flareRiskCard, { backgroundColor: bgColor, borderColor }]}>
      <View style={styles.flareRiskTitleRow}>
        <Text style={[styles.flareRiskTitle, { color: accentColor }]}>
          {isWarning ? `⚠️ ${t('home.flare_building_title')}` : `👀 ${t('home.symptoms_to_watch_title')}`}
        </Text>
        {!isPremium && (
          <View style={styles.flarePremiumBadge}>
            <Text style={styles.flarePremiumBadgeText}>{t('common.premium')}</Text>
          </View>
        )}
      </View>
      {isPremium ? (
        <>
          <Text style={[styles.flareRiskBody, isDark && styles.textSecDark]}>
            {isWarning
              ? t('home.flare_building_body')
              : t('home.symptoms_to_watch_body')}
          </Text>
          <View style={styles.flareRiskSignals}>
            {signals.map((s) => (
              <View key={s} style={[styles.flareRiskChip, { borderColor: accentColor + '60' }]}>
                <Text style={[styles.flareRiskChipText, { color: accentColor }]}>
                  {SIGNAL_LABEL_KEYS[s] ? t(SIGNAL_LABEL_KEYS[s]) : s}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.flareChatRow}>
            <TouchableOpacity
              onPress={onChatPress}
              style={[styles.flareChatBtn, { backgroundColor: accentColor }]}
              activeOpacity={0.8}
            >
              <Text style={styles.flareChatBtnText}>{t('home.chat_about_this')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.flareRiskBody, isDark && styles.textSecDark]}>
            {t('home.flare_risk_locked_body')}
          </Text>
          <View style={styles.flareChatRow}>
            <TouchableOpacity
              onPress={onUpgradePress}
              style={[styles.flareChatBtn, { backgroundColor: accentColor }]}
              activeOpacity={0.8}
            >
              <Text style={styles.flareChatBtnText}>{t('home.flare_risk_unlock_cta')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Review prompt card ───────────────────────────────────────────────────────

function ReviewPromptCard({
  isDark,
  onReview,
  onDismiss,
}: {
  isDark: boolean;
  onReview: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSec = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <Text style={[styles.reviewTitle, { color: textPrimary }]}>{t('home.review_title')}</Text>
      <Text style={[styles.reviewBody, { color: textSec }]}>
        Your review helps more people with AS find the app. It only takes a moment.
      </Text>
      <View style={styles.reviewButtons}>
        <TouchableOpacity
          style={[styles.reviewBtnPrimary, { backgroundColor: Colors.primary }]}
          onPress={onReview}
          activeOpacity={0.8}
        >
          <Text style={styles.reviewBtnPrimaryText}>{t('home.review_cta')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={styles.reviewBtnDismiss}>
          <Text style={[styles.reviewBtnDismissText, { color: textSec }]}>{t('home.review_dismiss')}</Text>
        </TouchableOpacity>
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
  const { isSubscribed: isPremium, monthlyPrice, trialDays, purchase, restore } = useSubscription();
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const { profile } = useProfile();

  const { todayLog, todayLogged, streak, isLoading: logLoading, refresh: refreshLog } = useDailyLog();
  const { tracks: tracksMedication } = useMedicationTracking();
  const { medications } = useMedications();
  const hasScheduledMeds = medications.some((m) => !m.as_needed);
  const tracksScheduledMeds = tracksMedication && hasScheduledMeds;
  const { logs, isLoading: weekLoading, spondyScore, scoreBreakdown, refresh: refreshWeekly } = useWeeklyData(tracksScheduledMeds);
  const { activeFlare, flares, isLoading: flaresLoading } = useFlares();
  const { history: healthHistory } = useHealthHistory(7);
  const { isConnected: healthConnected, todayData: healthData, recheck: recheckHealth } = useHealthData();
  const { data: recoveryData } = useRecoveryData();
  const flareRisk = useFlareRisk(logs, activeFlare, healthHistory, recoveryData, tracksScheduledMeds);
  const { injections: biologicInjections } = useBiologicInjections();
  const { humidity } = useWeatherHumidity();

  const nextBiologicDue = useMemo(() => {
    if (biologicInjections.length === 0) return null;
    const last = biologicInjections[0];
    const due = new Date(last.injected_at + 'T12:00:00');
    due.setDate(due.getDate() + last.interval_days);
    const daysUntil = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { name: last.medication_name, daysUntil, dueDate: due.toISOString().split('T')[0] };
  }, [biologicInjections]);

  // Refresh streak and weekly data when returning from Track tab; re-check health connection state
  useFocusEffect(useCallback(() => {
    refreshLog();
    refreshWeekly();
    recheckHealth();
  }, [refreshLog, refreshWeekly, recheckHealth]));

  // Review prompt — show to active users after 7 days
  const isActiveUser = streak > 0 || todayLogged;
  const { shouldShow: showReviewPrompt, markCompleted: markReviewCompleted, markDismissed: markReviewDismissed } =
    useReviewPrompt(user?.created_at, isActiveUser);

  const handleReviewPress = useCallback(async () => {
    await markReviewCompleted();
    const url = Platform.OS === 'android'
      ? 'market://details?id=com.spondy.app'
      : 'https://apps.apple.com/app/id6767585030?action=write-review';
    await Linking.openURL(url);
  }, [markReviewCompleted]);

  const handlePurchase = useCallback(async () => {
    setIsPurchasing(true);
    logEvent(Events.PURCHASE_STARTED).catch(() => {});
    try {
      const success = await purchase();
      if (success) {
        logEvent(Events.PURCHASE_SUCCESS).catch(() => {});
        setShowPremiumModal(false);
      } else {
        logEvent(Events.PURCHASE_CANCELLED).catch(() => {});
        Alert.alert('', t('profile.purchase_unavailable'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent(Events.PURCHASE_ERROR, { message: msg }).catch(() => {});
      Alert.alert('Purchase error', msg);
    } finally {
      setIsPurchasing(false);
    }
  }, [purchase, t]);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      const success = await restore();
      if (success) setShowPremiumModal(false);
      else Alert.alert('', t('common.no_purchases'));
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setIsRestoring(false);
    }
  }, [restore, t]);

  // Send flare warning notification when risk is elevated (once per day max) —
  // premium-only, otherwise the push leaks what the locked card withholds
  useEffect(() => {
    if (!user || !isPremium || flareRisk.level === 'none') return;
    sendFlareWarningIfNeeded(user.id, flareRisk.level).catch(() => {});
  }, [user, isPremium, flareRisk.level]);

  // Proactive nudges — sleep, pain trend, fatigue, mood (once per day max)
  useEffect(() => {
    if (!user || logs.length < 3) return;
    evaluateAndSendNudges(user.id, logs, recoveryData).catch(() => {});
  }, [user, logs]);

  const greetingKey = getGreetingKey();
  const firstName = profile?.preferred_name || user?.user_metadata?.full_name?.split(' ')[0] || '';
  const tracksMeds = tracksScheduledMeds;

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
          <FlareRiskCard
            level={flareRisk.level}
            signals={flareRisk.signals}
            isDark={isDark}
            isPremium={isPremium}
            onChatPress={() => router.push('/ai-chat')}
            onUpgradePress={() => setShowPremiumModal(true)}
          />
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
                <Text style={styles.checkInHeroButtonText}>{t('home.start_checkin')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : todayLog ? (
          <View style={[styles.todaySummaryCard, isDark && styles.todaySummaryCardDark]}>
            <View style={styles.todaySummaryHeader}>
              <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>{t('home.todays_log')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/track')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.todaySummaryEdit, { color: Colors.primary }]}>{t('common.edit')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.todaySummaryRow}>
              <View style={styles.todaySummaryItem}>
                <Text style={[styles.todaySummaryValue, { color: painDotColor(todayLog.pain_score) }]}>
                  {todayLog.pain_score}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.pain')}</Text>
              </View>
              <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
              <View style={styles.todaySummaryItem}>
                <Text style={[styles.todaySummaryValue, {
                  color: todayLog.fatigue_score >= 7 ? Colors.error : todayLog.fatigue_score >= 4 ? Colors.warning : Colors.success
                }]}>
                  {todayLog.fatigue_score}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.fatigue')}</Text>
              </View>
              <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
              <View style={styles.todaySummaryItem}>
                <Text style={styles.todaySummaryMoodEmoji}>
                  {todayLog.mood === 'great' ? '😄' : todayLog.mood === 'good' ? '🙂' : todayLog.mood === 'okay' ? '😐' : todayLog.mood === 'low' ? '😔' : todayLog.mood === 'very_low' ? '😞' : '—'}
                </Text>
                <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.mood')}</Text>
              </View>
              {tracksMeds && (
                <>
                  <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
                  <View style={styles.todaySummaryItem}>
                    <Text style={[styles.todaySummaryValue, {
                      color: todayLog.medications_taken === 'yes' ? Colors.success : todayLog.medications_taken === 'partial' ? Colors.warning : Colors.error
                    }]}>
                      {todayLog.medications_taken === 'yes' ? '✓' : todayLog.medications_taken === 'partial' ? '~' : '✗'}
                    </Text>
                    <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.meds')}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        ) : null}

        {/* Health data — shown after logging. Humidity rides along here too
            since it's conceptually the same "today's readings" content, and
            doesn't depend on Apple Health being connected. */}
        {todayLogged && ((healthConnected && (healthData || recoveryData)) || humidity) && (
          <View style={[styles.healthCard, isDark && styles.healthCardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textPrimaryDark]}>
              {t('health.today_context')}
            </Text>
            {healthData && (
              <View style={styles.todaySummaryRow}>
                {healthData.steps !== null && (
                  <>
                    <View style={styles.todaySummaryItem}>
                      <Text style={[styles.healthStatValue, { color: stepsColor(healthData.steps) }]}>
                        {(healthData.steps / 1000).toFixed(1)}k
                      </Text>
                      <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.steps')}</Text>
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
                      <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.sleep')}</Text>
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
                    <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{t('home.hrv')}</Text>
                  </View>
                )}
              </View>
            )}
            {healthData && (recoveryData || humidity) && (
              <View style={[styles.healthRowDivider, isDark && styles.healthRowDividerDark]} />
            )}
            {(recoveryData || humidity) && (() => {
              const items: { label: string; value: string; color: string }[] = [];
              if (recoveryData?.oxygen_saturation !== null && recoveryData?.oxygen_saturation !== undefined)
                items.push({ label: t('health.spo2'), value: `${recoveryData.oxygen_saturation}%`, color: spo2Color(recoveryData.oxygen_saturation) });
              if (recoveryData?.respiratory_rate !== null && recoveryData?.respiratory_rate !== undefined)
                items.push({ label: t('health.resp_rate'), value: `${recoveryData.respiratory_rate}/min`, color: respColor(recoveryData.respiratory_rate) });
              if (recoveryData?.mindful_minutes !== null && recoveryData?.mindful_minutes !== undefined && recoveryData.mindful_minutes > 0)
                items.push({ label: t('health.mindful'), value: `${recoveryData.mindful_minutes}m`, color: Colors.success });
              if (humidity)
                items.push({ label: t('health.humidity_title'), value: `${humidity.humidity}%`, color: humidityColor(humidity.humidity) });
              if (items.length === 0) return null;
              return (
                <View style={styles.todaySummaryRow}>
                  {items.map((item, i) => (
                    <React.Fragment key={item.label}>
                      <View style={styles.todaySummaryItem}>
                        <Text style={[styles.healthStatValue, { color: item.color }]}>{item.value}</Text>
                        <Text style={[styles.todaySummaryItemLabel, isDark && styles.textSecDark]}>{item.label}</Text>
                      </View>
                      {i < items.length - 1 && (
                        <View style={[styles.todaySummaryDivider, isDark && styles.todaySummaryDividerDark]} />
                      )}
                    </React.Fragment>
                  ))}
                </View>
              );
            })()}
          </View>
        )}

        {/* 4. Spondy score — horizontal design */}
        <SpondyScoreCard score={spondyScore} breakdown={scoreBreakdown} logs={logs} isDark={isDark} t={t} />

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

        {/* Review prompt — shown to active users after 7 days */}
        {showReviewPrompt && (
          <ReviewPromptCard
            isDark={isDark}
            onReview={handleReviewPress}
            onDismiss={markReviewDismissed}
          />
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <PremiumModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onPurchase={handlePurchase}
        onRestore={handleRestore}
        monthlyPrice={monthlyPrice}
        trialDays={trialDays}
        isPurchasing={isPurchasing}
        isRestoring={isRestoring}
        isDark={isDark}
      />
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
    fontFamily: FontFamily.extraBold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.extraBold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
    color: Colors.textPrimary,
  },
  todaySummaryEdit: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.extraBold,
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
    fontFamily: FontFamily.medium,
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
    fontFamily: FontFamily.extraBold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.extraBold,
    lineHeight: 52,
  },
  scoreOutOf: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.extraBold,
    lineHeight: 40,
  },
  scoreLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.extraBold,
  },
  weekDotDay: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.semiBold,
  },
  miniChartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniChartEmptyDot: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
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
    fontFamily: FontFamily.semiBold,
    color: Colors.success,
  },

  // Flare risk card
  flareRiskCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  flareRiskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  flareRiskTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    flex: 1,
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
    fontFamily: FontFamily.semiBold,
  },
  reviewCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  reviewTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
  },
  reviewBody: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  reviewButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  reviewBtnPrimary: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  reviewBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
  },
  reviewBtnDismiss: {
    paddingVertical: Spacing.xs,
  },
  reviewBtnDismissText: {
    fontSize: FontSize.sm,
  },

  flareChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  flareChatBtn: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  flareChatBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
  },
  flarePremiumBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  flarePremiumBadgeText: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.extraBold,
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
    fontFamily: FontFamily.semiBold,
    color: Colors.textPrimary,
  },
  biologicCountdown: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
  },

  // Recovery data row divider
  healthRowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  healthRowDividerDark: {
    backgroundColor: Colors.borderDark,
  },
});
