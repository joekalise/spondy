import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Alert,
  useColorScheme,
  ActivityIndicator,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { Button } from '@/components/common/Button';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useMedications } from '@/hooks/useMedications';
import { useSubscription } from '@/hooks/useSubscription';
import { useFlares } from '@/hooks/useFlares';
import { useHealthData } from '@/hooks/useHealthData';
import { scheduleDailyCheckIn } from '@/services/notifications';
import { generateAndShareReport } from '@/services/pdfExport';
import { getDailyLogs } from '@/services/database';
import { MedicationReminder } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAgeRange(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace('_', '–').replace('plus', '+').replace('under', 'Under ');
}

function formatDiagnosisYears(value: string | null | undefined): string {
  if (!value) return '—';
  if (value === 'under_1') return 'Under 1 year';
  if (value === '10_plus') return '10+ years';
  return value.replace('_', '–') + ' years';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── AddMedicationModal ───────────────────────────────────────────────────────

interface AddMedicationModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (med: Omit<MedicationReminder, 'id' | 'user_id'>) => Promise<void>;
  isDark: boolean;
}

const FREQUENCIES: MedicationReminder['frequency'][] = [
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
];

function AddMedicationModal({
  visible,
  onClose,
  onSave,
  isDark,
}: AddMedicationModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState<MedicationReminder['frequency']>('daily');
  const [reminderTime, setReminderTime] = useState('08:00');
  const [isSaving, setIsSaving] = useState(false);

  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.backgroundDark : Colors.background;

  function reset() {
    setName('');
    setDose('');
    setFrequency('daily');
    setReminderTime('08:00');
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('', 'Please enter a medication name.');
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        dose: dose.trim(),
        frequency,
        reminder_time: reminderTime,
        active: true,
      });
      reset();
      onClose();
    } catch (err) {
      console.error('Add medication error:', err);
      Alert.alert('Error', t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  const freqLabels: Record<MedicationReminder['frequency'], string> = {
    daily: t('medications.daily'),
    weekly: t('medications.weekly'),
    fortnightly: t('medications.fortnightly'),
    monthly: t('medications.monthly'),
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <Text style={[styles.modalTitle, { color: textPrimary }]}>
            {t('medications.add_title')}
          </Text>

          {/* Medication name */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.name')}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
            ]}
            placeholder={t('medications.name_placeholder')}
            placeholderTextColor={textSecondary}
            value={name}
            onChangeText={setName}
          />

          {/* Dose */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.dose')}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
            ]}
            placeholder={t('medications.dose_placeholder')}
            placeholderTextColor={textSecondary}
            value={dose}
            onChangeText={setDose}
          />

          {/* Frequency chips */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.frequency')}
          </Text>
          <View style={styles.chipsRow}>
            {FREQUENCIES.map((freq) => (
              <TouchableOpacity
                key={freq}
                onPress={() => setFrequency(freq)}
                activeOpacity={0.8}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      frequency === freq ? Colors.primary : inputBg,
                    borderColor:
                      frequency === freq ? Colors.primary : cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: frequency === freq ? '#FFFFFF' : textSecondary },
                  ]}
                >
                  {freqLabels[freq]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reminder time */}
          <Text style={[styles.fieldLabel, { color: textSecondary }]}>
            {t('medications.reminder_time')}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              { backgroundColor: inputBg, borderColor: cardBorder, color: textPrimary },
            ]}
            placeholder={t('medications.reminder_placeholder')}
            placeholderTextColor={textSecondary}
            value={reminderTime}
            onChangeText={setReminderTime}
            keyboardType="numbers-and-punctuation"
          />

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={handleClose}
              style={[
                styles.modalCancelBtn,
                { borderColor: cardBorder },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalCancelText, { color: textSecondary }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              style={[styles.modalSaveBtn, { opacity: isSaving ? 0.6 : 1 }]}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>
                  {t('medications.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const { profile, saveProfile } = useProfile();
  const {
    medications,
    isLoading: medsLoading,
    addMedication,
    deleteMedication,
  } = useMedications();
  const { flares } = useFlares();
  const { isSubscribed, isLoading: subLoading, purchase, restore } = useSubscription();
  const {
    isAvailable: healthAvailable,
    isConnected: healthConnected,
    isLoading: healthLoading,
    todayData: healthData,
    connect: connectHealth,
    sync: syncHealth,
    disconnect: disconnectHealthData,
  } = useHealthData();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [welcomeInsights, setWelcomeInsights] = useState<string[]>([]);
  const [watchSummary, setWatchSummary] = useState('');

  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`@spondy_welcome_${user.id}`)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setWelcomeInsights(parsed.insights ?? []);
        setWatchSummary(parsed.watch_summary ?? '');
      })
      .catch(() => {});
  }, [user]);
  const [aiContext, setAiContext] = useState(profile?.ai_context ?? '');
  const [isSavingAiContext, setIsSavingAiContext] = useState(false);
  const [showAddMed, setShowAddMed] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Sync aiContext when profile loads
  React.useEffect(() => {
    if (profile?.ai_context) setAiContext(profile.ai_context);
  }, [profile?.ai_context]);

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.backgroundDark : Colors.background;

  const handleSignOut = useCallback(() => {
    Alert.alert(t('auth.sign_out'), 'Are you sure you want to sign out?', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.sign_out'),
        style: 'destructive',
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
          } catch (err) {
            console.error('Sign out failed:', err);
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  }, [signOut, t]);

  const handleToggleReminder = useCallback(
    async (value: boolean) => {
      setReminderEnabled(value);
      if (value && profile?.notification_time) {
        try {
          await scheduleDailyCheckIn(profile.notification_time);
        } catch (err) {
          console.error('scheduleDailyCheckIn error:', err);
        }
      }
    },
    [profile?.notification_time]
  );

  const handleUpdateTime = useCallback(() => {
    Alert.prompt(
      t('profile.update_time'),
      'Enter time in HH:MM format (e.g. 20:00)',
      async (value) => {
        if (!value) return;
        try {
          await saveProfile({ notification_time: value });
          if (reminderEnabled) {
            await scheduleDailyCheckIn(value);
          }
        } catch (err) {
          console.error('Update notification time error:', err);
          Alert.alert('Error', t('errors.save_failed'));
        }
      },
      'plain-text',
      profile?.notification_time ?? '20:00'
    );
  }, [profile?.notification_time, reminderEnabled, saveProfile, t]);

  const handleSaveAiContext = useCallback(async () => {
    setIsSavingAiContext(true);
    try {
      await saveProfile({ ai_context: aiContext });
    } catch (err) {
      console.error('Save AI context error:', err);
      Alert.alert('Error', t('errors.save_failed'));
    } finally {
      setIsSavingAiContext(false);
    }
  }, [aiContext, saveProfile, t]);

  const handleDeleteMed = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        name,
        'Remove this medication reminder?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMedication(id);
              } catch (err) {
                console.error('Delete medication error:', err);
              }
            },
          },
        ]
      );
    },
    [deleteMedication, t]
  );

  const freqLabel = (freq: MedicationReminder['frequency']): string => {
    switch (freq) {
      case 'daily': return t('medications.daily');
      case 'weekly': return t('medications.weekly');
      case 'fortnightly': return t('medications.fortnightly');
      case 'monthly': return t('medications.monthly');
    }
  };

  const handleGenerateReport = useCallback(async () => {
    if (!user || !profile) return;
    setIsGeneratingReport(true);
    try {
      const logs = await getDailyLogs(user.id, 90);
      await generateAndShareReport({
        logs,
        flares,
        medications,
        profile,
      });
    } catch (err) {
      console.error('Generate report error:', err);
      Alert.alert('', t('errors.save_failed'));
    } finally {
      setIsGeneratingReport(false);
    }
  }, [user, profile, flares, medications, t]);

  const handlePurchase = useCallback(async () => {
    setIsPurchasing(true);
    try {
      await purchase();
    } catch (err) {
      console.error('Purchase error:', err);
    } finally {
      setIsPurchasing(false);
    }
  }, [purchase]);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      const success = await restore();
      if (!success) {
        Alert.alert('', 'No previous purchases found.');
      }
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setIsRestoring(false);
    }
  }, [restore]);

  const handleManageSubscription = useCallback(() => {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  }, []);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={[styles.title, { color: textPrimary }]}>
          {t('profile.title')}
        </Text>

        {/* User avatar + email */}
        <View style={[styles.avatarCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.charAt(0).toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={[styles.emailText, { color: textSecondary }]}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* ── Profile summary ─────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('profile.summary')}
            </Text>
            <TouchableOpacity
              onPress={() => Alert.alert('', t('profile.edit_coming_soon'))}
              activeOpacity={0.8}
            >
              <Text style={styles.editLink}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          <SummaryRow
            label={t('profile.age_range')}
            value={formatAgeRange(profile?.age_range)}
            isDark={isDark}
          />
          <SummaryRow
            label={t('profile.years_diagnosed')}
            value={formatDiagnosisYears(profile?.diagnosis_years)}
            isDark={isDark}
          />
          <SummaryRow
            label={t('profile.disease_activity')}
            value={profile?.severity ? capitalize(profile.severity) : '—'}
            isDark={isDark}
          />
        </View>

        {/* ── Your Spondy Profile (AI welcome content) ─────────────────────── */}
        {(profile?.welcome_message || welcomeInsights.length > 0) && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              Your Spondy profile
            </Text>

            {profile?.welcome_message ? (
              <View style={[styles.welcomeMsgBox, { backgroundColor: Colors.primary + '12', borderColor: Colors.primary + '30' }]}>
                <Text style={[styles.welcomeMsgText, { color: textPrimary }]}>
                  {profile.welcome_message}
                </Text>
              </View>
            ) : null}

            {welcomeInsights.length > 0 && (
              <>
                <Text style={[styles.welcomeInsightHeader, { color: textSecondary }]}>
                  Things to watch
                </Text>
                {welcomeInsights.map((insight, idx) => (
                  <View key={idx} style={[styles.welcomeInsightRow, { borderBottomColor: cardBorder }]}>
                    <View style={styles.welcomeInsightDot} />
                    <Text style={[styles.welcomeInsightText, { color: textPrimary }]}>
                      {insight}
                    </Text>
                  </View>
                ))}
              </>
            )}

            {watchSummary ? (
              <View style={[styles.watchSummaryBox, { backgroundColor: isDark ? '#0C4A6E' : Colors.secondaryLight }]}>
                <Text style={[styles.watchSummaryText, { color: isDark ? '#BAE6FD' : '#0C4A6E' }]}>
                  {watchSummary}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Apple Health ─────────────────────────────────────────────────── */}
        {healthAvailable && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                {healthConnected ? t('health.connected') : t('health.connect_title')}
              </Text>
              {healthConnected && (
                <View style={[styles.freqBadge, { backgroundColor: Colors.success + '22' }]}>
                  <Text style={[styles.freqBadgeText, { color: Colors.success }]}>✓</Text>
                </View>
              )}
            </View>

            {!healthConnected ? (
              <>
                <Text style={[styles.subtitleText, { color: textSecondary }]}>
                  {t('health.connect_subtitle')}
                </Text>
                <TouchableOpacity
                  onPress={connectHealth}
                  disabled={healthLoading}
                  activeOpacity={0.8}
                  style={[styles.reportBtn, { opacity: healthLoading ? 0.6 : 1 }]}
                >
                  {healthLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.reportBtnText}>{t('health.connect')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {healthData && (
                  <View style={styles.healthMetricsRow}>
                    {healthData.steps !== null && (
                      <View style={styles.healthMetric}>
                        <Text style={[styles.healthMetricValue, { color: textPrimary }]}>
                          {healthData.steps.toLocaleString()}
                        </Text>
                        <Text style={[styles.healthMetricLabel, { color: textSecondary }]}>
                          {t('health.steps_unit')}
                        </Text>
                      </View>
                    )}
                    {healthData.sleep_duration !== null && (
                      <View style={styles.healthMetric}>
                        <Text style={[styles.healthMetricValue, { color: textPrimary }]}>
                          {healthData.sleep_duration}h
                        </Text>
                        <Text style={[styles.healthMetricLabel, { color: textSecondary }]}>
                          {t('health.sleep')}
                        </Text>
                      </View>
                    )}
                    {healthData.hrv !== null && (
                      <View style={styles.healthMetric}>
                        <Text style={[styles.healthMetricValue, { color: textPrimary }]}>
                          {healthData.hrv}ms
                        </Text>
                        <Text style={[styles.healthMetricLabel, { color: textSecondary }]}>
                          {t('health.hrv')}
                        </Text>
                      </View>
                    )}
                    {healthData.resting_heart_rate !== null && (
                      <View style={styles.healthMetric}>
                        <Text style={[styles.healthMetricValue, { color: textPrimary }]}>
                          {healthData.resting_heart_rate}
                        </Text>
                        <Text style={[styles.healthMetricLabel, { color: textSecondary }]}>
                          {t('health.hr_unit')}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={styles.healthActions}>
                  <TouchableOpacity
                    onPress={syncHealth}
                    disabled={healthLoading}
                    activeOpacity={0.8}
                    style={[styles.healthSyncBtn, { borderColor: Colors.primary, opacity: healthLoading ? 0.6 : 1 }]}
                  >
                    {healthLoading ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : (
                      <Text style={[styles.healthSyncText, { color: Colors.primary }]}>
                        {t('health.sync_now')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={disconnectHealthData}
                    activeOpacity={0.8}
                    style={styles.healthDisconnectBtn}
                  >
                    <Text style={[styles.healthDisconnectText, { color: Colors.error }]}>
                      {t('health.disconnect')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Share with my doctor ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            {t('profile.share_report_title')}
          </Text>
          <Text style={[styles.subtitleText, { color: textSecondary }]}>
            {t('profile.share_report_subtitle')}
          </Text>
          <TouchableOpacity
            onPress={handleGenerateReport}
            disabled={isGeneratingReport}
            activeOpacity={0.8}
            style={[styles.reportBtn, { opacity: isGeneratingReport ? 0.6 : 1 }]}
          >
            {isGeneratingReport ? (
              <View style={styles.reportBtnRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.reportBtnText}>
                  {t('profile.share_report_generating')}
                </Text>
              </View>
            ) : (
              <Text style={styles.reportBtnText}>
                {t('profile.share_report_cta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Notifications ────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            {t('profile.notifications_card')}
          </Text>

          <View style={styles.notifRow}>
            <View style={styles.notifInfo}>
              <Text style={[styles.notifLabel, { color: textPrimary }]}>
                {t('profile.daily_reminder')}
              </Text>
              <Text style={[styles.notifTime, { color: textSecondary }]}>
                {profile?.notification_time ?? '20:00'}
              </Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleToggleReminder}
              trackColor={{ true: Colors.primary, false: cardBorder }}
              thumbColor="#FFFFFF"
            />
          </View>

          {reminderEnabled && (
            <TouchableOpacity
              onPress={handleUpdateTime}
              activeOpacity={0.8}
              style={[styles.updateTimeBtn, { borderColor: cardBorder }]}
            >
              <Text style={[styles.updateTimeText, { color: Colors.primary }]}>
                {t('profile.update_time')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Medications ──────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              {t('profile.medications_card')}
            </Text>
            <TouchableOpacity
              onPress={() => setShowAddMed(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.editLink}>{t('profile.add_medication')}</Text>
            </TouchableOpacity>
          </View>

          {medsLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />
          ) : medications.length === 0 ? (
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              {t('profile.no_medications')}
            </Text>
          ) : (
            medications.map((med) => (
              <View
                key={med.id}
                style={[styles.medRow, { borderBottomColor: cardBorder }]}
              >
                <View style={styles.medInfo}>
                  <Text style={[styles.medName, { color: textPrimary }]}>
                    {med.name}
                  </Text>
                  <View style={styles.medMeta}>
                    {med.dose ? (
                      <Text style={[styles.medDose, { color: textSecondary }]}>
                        {med.dose}
                      </Text>
                    ) : null}
                    <View style={styles.freqBadge}>
                      <Text style={styles.freqBadgeText}>
                        {freqLabel(med.frequency)}
                      </Text>
                    </View>
                    <Text style={[styles.medTime, { color: textSecondary }]}>
                      {med.reminder_time}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteMed(med.id!, med.name)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── AI context ───────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            {t('profile.ai_context_card')}
          </Text>
          <TextInput
            style={[
              styles.aiContextInput,
              {
                backgroundColor: inputBg,
                borderColor: cardBorder,
                color: textPrimary,
              },
            ]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder={t('profile.ai_context_placeholder')}
            placeholderTextColor={textSecondary}
            value={aiContext}
            onChangeText={setAiContext}
          />
          <Text style={[styles.helperText, { color: textSecondary }]}>
            {t('profile.ai_context_helper')}
          </Text>
          <TouchableOpacity
            onPress={handleSaveAiContext}
            disabled={isSavingAiContext}
            activeOpacity={0.8}
            style={[styles.saveContextBtn, { opacity: isSavingAiContext ? 0.6 : 1 }]}
          >
            {isSavingAiContext ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveContextText}>
                {t('profile.save_ai_context')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Subscription card ────────────────────────────────────────────── */}
        {!subLoading && (
          isSubscribed ? (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: Colors.primary }]}>
              <View style={styles.subActiveRow}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>
                  {t('profile.subscription_active')}
                </Text>
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleManageSubscription}
                activeOpacity={0.8}
                style={styles.manageSubBtn}
              >
                <Text style={styles.manageSubText}>{t('profile.subscription_manage')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.subHeader}>
                <Text style={[styles.cardTitle, { color: textPrimary }]}>
                  {t('profile.subscription_card_title')}
                </Text>
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
              </View>
              <Text style={[styles.subPrice, { color: textSecondary }]}>
                {t('profile.subscription_card_price')}
              </Text>

              {/* Feature list */}
              {[1, 2, 3, 4].map((n) => (
                <View key={n} style={styles.featureRow}>
                  <Text style={{ color: Colors.primary, fontSize: FontSize.md }}>✓</Text>
                  <Text style={[styles.featureText, { color: textPrimary }]}>
                    {t(`profile.subscription_feature_${n}` as Parameters<typeof t>[0])}
                  </Text>
                </View>
              ))}

              <TouchableOpacity
                onPress={handlePurchase}
                disabled={isPurchasing}
                activeOpacity={0.8}
                style={[styles.purchaseBtn, { opacity: isPurchasing ? 0.6 : 1 }]}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.purchaseBtnText}>
                    {t('subscription.trial_cta')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRestore}
                disabled={isRestoring}
                activeOpacity={0.8}
                style={styles.restoreBtn}
              >
                {isRestoring ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Text style={[styles.restoreBtnText, { color: Colors.primary }]}>
                    {t('profile.subscription_restore')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )
        )}

        {/* ── Account ──────────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            {t('profile.account')}
          </Text>
          <Button
            label={t('auth.sign_out')}
            onPress={handleSignOut}
            variant="outline"
            isLoading={isSigningOut}
            textStyle={{ color: Colors.error }}
            style={{ borderColor: Colors.error, marginTop: Spacing.sm }}
          />
        </View>

        {/* Version */}
        <Text style={[styles.version, { color: textSecondary }]}>
          {t('profile.version', { version })}
        </Text>
      </ScrollView>

      <AddMedicationModal
        visible={showAddMed}
        onClose={() => setShowAddMed(false)}
        onSave={addMedication}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: isDark ? Colors.textSecondaryDark : Colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.summaryValue, { color: isDark ? Colors.textPrimaryDark : Colors.textPrimary }]}>
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
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginBottom: Spacing.lg,
  },
  avatarCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emailText: {
    fontSize: FontSize.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  editLink: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
  },
  summaryValue: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  notifRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  notifInfo: {
    flex: 1,
  },
  notifLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  notifTime: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  updateTimeBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    alignSelf: 'flex-start',
  },
  updateTimeText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: FontSize.sm,
    paddingVertical: Spacing.sm,
  },
  medRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  medInfo: {
    flex: 1,
  },
  medName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  medMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  medDose: {
    fontSize: FontSize.xs,
  },
  freqBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  freqBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  medTime: {
    fontSize: FontSize.xs,
  },
  deleteIcon: {
    fontSize: FontSize.sm,
    color: Colors.error,
    paddingLeft: Spacing.sm,
  },
  aiContextInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    minHeight: 90,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  helperText: {
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginBottom: Spacing.md,
  },
  saveContextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  saveContextText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  version: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  // Welcome content card
  welcomeMsgBox: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  welcomeMsgText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  welcomeInsightHeader: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
  },
  welcomeInsightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  welcomeInsightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginTop: 7,
    flexShrink: 0,
  },
  welcomeInsightText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
  watchSummaryBox: {
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  watchSummaryText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Health card
  healthMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  healthMetric: {
    alignItems: 'center',
    minWidth: 64,
  },
  healthMetricValue: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  healthMetricLabel: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  healthActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  healthSyncBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  healthSyncText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  healthDisconnectBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  healthDisconnectText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Share report card
  subtitleText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  reportBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  reportBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reportBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  // Subscription card
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  subActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
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
  subPrice: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  featureText: {
    fontSize: FontSize.sm,
    flex: 1,
    lineHeight: 20,
  },
  purchaseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  purchaseBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  restoreBtn: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  restoreBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  manageSubBtn: {
    paddingVertical: Spacing.xs,
  },
  manageSubText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
