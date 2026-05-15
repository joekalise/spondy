import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  LayoutChangeEvent,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline, Line, Text as SvgText, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { getDailyLogs, getFlares, getStreak } from '@/services/database';
import { generateWeeklyInsight, WeeklyInsight } from '@/services/aiInsights';
import { useSubscription } from '@/hooks/useSubscription';
import { useHealthHistory } from '@/hooks/useHealthHistory';
import { useBasdai } from '@/hooks/useBasdai';
import { DailyLog, Flare, Mood, UserProfile, HealthData, BasdaiScore } from '@/types';
import { ProfileButton } from '@/components/common/ProfileButton';
import { InfoButton } from '@/components/common/InfoButton';
import { DragSlider } from '@/components/common/DragSlider';
import { PremiumModal } from '@/components/common/PremiumModal';
import { logEvent, Events } from '@/services/analytics';

// ─── Insight cache helpers ────────────────────────────────────────────────────

interface InsightCache {
  insight: WeeklyInsight;
  generatedAt: string; // ISO date string
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function insightCacheKey(userId: string): string {
  return `@spondy_insight_cache_${userId}`;
}

async function loadInsightCache(userId: string): Promise<InsightCache | null> {
  try {
    const raw = await AsyncStorage.getItem(insightCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as InsightCache;
  } catch {
    return null;
  }
}

async function saveInsightCache(userId: string, insight: WeeklyInsight): Promise<void> {
  const cache: InsightCache = { insight, generatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(insightCacheKey(userId), JSON.stringify(cache));
}

function cacheAgeLabel(generatedAt: string): string {
  const ms = Date.now() - new Date(generatedAt).getTime();
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (mins < 2) return 'just now';
  if (hours < 1) return `${mins} min ago`;
  if (days < 1) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendChartProps {
  series: Array<{ data: number[]; color: string; label: string }>;
  labels: string[];
  height: number;
  minVal?: number;
  maxVal?: number;
  width: number;
}

// ─── TrendChart component ─────────────────────────────────────────────────────

function TrendChart({
  series,
  labels,
  height,
  minVal = 0,
  maxVal = 10,
  width,
}: TrendChartProps) {
  const paddingLeft = 28;
  const paddingRight = 8;
  const paddingTop = 10;
  const paddingBottom = 24;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const pointCount = labels.length;

  function xForIndex(i: number): number {
    if (pointCount <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (i / (pointCount - 1)) * chartWidth;
  }

  function yForValue(value: number): number {
    const clamped = Math.min(maxVal, Math.max(minVal, value));
    const ratio = (clamped - minVal) / (maxVal - minVal);
    return paddingTop + chartHeight - ratio * chartHeight;
  }

  function buildPoints(data: number[]): string {
    return data
      .map((v, i) => `${xForIndex(i).toFixed(1)},${yForValue(v).toFixed(1)}`)
      .join(' ');
  }

  const ySteps = [minVal, (minVal + maxVal) / 2, maxVal];

  return (
    <Svg width={width} height={height}>
      {ySteps.map((val) => {
        const y = yForValue(val);
        return (
          <React.Fragment key={`y-${val}`}>
            <Line
              x1={paddingLeft}
              y1={y}
              x2={paddingLeft + chartWidth}
              y2={y}
              stroke="#E7E5E4"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <SvgText
              x={paddingLeft - 4}
              y={y + 4}
              fontSize={9}
              fill="#A8A29E"
              textAnchor="end"
            >
              {val % 1 === 0 ? val.toString() : val.toFixed(0)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {labels.map((label, i) => {
        if (i % 2 !== 0) return null;
        return (
          <SvgText
            key={`x-${i}`}
            x={xForIndex(i)}
            y={height - 4}
            fontSize={9}
            fill="#A8A29E"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}

      {series.map((s) => {
        if (s.data.length < 2) return null;
        return (
          <Polyline
            key={s.label}
            points={buildPoints(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {series.map((s) => {
        if (s.data.length === 0) return null;
        const lastIdx = s.data.length - 1;
        return (
          <Circle
            key={`dot-${s.label}`}
            cx={xForIndex(lastIdx)}
            cy={yForValue(s.data[lastIdx])}
            r={4}
            fill={s.color}
          />
        );
      })}
    </Svg>
  );
}

// ─── AIInsightCard component ──────────────────────────────────────────────────

interface AIInsightCardProps {
  logs: DailyLog[];
  flares: Flare[];
  profile: UserProfile | null;
  healthHistory?: HealthData[];
  isDark: boolean;
}

function AIInsightCard({ logs, flares, profile, healthHistory, isDark }: AIInsightCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  // Warm tinted background for the AI card
  const cardBg = isDark ? '#2D1A0E' : '#FFF7ED';
  const cardBorder = Colors.primary + '40';
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const dividerColor = isDark ? Colors.borderDark : Colors.border;

  const [insight, setInsight] = useState<WeeklyInsight | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (force = false) => {
    if (!user || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setExpandedIdx(null);
    try {
      const result = await generateWeeklyInsight({
        logs,
        flares,
        healthHistory,
        profile: profile ?? {
          user_id: user.id,
          age_range: null,
          diagnosis_years: null,
          severity: null,
          medications: [],
          pain_locations: [],
          pain_types: [],
          conditions: [],
          morning_stiffness: null,
          challenges: [],
          notification_time: '20:00',
          ai_context: '',
          onboarding_complete: true,
        },
      });
      setInsight(result);
      const now = new Date().toISOString();
      setGeneratedAt(now);
      await saveInsightCache(user.id, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('insights.ai_insight_error'));
    } finally {
      setIsGenerating(false);
    }
  }, [user, logs, flares, healthHistory, profile, isGenerating, t]);

  // Load from cache on mount; only generate if cache is missing or > 7 days old
  useEffect(() => {
    if (!user || logs.length === 0) return;
    loadInsightCache(user.id).then((cache) => {
      if (cache) {
        const age = Date.now() - new Date(cache.generatedAt).getTime();
        setInsight(cache.insight);
        setGeneratedAt(cache.generatedAt);
        if (age > CACHE_TTL_MS) {
          generate();
        }
      } else {
        generate();
      }
    });
  // Only run when we first have logs; don't re-run on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, logs.length > 0]);

  return (
    <View style={[styles.aiCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header */}
      <View style={styles.aiCardHeader}>
        <View style={styles.aiTitleRow}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            {t('insights.ai_insight_card_title')}
          </Text>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>Premium</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => generate(true)}
          disabled={isGenerating}
          activeOpacity={0.8}
          style={[styles.refreshBtn, { borderColor: Colors.primary, opacity: isGenerating ? 0.5 : 1 }]}
        >
          <Text style={styles.refreshBtnText}>{t('insights.ai_insight_refresh')}</Text>
        </TouchableOpacity>
      </View>
      {generatedAt && !isGenerating && (
        <Text style={[styles.insightTimestamp, { color: textSecondary }]}>
          Updated {cacheAgeLabel(generatedAt)}
        </Text>
      )}

      {isGenerating ? (
        <View style={styles.generatingRow}>
          <ActivityIndicator color={Colors.primary} size="small" />
          <Text style={[styles.generatingText, { color: textSecondary }]}>
            {t('insights.ai_insight_generating')}
          </Text>
        </View>
      ) : error ? (
        <View>
          <Text style={[styles.errorText, { color: Colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={() => generate(true)} activeOpacity={0.8} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : insight ? (
        <>
          {/* Summary */}
          <Text style={[styles.insightSummary, { color: textPrimary }]}>{insight.summary}</Text>

          {/* Expandable points */}
          {insight.points.map((point, idx) => {
            const isOpen = expandedIdx === idx;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => setExpandedIdx(isOpen ? null : idx)}
                activeOpacity={0.8}
                style={[styles.insightPointRow, { borderTopColor: dividerColor }]}
              >
                <Text style={[styles.insightPointTitle, { color: isOpen ? Colors.primary : textPrimary }]}>
                  {point.title}
                </Text>
                <Text style={[styles.insightPointChevron, { color: textSecondary }]}>
                  {isOpen ? '∧' : '∨'}
                </Text>
                {isOpen && (
                  <Text style={[styles.insightPointDetail, { color: textSecondary }]}>
                    {point.detail}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </>
      ) : profile?.welcome_message ? (
        <View>
          <Text style={[styles.welcomeMessageText, { color: textPrimary }]}>
            {profile.welcome_message}
          </Text>
          <Text style={[styles.teaserText, { color: textSecondary, marginTop: Spacing.sm }]}>
            Your personalised weekly insight will appear here once you have a few days of data.
          </Text>
        </View>
      ) : (
        <Text style={[styles.teaserText, { color: textSecondary }]}>
          {logs.length === 0
            ? 'Log a few days and your insight will appear here.'
            : 'Generating your insight...'}
        </Text>
      )}

    </View>
  );
}

// ─── TrialPromptCard ──────────────────────────────────────────────────────────

interface TrialPromptCardProps {
  isDark: boolean;
  onStartTrial: () => void;
}

function TrialPromptCard({ isDark, onStartTrial }: TrialPromptCardProps) {
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onStartTrial}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: cardBg, borderColor: Colors.primary + '50', borderWidth: 1.5 }]}
    >
      <View style={styles.aiTitleRow}>
        <Text style={[styles.cardTitle, { color: textPrimary }]}>
          You've been tracking for 2 weeks 🎉
        </Text>
      </View>
      <Text style={[styles.teaserText, { color: textSecondary }]}>
        Your data is ready for its first AI analysis. See what patterns are driving your symptoms.
      </Text>
      <Text style={[styles.teaserLink, { color: Colors.primary }]}>See what's included →</Text>
    </TouchableOpacity>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function moodToScore(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 5;
    case 'good': return 4;
    case 'okay': return 3;
    case 'low': return 2;
    case 'very_low': return 1;
    default: return 0;
  }
}

function dayLabel(dateStr: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = new Date(dateStr + 'T12:00:00');
  return days[d.getDay()];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function flareDays(flare: Flare): number {
  const start = new Date(flare.start_date);
  const end = flare.end_date ? new Date(flare.end_date) : new Date();
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

// ─── ChatDataCard — compact list-item style ───────────────────────────────────

function ChatDataCard({ isDark, onPress }: { isDark: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const cardBg = isDark ? '#2D1A0E' : '#FFF7ED';
  const cardBorder = Colors.primary + '40';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chatCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
    >
      <View style={styles.chatCardHeader}>
        <View style={styles.aiTitleRow}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Chat with your data</Text>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>Premium</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <InfoButton
            title={t('insights_info.how_it_works_title')}
            message={t('insights_info.how_it_works_message')}
            color={textSecondary}
          />
          <Text style={[styles.chatRowArrow, { color: Colors.primary }]}>→</Text>
        </View>
      </View>
      <Text style={[styles.chatCardSubtitle, { color: textSecondary }]}>
        Ask about your patterns, trends, or symptoms
      </Text>
    </TouchableOpacity>
  );
}

// ─── BASDAI helpers ────────────────────────────────────────────────────────────

function basdaiInterpretation(score: number): { label: string; color: string } {
  if (score < 2) return { label: 'Low activity', color: Colors.success };
  if (score < 4) return { label: 'Moderate', color: Colors.warning };
  if (score < 6) return { label: 'High (biologic threshold)', color: Colors.error };
  return { label: 'Very high', color: Colors.error };
}

// ─── BasdaiModal ──────────────────────────────────────────────────────────────

const BASDAI_QUESTIONS = [
  { key: 'q1', text: 'How would you describe the overall level of fatigue/tiredness?' },
  { key: 'q2', text: 'How would you describe the overall level of AS neck, back or hip pain?' },
  { key: 'q3', text: 'How would you describe the overall level of pain/swelling in joints other than neck, back or hips?' },
  { key: 'q4', text: 'How would you describe the overall level of discomfort from tender areas (enthesitis)?' },
  { key: 'q5', text: 'How would you describe the overall level of morning stiffness severity from the time you wake up?' },
  { key: 'q6', text: 'How long does your morning stiffness last? (0=none, 10=2+ hours)' },
] as const;

interface BasdaiModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (answers: { q1: number; q2: number; q3: number; q4: number; q5: number; q6: number }) => Promise<void>;
  isDark: boolean;
}

function BasdaiModal({ visible, onClose, onSave, isDark }: BasdaiModalProps) {
  const [q1, setQ1] = useState(5);
  const [q2, setQ2] = useState(5);
  const [q3, setQ3] = useState(5);
  const [q4, setQ4] = useState(5);
  const [q5, setQ5] = useState(5);
  const [q6, setQ6] = useState(5);
  const [isSaving, setIsSaving] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const border = isDark ? Colors.borderDark : Colors.border;

  const values = { q1, q2, q3, q4, q5, q6 };
  const computedScore = parseFloat(((q1 + q2 + q3 + q4 + (q5 + q6) / 2) / 5).toFixed(2));
  const interp = basdaiInterpretation(computedScore);

  const setters: Record<string, (v: number) => void> = { q1: setQ1, q2: setQ2, q3: setQ3, q4: setQ4, q5: setQ5, q6: setQ6 };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(values);
      onClose();
      setShowResult(false);
    } catch {}
    finally { setIsSaving(false); }
  };

  function QuestionSlider({ value, setValue }: { value: number; setValue: (v: number) => void }) {
    return (
      <DragSlider
        value={value}
        onChange={setValue}
        isDark={isDark}
        minLabel="0 = None"
        maxLabel="10 = Severe"
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? Colors.backgroundDark : Colors.background }}>
        <View style={[styles.basdaiHeader, { borderBottomColor: border }]}>
          <TouchableOpacity onPress={onClose} style={{ width: 64 }}>
            <Text style={[styles.basdaiCancelText, { color: textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.basdaiTitle, { color: textPrimary }]}>BASDAI Assessment</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }} showsVerticalScrollIndicator={false}>
          {BASDAI_QUESTIONS.map((q, idx) => (
            <View key={q.key} style={[styles.basdaiQuestion, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={[styles.basdaiQuestionNum, { color: textSecondary }]}>Q{idx + 1}</Text>
              <Text style={[styles.basdaiQuestionText, { color: textPrimary }]}>{q.text}</Text>
              <QuestionSlider value={values[q.key as keyof typeof values]} setValue={setters[q.key]} />
            </View>
          ))}

          {/* Score preview */}
          <View style={[styles.basdaiScoreCard, { backgroundColor: cardBg, borderColor: interp.color + '50' }]}>
            <Text style={[styles.basdaiScoreLabel, { color: textSecondary }]}>Your BASDAI score</Text>
            <Text style={[styles.basdaiScoreLarge, { color: interp.color }]}>{computedScore.toFixed(1)}<Text style={{ fontSize: FontSize.sm }}>/10</Text></Text>
            <Text style={[styles.basdaiInterpText, { color: interp.color }]}>{interp.label}</Text>
            {computedScore >= 4 && (
              <Text style={[styles.basdaiThresholdNote, { color: textSecondary }]}>
                Score ≥4 is the clinical threshold for biologic therapy. Consider sharing this with your rheumatologist.
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
            style={[styles.basdaiSaveBtn, { opacity: isSaving ? 0.6 : 1 }]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.basdaiSaveBtnText}>Save assessment</Text>
            )}
          </TouchableOpacity>
          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── BasdaiPromptCard ─────────────────────────────────────────────────────────

const BASDAI_INFO = 'BASDAI (Bath Ankylosing Spondylitis Disease Activity Index) is the standard clinical tool for measuring AS disease activity. You score six questions on a 0-10 scale: fatigue, spinal pain, joint pain, enthesitis, morning stiffness severity, and duration. A score of 4 or above is the threshold at which biologic therapy is typically considered.';

function BasdaiPromptCard({
  latestScore,
  daysSince,
  onPress,
  isDark,
}: {
  latestScore: BasdaiScore | null;
  daysSince: number | null;
  onPress: () => void;
  isDark: boolean;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  if (!latestScore) {
    return (
      <View style={[styles.basdaiPromptCard, { backgroundColor: isDark ? '#2D1A0E' : '#FFF7ED', borderColor: Colors.primary + '40' }]}>
        <View style={styles.basdaiPromptTitleRow}>
          <Text style={[styles.basdaiPromptTitle, { color: textPrimary, flex: 1 }]}>Monthly clinical assessment</Text>
          <TouchableOpacity onPress={() => setShowInfo(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
            <Text style={[styles.basdaiInfoIcon, { color: showInfo ? Colors.primary : textSecondary }]}>ⓘ</Text>
          </TouchableOpacity>
        </View>
        {showInfo && (
          <Text style={[styles.basdaiInfoText, { color: textSecondary }]}>{BASDAI_INFO}</Text>
        )}
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.basdaiTakeBtn}>
          <Text style={styles.basdaiTakeBtnText}>Take assessment</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const interp = basdaiInterpretation(latestScore.score);
  const isDue = daysSince !== null && daysSince >= 30;

  if (!isDue) {
    return (
      <View style={[styles.basdaiCompactRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
            <Text style={[styles.basdaiCompactLabel, { color: textSecondary }]}>BASDAI</Text>
            <TouchableOpacity onPress={() => setShowInfo(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
              <Text style={[styles.basdaiInfoIcon, { color: showInfo ? Colors.primary : textSecondary, fontSize: FontSize.xs }]}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
            <Text style={[styles.basdaiCompactScore, { color: interp.color }]}>{latestScore.score.toFixed(1)}</Text>
            <Text style={[styles.basdaiCompactInterp, { color: interp.color }]}>{interp.label}</Text>
          </View>
          {showInfo && (
            <Text style={[styles.basdaiInfoText, { color: textSecondary, marginTop: Spacing.xs }]}>{BASDAI_INFO}</Text>
          )}
          <Text style={[styles.basdaiCompactDate, { color: textSecondary }]}>{daysSince} days ago</Text>
        </View>
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.basdaiRetakeBtn}>
          <Text style={[styles.basdaiRetakeBtnText, { color: Colors.primary }]}>Retake</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.basdaiPromptCard, { backgroundColor: isDark ? '#2D1A0E' : '#FFF7ED', borderColor: Colors.warning + '50' }]}>
      <View style={styles.basdaiPromptTitleRow}>
        <Text style={[styles.basdaiPromptTitle, { color: textPrimary, flex: 1 }]}>Monthly reassessment due</Text>
        <TouchableOpacity onPress={() => setShowInfo(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <Text style={[styles.basdaiInfoIcon, { color: showInfo ? Colors.primary : textSecondary }]}>ⓘ</Text>
        </TouchableOpacity>
      </View>
      {showInfo && (
        <Text style={[styles.basdaiInfoText, { color: textSecondary }]}>{BASDAI_INFO}</Text>
      )}
      <Text style={[styles.basdaiPromptBody, { color: textSecondary }]}>
        Your last BASDAI was {latestScore.score.toFixed(1)} ({interp.label}), {daysSince} days ago. Time to reassess.
      </Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.basdaiTakeBtn}>
        <Text style={styles.basdaiTakeBtnText}>Take assessment</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Period = 7 | 30 | 90 | 180;

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isSubscribed, isLoading: subLoading, monthlyPrice, trialDays, purchase, restore } = useSubscription();
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const { history: healthHistory } = useHealthHistory(28);

  const { latestScore: latestBasdaiScore, daysSinceLastScore: daysSinceLastBasdai, saveScore: saveBasdaiScore } = useBasdai();
  const [showBasdai, setShowBasdai] = useState(false);

  const [period, setPeriod] = useState<Period>(30);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [allLogs, setAllLogs] = useState<DailyLog[]>([]); // 28-day for AI
  const [flares, setFlares] = useState<Flare[]>([]);
  const [streak, setStreak] = useState(0);
  const [totalLogCount, setTotalLogCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [chartWidth, setChartWidth] = useState(300);
  const load = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [periodLogs, logs30, allLogs180, allFlares, currentStreak] = await Promise.all([
        getDailyLogs(user.id, period),
        getDailyLogs(user.id, 30),
        getDailyLogs(user.id, 180),
        getFlares(user.id),
        getStreak(user.id),
      ]);
      setLogs(periodLogs);
      setAllLogs(logs30);
      setTotalLogCount(allLogs180.length);

      const since = new Date();
      since.setDate(since.getDate() - period);
      const sinceStr = since.toISOString().split('T')[0];
      setFlares(allFlares.filter((f) => f.start_date >= sinceStr));
      setStreak(currentStreak);
    } catch (err) {
      console.error('InsightsScreen load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, period]);

  useEffect(() => {
    load();
  }, [load]);

  // If selected period has no data, fall back to 7d
  useEffect(() => {
    const minLogs: Record<Period, number> = { 7: 1, 30: 10, 90: 30, 180: 60 };
    if (totalLogCount < minLogs[period] && period !== 7) {
      setPeriod(7);
    }
  }, [totalLogCount, period]);

  function onCardLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setChartWidth(w);
  }

  // Determine if user has tracked >= 14 days (for trial prompt)
  const hasEnoughDataForTrialPrompt = allLogs.length >= 14;

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
  }, [restore]);

  const painData = logs.map((l) => l.pain_score);
  const fatigueData = logs.map((l) => l.fatigue_score);
  const moodData = logs.map((l) => moodToScore(l.mood)).filter((v) => v > 0);
  const moodLabels = logs
    .filter((l) => l.mood !== null)
    .map((l) => dayLabel(l.date));
  const chartLabels = logs.map((l) => dayLabel(l.date));

  const avgPain =
    painData.length > 0
      ? (painData.reduce((a, b) => a + b, 0) / painData.length).toFixed(1)
      : null;

  const avgFatigue =
    fatigueData.length > 0
      ? (fatigueData.reduce((a, b) => a + b, 0) / fatigueData.length).toFixed(1)
      : null;

  let bestDay: string | null = null;
  if (logs.length >= 7) {
    const dayMap: Record<string, number[]> = {};
    logs.forEach((l) => {
      const d = dayLabel(l.date);
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push(l.pain_score);
    });
    let minAvg = Infinity;
    for (const [day, scores] of Object.entries(dayMap)) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < minAvg) {
        minAvg = avg;
        bestDay = day;
      }
    }
  }

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: textPrimary }]}>
            {t('insights.title')}
          </Text>
          <ProfileButton />
        </View>

        {/* ── BASDAI section ── */}
        <BasdaiPromptCard
          latestScore={latestBasdaiScore}
          daysSince={daysSinceLastBasdai}
          onPress={() => setShowBasdai(true)}
          isDark={isDark}
        />

        {/* ── AI Insight section — above period selector ── */}
        {!subLoading && (
          isSubscribed ? (
            <AIInsightCard logs={allLogs} flares={flares} profile={profile} healthHistory={healthHistory} isDark={isDark} />
          ) : hasEnoughDataForTrialPrompt ? (
            <TrialPromptCard
              isDark={isDark}
              onStartTrial={() => setShowPremiumModal(true)}
            />
          ) : null
        )}

        {/* Chat with your data — compact row directly under weekly insight */}
        {!subLoading && isSubscribed && (
          <ChatDataCard isDark={isDark} onPress={() => router.push('/ai-chat')} />
        )}

        {/* Section divider before period selector */}
        <View style={[styles.dataSectionDivider, { backgroundColor: isDark ? Colors.borderDark : Colors.border }]} />

        {/* Period selector — only show when more than just 7d is available */}
        {totalLogCount >= 10 && (
          <View style={styles.periodRow}>
            {([7, 30, 90, 180] as Period[]).map((p) => {
              const minLogs: Record<Period, number> = { 7: 1, 30: 10, 90: 30, 180: 60 };
              if (totalLogCount < minLogs[p] && p !== 7) return null;
              const label = p === 7 ? '7d' : p === 30 ? '1m' : p === 90 ? '3m' : '6m';
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPeriod(p)}
                  activeOpacity={0.8}
                  style={[
                    styles.periodBtn,
                    {
                      backgroundColor: period === p ? Colors.primary : cardBg,
                      borderColor: period === p ? Colors.primary : cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.periodBtnText,
                      { color: period === p ? '#FFFFFF' : textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {isLoading ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('common.loading')}
            </Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              {t('insights.no_data')}
            </Text>
          </View>
        ) : (
          <>
            {/* Pain & Fatigue chart */}
            <View
              style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
              onLayout={onCardLayout}
            >
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                {t('insights.pain_fatigue')}
              </Text>
              {allLogs.length < 7 && (
                <Text style={[styles.chartHint, { color: textSecondary }]}>
                  This chart fills out as you log more days.
                </Text>
              )}
              <TrendChart
                series={[
                  { data: painData, color: Colors.error, label: t('insights.legend_pain') },
                  { data: fatigueData, color: Colors.warning, label: t('insights.legend_fatigue') },
                ]}
                labels={chartLabels}
                height={120}
                minVal={0}
                maxVal={10}
                width={Math.max(10, chartWidth - Spacing.md * 2)}
              />
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.error }]} />
                  <Text style={[styles.legendText, { color: textSecondary }]}>
                    {t('insights.legend_pain')}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
                  <Text style={[styles.legendText, { color: textSecondary }]}>
                    {t('insights.legend_fatigue')}
                  </Text>
                </View>
              </View>
            </View>

            {/* Mood chart */}
            {moodData.length > 0 && (
              <View
                style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <Text style={[styles.cardTitle, { color: textPrimary }]}>
                  {t('insights.mood_trend')}
                </Text>
                {allLogs.length < 7 && (
                  <Text style={[styles.chartHint, { color: textSecondary }]}>
                    This chart fills out as you log more days.
                  </Text>
                )}
                <TrendChart
                  series={[
                    { data: moodData, color: Colors.success, label: 'mood' },
                  ]}
                  labels={moodLabels}
                  height={80}
                  minVal={1}
                  maxVal={5}
                  width={Math.max(10, chartWidth - Spacing.md * 2)}
                />
              </View>
            )}

            {/* Patterns card */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                {t('insights.patterns')}
              </Text>
              {allLogs.length < 7 && (
                <Text style={[styles.chartHint, { color: textSecondary }]}>
                  Patterns become clearer as you log more days.
                </Text>
              )}
              <View style={styles.statsGrid}>
                <StatRow
                  label={t('insights.avg_pain')}
                  value={avgPain !== null ? `${avgPain}/10` : '—'}
                  isDark={isDark}
                />
                <StatRow
                  label={t('insights.avg_fatigue')}
                  value={avgFatigue !== null ? `${avgFatigue}/10` : '—'}
                  isDark={isDark}
                />
                {bestDay && (
                  <StatRow
                    label={t('insights.best_day')}
                    value={bestDay}
                    isDark={isDark}
                  />
                )}
                <StatRow
                  label={t('insights.log_streak')}
                  value={`${streak}${t('insights.days_suffix')}`}
                  isDark={isDark}
                />
              </View>
            </View>
          </>
        )}

        {/* Chat CTA for non-subscribers — shown below when not subscribed */}
        {!subLoading && !isSubscribed && (
          <TouchableOpacity
            onPress={() => setShowPremiumModal(true)}
            activeOpacity={0.85}
            style={[styles.card, { backgroundColor: cardBg, borderColor: Colors.primary + '50', borderWidth: 1.5 }]}
          >
            <View style={styles.aiTitleRow}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                {t('insights.ai_insight_title')}
              </Text>
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>Premium</Text>
              </View>
            </View>
            <Text style={[styles.teaserText, { color: textSecondary }]}>
              {t('premium_teaser.insights_body')}
            </Text>
            <Text style={[styles.teaserLink, { color: Colors.primary }]}>{t('premium_teaser.see_whats_included')}</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.disclaimer, { color: isDark ? Colors.textSecondaryDark : Colors.textSecondary }]}>
          For informational purposes only. Not medical advice. Always consult your rheumatologist or healthcare team about your symptoms and treatment.
        </Text>

      </ScrollView>

      <BasdaiModal
        visible={showBasdai}
        onClose={() => setShowBasdai(false)}
        onSave={saveBasdaiScore}
        isDark={isDark}
      />

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

// ─── StatRow ──────────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: isDark ? Colors.textSecondaryDark : Colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: isDark ? Colors.textPrimaryDark : Colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    flex: 1,
    marginRight: Spacing.sm,
  },

  // Period selector — smaller pills
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  periodBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  periodBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },

  // Section divider
  dataSectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },

  // AI card — warm tinted
  aiCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
  },

  // Generic card
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.md,
    lineHeight: 20,
  },
  chartHint: {
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
    lineHeight: 17,
    opacity: 0.75,
  },
  disclaimer: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    opacity: 0.7,
  },
  legend: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSize.xs,
  },
  moodYLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  moodYLabel: {
    fontSize: FontSize.xs,
  },
  flareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flareInfo: {
    flex: 1,
  },
  flareDate: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  flareDays: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  severityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.sm,
  },
  severityText: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statsGrid: {
    gap: Spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSize.sm,
  },
  statValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Chat card — full card matching aiCard style
  chatCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  chatCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatCardSubtitle: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  chatPrivacyNote: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    opacity: 0.7,
    lineHeight: 16,
  },
  chatRowArrow: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },

  // AI card styles
  aiCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  premiumBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  premiumBadgeText: {
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  refreshBtn: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  refreshBtnText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  generatingText: {
    fontSize: FontSize.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  retryBtnText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    fontWeight: '600',
  },
  insightText: {
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  insightTimestamp: {
    fontSize: FontSize.xs,
    marginBottom: Spacing.xs,
  },
  insightSummary: {
    fontSize: FontSize.sm,
    lineHeight: 22,
    marginBottom: Spacing.xs,
  },
  insightPointRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  insightPointTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
  insightPointChevron: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  insightPointDetail: {
    width: '100%',
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  showMoreBtn: {
    paddingTop: Spacing.sm,
    alignItems: 'center',
  },
  showMoreText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  welcomeMessageText: {
    fontSize: FontSize.md,
    lineHeight: 24,
    fontWeight: '400',
    marginBottom: Spacing.xs,
  },
  teaserText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  teaserLink: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  ctaBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  infoIconBtn: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  chatInfoText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  chatNavBtn: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  chatNavText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  // BASDAI modal
  basdaiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  basdaiTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  basdaiCancelText: {
    fontSize: FontSize.md,
  },
  basdaiQuestion: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  basdaiQuestionNum: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  basdaiQuestionText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontWeight: '500',
  },
  basdaiStepBtn: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  basdaiStepBtnText: {
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 30,
  },
  basdaiScore: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 42,
  },
  basdaiHint: {
    fontSize: FontSize.xs,
  },
  basdaiScoreCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  basdaiScoreLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  basdaiScoreLarge: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 56,
  },
  basdaiInterpText: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  basdaiThresholdNote: {
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  basdaiSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  basdaiSaveBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // BASDAI prompt card
  basdaiPromptCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  basdaiPromptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  basdaiPromptTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  basdaiInfoIcon: {
    fontSize: FontSize.md,
  },
  basdaiInfoText: {
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  basdaiPromptBody: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  basdaiTakeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  basdaiTakeBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  basdaiCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  basdaiCompactLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  basdaiCompactScore: {
    fontSize: FontSize.xl,
    fontWeight: '900',
  },
  basdaiCompactInterp: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  basdaiCompactDate: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  basdaiRetakeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  basdaiRetakeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
