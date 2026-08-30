import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import i18n, { tPlural } from '@/i18n';
import { Colors } from '@/constants/colors';
import { FontSize, FontFamily, Spacing, BorderRadius } from '@/constants/theme';
import { useFlares } from '@/hooks/useFlares';
import { useUveitisEpisodes } from '@/hooks/useUveitisEpisodes';
import { useProfile } from '@/contexts/ProfileContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Button } from '@/components/common/Button';
import { ProfileButton } from '@/components/common/ProfileButton';
import { FlareSeverity, Flare, FlareType, UveitisEpisode, UveitisEye, UveitisSymptom } from '@/types';
import { logEvent, Events } from '@/services/analytics';

// ─── Severity badge ──────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<FlareSeverity, string> = {
  mild: Colors.success,
  moderate: Colors.warning,
  severe: Colors.error,
};

function SeverityBadge({ severity, isDark }: { severity: FlareSeverity; isDark: boolean }) {
  const { t } = useTranslation();
  const color = SEVERITY_COLOR[severity];
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>
        {t(`flares.severity_${severity}`)}
      </Text>
    </View>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysBetween(start: string, end: string | null): number {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  return Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
}

// ─── Pain location labels ────────────────────────────────────────────────────

const AS_LOCATIONS: { value: string; labelKey: string }[] = [
  { value: 'lower_back', labelKey: 'flares.as_location.lower_back' },
  { value: 'upper_back', labelKey: 'flares.as_location.upper_back' },
  { value: 'hips', labelKey: 'flares.as_location.hips' },
  { value: 'neck', labelKey: 'flares.as_location.neck' },
  { value: 'chest', labelKey: 'flares.as_location.chest' },
  { value: 'shoulders', labelKey: 'flares.as_location.shoulders' },
  { value: 'knees', labelKey: 'flares.as_location.knees' },
  { value: 'jaw', labelKey: 'flares.as_location.jaw' },
];

const ENTHESITIS_LOCATIONS: { value: string; labelKey: string }[] = [
  { value: 'heel_achilles', labelKey: 'flares.enthesitis_location.heel_achilles' },
  { value: 'plantar_fascia', labelKey: 'flares.enthesitis_location.plantar_fascia' },
  { value: 'chest_sternum', labelKey: 'flares.enthesitis_location.chest_sternum' },
  { value: 'ribs', labelKey: 'flares.enthesitis_location.ribs' },
  { value: 'elbow', labelKey: 'flares.enthesitis_location.elbow' },
  { value: 'si_joint', labelKey: 'flares.enthesitis_location.si_joint' },
  { value: 'knee_tendon', labelKey: 'flares.enthesitis_location.knee_tendon' },
  { value: 'other', labelKey: 'flares.enthesitis_location.other' },
];

const PERIPHERAL_LOCATIONS: { value: string; labelKey: string }[] = [
  { value: 'knee', labelKey: 'flares.peripheral_location.knee' },
  { value: 'hip', labelKey: 'flares.peripheral_location.hip' },
  { value: 'shoulder', labelKey: 'flares.peripheral_location.shoulder' },
  { value: 'ankle', labelKey: 'flares.peripheral_location.ankle' },
  { value: 'wrist', labelKey: 'flares.peripheral_location.wrist' },
  { value: 'elbow', labelKey: 'flares.peripheral_location.elbow' },
  { value: 'fingers_toes', labelKey: 'flares.peripheral_location.fingers_toes' },
  { value: 'other', labelKey: 'flares.peripheral_location.other' },
];

// Saved flares only store the raw location value (e.g. "lower_back"), so
// displaying history needs to translate it back through whichever location
// list matches the flare's type, not just show the raw value.
function locationOptionsForType(flareType?: string): { value: string; labelKey: string }[] {
  if (flareType === 'enthesitis') return ENTHESITIS_LOCATIONS;
  if (flareType === 'peripheral') return PERIPHERAL_LOCATIONS;
  return AS_LOCATIONS;
}

function translatedAreaLabels(t: (key: string) => string, areas: string[], flareType?: string): string {
  const options = locationOptionsForType(flareType);
  return areas
    .map((a) => options.find((o) => o.value === a)?.labelKey)
    .map((key, i) => (key ? t(key) : areas[i].replace(/_/g, ' ')))
    .join(', ');
}

// ─── Edit Flare Modal ─────────────────────────────────────────────────────────

interface EditFlareModalProps {
  visible: boolean;
  flare: Flare | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Flare>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isDark: boolean;
  locationOptions: { value: string; labelKey: string }[];
}

function EditFlareModal({ visible, flare, onClose, onSave, onDelete, isDark, locationOptions }: EditFlareModalProps) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<FlareSeverity>('moderate');
  const [areas, setAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (flare) {
      setSeverity(flare.severity);
      setAreas(flare.areas_affected);
      setNotes(flare.notes ?? '');
      setStartDate(flare.start_date);
      setEndDate(flare.end_date ?? '');
    }
  }, [flare]);

  const toggleArea = (area: string) => {
    setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  const handleSave = async () => {
    if (!flare?.id) return;
    setIsSaving(true);
    try {
      await onSave(flare.id, { severity, areas_affected: areas, notes, start_date: startDate, end_date: endDate || null });
      onClose();
    } catch {
      Alert.alert(t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!flare?.id) return;
    Alert.alert(t('flares.delete_flare_title'), t('flares.delete_flare_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          try { await onDelete(flare.id!); onClose(); }
          catch { Alert.alert(t('errors.save_failed')); }
        },
      },
    ]);
  };

  const SEVERITIES: FlareSeverity[] = ['mild', 'moderate', 'severe'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>{t('flares.edit_flare')}</Text>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>
            {t('flares.flare_severity')}
          </Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map(sev => {
              const selected = severity === sev;
              const color = SEVERITY_COLOR[sev];
              return (
                <TouchableOpacity
                  key={sev}
                  onPress={() => setSeverity(sev)}
                  style={[styles.chip, isDark && styles.chipDark, selected && { backgroundColor: color + '22', borderColor: color }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700', fontFamily: FontFamily.bold }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.location')}</Text>
          <View style={styles.chipRow}>
            {locationOptions.map(loc => {
              const selected = areas.includes(loc.value);
              return (
                <TouchableOpacity
                  key={loc.value}
                  onPress={() => toggleArea(loc.value)}
                  style={[styles.chip, isDark && styles.chipDark, selected && styles.chipSelected]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && styles.chipTextSelected]}>
                    {t(loc.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.dates')}</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>{t('flares.start_label')}</Text>
              <TextInput
                style={[styles.dateInput, isDark && styles.notesInputDark]}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>{t('flares.end_label')}</Text>
              <TextInput
                style={[styles.dateInput, isDark && styles.notesInputDark]}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          {endDate !== '' && (
            <TouchableOpacity
              onPress={() => setEndDate('')}
              style={styles.reopenFlareLink}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.reopenFlareLinkText}>{t('flares.reopen_this_flare')}</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>
            {t('flares.notes')}
          </Text>
          <TextInput
            style={[styles.notesInput, isDark && styles.notesInputDark]}
            placeholder={t('flares.notes_placeholder')}
            placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Button label={t('common.save_changes')} onPress={handleSave} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button
            label={t('common.delete_entry')}
            onPress={handleDelete}
            variant="ghost"
            textStyle={{ color: Colors.error }}
          />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Flare history item ──────────────────────────────────────────────────────

function FlareHistoryItem({ flare, isDark, onEdit }: { flare: Flare; isDark: boolean; onEdit: () => void }) {
  const { t } = useTranslation();
  const days = daysBetween(flare.start_date, flare.end_date);
  const areaLabels = translatedAreaLabels(t, flare.areas_affected, flare.flare_type);
  const severityColor = SEVERITY_COLOR[flare.severity];

  return (
    <View style={[styles.historyItem, isDark && styles.historyItemDark, { borderLeftColor: severityColor }]}>
      <View style={styles.historyItemHeader}>
        <Text style={[styles.historyDateRange, isDark && styles.textPrimaryDark]}>
          {formatDate(flare.start_date)}
          {flare.end_date ? ` – ${formatDate(flare.end_date)}` : ''}
        </Text>
        <View style={styles.historyItemActions}>
          <SeverityBadge severity={flare.severity} isDark={isDark} />
          <TouchableOpacity onPress={onEdit} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.historyEditLink, { color: Colors.primary }]}>{t('common.edit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.historyDuration, isDark && styles.textPrimaryDark]}>
        {flare.end_date
          ? tPlural(t, 'flares.duration_days', days)
          : t('flares.duration_ongoing')}
      </Text>
      {areaLabels.length > 0 && (
        <Text style={[styles.historyAreas, isDark && styles.textSecDark]} numberOfLines={2}>
          {areaLabels}
        </Text>
      )}
    </View>
  );
}

// ─── Start Flare Modal ────────────────────────────────────────────────────────

interface StartFlareModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (severity: FlareSeverity, areas: string[], notes: string) => Promise<void>;
  isDark: boolean;
  title: string;
  locationOptions: { value: string; labelKey: string }[];
}

function StartFlareModal({ visible, onClose, onConfirm, isDark, title, locationOptions }: StartFlareModalProps) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<FlareSeverity>('moderate');
  const [areas, setAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const toggleArea = (area: string) => {
    setAreas((prev) => prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]);
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm(severity, areas, notes);
      setSeverity('moderate');
      setAreas([]);
      setNotes('');
      onClose();
    } catch {
      Alert.alert(t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const SEVERITIES: FlareSeverity[] = ['mild', 'moderate', 'severe'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>{title}</Text>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>
            {t('flares.flare_severity')}
          </Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map((sev) => {
              const selected = severity === sev;
              const color = SEVERITY_COLOR[sev];
              return (
                <TouchableOpacity
                  key={sev}
                  onPress={() => setSeverity(sev)}
                  style={[styles.chip, isDark && styles.chipDark, selected && { backgroundColor: color + '22', borderColor: color }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700', fontFamily: FontFamily.bold }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>
            {t('flares.location_optional')}
          </Text>
          <View style={styles.chipRow}>
            {locationOptions.map((loc) => {
              const selected = areas.includes(loc.value);
              return (
                <TouchableOpacity
                  key={loc.value}
                  onPress={() => toggleArea(loc.value)}
                  style={[styles.chip, isDark && styles.chipDark, selected && styles.chipSelected]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && styles.chipTextSelected]}>
                    {t(loc.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>
            {t('flares.notes')}
          </Text>
          <TextInput
            style={[styles.notesInput, isDark && styles.notesInputDark]}
            placeholder={t('flares.notes_placeholder')}
            placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Button label={t('flares.log_flare_button')} onPress={handleConfirm} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit Uveitis Modal ───────────────────────────────────────────────────────

interface EditUveitisModalProps {
  visible: boolean;
  episode: UveitisEpisode | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<UveitisEpisode>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isDark: boolean;
}

function EditUveitisModal({ visible, episode, onClose, onSave, onDelete, isDark }: EditUveitisModalProps) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<FlareSeverity>('moderate');
  const [affectedEye, setAffectedEye] = useState<UveitisEye>('left');
  const [symptoms, setSymptoms] = useState<UveitisSymptom[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (episode) {
      setSeverity(episode.severity);
      setAffectedEye(episode.affected_eye);
      setSymptoms(episode.symptoms);
      setStartDate(episode.start_date);
      setEndDate(episode.end_date ?? '');
      setNotes(episode.notes ?? '');
    }
  }, [episode]);

  const toggleSymptom = (s: UveitisSymptom) =>
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleSave = async () => {
    if (!episode?.id) return;
    setIsSaving(true);
    try {
      await onSave(episode.id, { severity, affected_eye: affectedEye, symptoms, start_date: startDate, end_date: endDate || null, notes });
      onClose();
    } catch { Alert.alert(t('errors.save_failed')); }
    finally { setIsSaving(false); }
  };

  const handleDelete = () => {
    if (!episode?.id) return;
    Alert.alert(t('flares.delete_episode_title'), t('flares.delete_episode_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        try { await onDelete(episode.id!); onClose(); }
        catch { Alert.alert(t('errors.save_failed')); }
      }},
    ]);
  };

  const SEVERITIES: FlareSeverity[] = ['mild', 'moderate', 'severe'];
  const EYES: { value: UveitisEye; label: string }[] = [
    { value: 'left', label: t('flares.uveitis_eye.left') },
    { value: 'right', label: t('flares.uveitis_eye.right') },
    { value: 'both', label: t('flares.uveitis_eye.both') },
  ];
  const SYMPTOMS_LIST: { value: UveitisSymptom; label: string }[] = [
    { value: 'red_eye', label: t('flares.uveitis_symptom.red_eye') },
    { value: 'photophobia', label: t('flares.uveitis_symptom.photophobia') },
    { value: 'blurred_vision', label: t('flares.uveitis_symptom.blurred_vision') },
    { value: 'eye_pain', label: t('flares.uveitis_symptom.eye_pain') },
    { value: 'floaters', label: t('flares.uveitis_symptom.floaters') },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>{t('flares.edit_uveitis')}</Text>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.severity_label')}</Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map(sev => {
              const selected = severity === sev;
              const color = SEVERITY_COLOR[sev];
              return (
                <TouchableOpacity key={sev} onPress={() => setSeverity(sev)}
                  style={[styles.chip, isDark && styles.chipDark, selected && { backgroundColor: color + '22', borderColor: color }]}
                  activeOpacity={0.7}>
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700', fontFamily: FontFamily.bold }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.affected_eye')}</Text>
          <View style={styles.chipRow}>
            {EYES.map(eye => (
              <TouchableOpacity key={eye.value} onPress={() => setAffectedEye(eye.value)}
                style={[styles.chip, isDark && styles.chipDark, affectedEye === eye.value && styles.chipSelected]}
                activeOpacity={0.7}>
                <Text style={[styles.chipText, isDark && styles.textSecDark, affectedEye === eye.value && styles.chipTextSelected]}>
                  {eye.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.symptoms_label')}</Text>
          <View style={styles.chipRow}>
            {SYMPTOMS_LIST.map(sym => (
              <TouchableOpacity key={sym.value} onPress={() => toggleSymptom(sym.value)}
                style={[styles.chip, isDark && styles.chipDark, symptoms.includes(sym.value) && styles.chipSelected]}
                activeOpacity={0.7}>
                <Text style={[styles.chipText, isDark && styles.textSecDark, symptoms.includes(sym.value) && styles.chipTextSelected]}>
                  {sym.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.dates')}</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>{t('flares.start_label')}</Text>
              <TextInput style={[styles.dateInput, isDark && styles.notesInputDark]}
                value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>{t('flares.end_label')}</Text>
              <TextInput style={[styles.dateInput, isDark && styles.notesInputDark]}
                value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.notes')}</Text>
          <TextInput style={[styles.notesInput, isDark && styles.notesInputDark]}
            placeholder={t('common.optional_notes')} placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
            value={notes} onChangeText={setNotes} multiline numberOfLines={2} textAlignVertical="top" />

          <Button label={t('common.save_changes')} onPress={handleSave} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button label={t('flares.delete_this_entry')} onPress={handleDelete} variant="ghost" textStyle={{ color: Colors.error }} />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
        </View>
      </View>
    </Modal>
  );
}

// ─── Uveitis history item ────────────────────────────────────────────────────

const UVEITIS_EYE_FULL_KEYS: Record<string, string> = {
  left: 'flares.uveitis_eye_full.left',
  right: 'flares.uveitis_eye_full.right',
  both: 'flares.uveitis_eye_full.both',
};
const UVEITIS_SYMPTOM_KEYS: Record<string, string> = {
  red_eye: 'flares.uveitis_symptom.red_eye',
  photophobia: 'flares.uveitis_symptom.photophobia',
  blurred_vision: 'flares.uveitis_symptom.blurred_vision',
  eye_pain: 'flares.uveitis_symptom.eye_pain',
  floaters: 'flares.uveitis_symptom.floaters',
};

function UveitisHistoryItem({ episode, onEnd, onEdit, isDark }: { episode: UveitisEpisode; onEnd: () => void; onEdit: () => void; isDark: boolean }) {
  const { t } = useTranslation();
  const severityColor = SEVERITY_COLOR[episode.severity];
  return (
    <View style={[styles.historyItem, isDark && styles.historyItemDark, { borderLeftColor: severityColor }]}>
      <View style={styles.historyItemHeader}>
        <Text style={[styles.historyDateRange, isDark && styles.textPrimaryDark]}>
          {formatDate(episode.start_date)}
          {episode.end_date ? ` – ${formatDate(episode.end_date)}` : ''}
        </Text>
        <View style={styles.historyItemActions}>
          <SeverityBadge severity={episode.severity} isDark={isDark} />
          <TouchableOpacity onPress={onEdit} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.historyEditLink, { color: Colors.primary }]}>{t('common.edit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.historyDuration, isDark && styles.textPrimaryDark]}>
        {UVEITIS_EYE_FULL_KEYS[episode.affected_eye] ? t(UVEITIS_EYE_FULL_KEYS[episode.affected_eye]) : episode.affected_eye}
        {episode.end_date
          ? ` · ${tPlural(t, 'flares.duration_days', daysBetween(episode.start_date, episode.end_date))}`
          : ` · ${t('flares.duration_ongoing')}`}
      </Text>
      {episode.symptoms.length > 0 && (
        <Text style={[styles.historyAreas, isDark && styles.textSecDark]}>
          {episode.symptoms.map(s => UVEITIS_SYMPTOM_KEYS[s] ? t(UVEITIS_SYMPTOM_KEYS[s]) : s.replace(/_/g, ' ')).join(', ')}
        </Text>
      )}
    </View>
  );
}

// ─── Start Uveitis Modal ──────────────────────────────────────────────────────

interface StartUveitisModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (ep: Omit<UveitisEpisode, 'id' | 'user_id' | 'end_date'>) => Promise<void>;
  isDark: boolean;
}

function StartUveitisModal({ visible, onClose, onConfirm, isDark }: StartUveitisModalProps) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<FlareSeverity>('moderate');
  const [affectedEye, setAffectedEye] = useState<UveitisEye>('left');
  const [symptoms, setSymptoms] = useState<UveitisSymptom[]>([]);
  const [treatmentReceived, setTreatmentReceived] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const SYMPTOMS: { value: UveitisSymptom; label: string }[] = [
    { value: 'red_eye', label: t('flares.uveitis_symptom.red_eye') },
    { value: 'photophobia', label: t('flares.uveitis_symptom.photophobia') },
    { value: 'blurred_vision', label: t('flares.uveitis_symptom.blurred_vision') },
    { value: 'eye_pain', label: t('flares.uveitis_symptom.eye_pain') },
    { value: 'floaters', label: t('flares.uveitis_symptom.floaters') },
  ];

  const EYES: { value: UveitisEye; label: string }[] = [
    { value: 'left', label: t('flares.uveitis_eye_full.left') },
    { value: 'right', label: t('flares.uveitis_eye_full.right') },
    { value: 'both', label: t('flares.uveitis_eye_full.both') },
  ];

  const toggleSymptom = (s: UveitisSymptom) => {
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm({
        start_date: new Date().toISOString().split('T')[0],
        severity,
        affected_eye: affectedEye,
        symptoms,
        treatment_received: treatmentReceived,
        notes,
      });
      setSeverity('moderate');
      setAffectedEye('left');
      setSymptoms([]);
      setTreatmentReceived(false);
      setNotes('');
      onClose();
    } catch {
      Alert.alert(t('errors.save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const SEVERITIES: FlareSeverity[] = ['mild', 'moderate', 'severe'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />

          {/* Warning banner */}
          <View style={[styles.uveitisWarningBanner]}>
            <Text style={styles.uveitisWarningText}>
              Seek urgent eye care. Uveitis can cause permanent vision loss if untreated. Contact your ophthalmologist or go to A&E today.
            </Text>
          </View>

          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>
            Log uveitis episode
          </Text>

          {/* Severity */}
          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Severity</Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map((sev) => {
              const selected = severity === sev;
              const color = SEVERITY_COLOR[sev];
              return (
                <TouchableOpacity
                  key={sev}
                  onPress={() => setSeverity(sev)}
                  style={[styles.chip, isDark && styles.chipDark, selected && { backgroundColor: color + '22', borderColor: color }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700', fontFamily: FontFamily.bold }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Affected eye */}
          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.affected_eye')}</Text>
          <View style={styles.chipRow}>
            {EYES.map((eye) => {
              const selected = affectedEye === eye.value;
              return (
                <TouchableOpacity
                  key={eye.value}
                  onPress={() => setAffectedEye(eye.value)}
                  style={[styles.chip, isDark && styles.chipDark, selected && styles.chipSelected]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && styles.chipTextSelected]}>
                    {eye.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Symptoms */}
          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.symptoms_label')}</Text>
          <View style={styles.chipRow}>
            {SYMPTOMS.map((sym) => {
              const selected = symptoms.includes(sym.value);
              return (
                <TouchableOpacity
                  key={sym.value}
                  onPress={() => toggleSymptom(sym.value)}
                  style={[styles.chip, isDark && styles.chipDark, selected && styles.chipSelected]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && styles.chipTextSelected]}>
                    {sym.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notes */}
          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.notes')}</Text>
          <TextInput
            style={[styles.notesInput, isDark && styles.notesInputDark]}
            placeholder={t('common.optional_notes')}
            placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          <Button label={t('flares.log_episode')} onPress={handleConfirm} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FlaresScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { flares: asFlares, activeFlare, isLoading, error, startFlare, endCurrentFlare, updateFlare: updateAsFlare, deleteFlare: deleteAsFlare, refresh } = useFlares('as');
  const { flares: enthesitisFlares, activeFlare: activeEnthesitis, startFlare: startEnthesitis, endCurrentFlare: endEnthesitis, updateFlare: updateEnthesitisFlare, deleteFlare: deleteEnthesitisFlare } = useFlares('enthesitis');
  const { flares: peripheralFlares, activeFlare: activePeripheral, startFlare: startPeripheral, endCurrentFlare: endPeripheral, updateFlare: updatePeripheralFlare, deleteFlare: deletePeripheralFlare } = useFlares('peripheral');
  const { episodes: uveitisEpisodes, activeEpisode: activeUveitis, startEpisode, endEpisode, deleteEpisode: deleteUveitis, updateEpisode: updateUveitis } = useUveitisEpisodes();
  const { profile } = useProfile();
  const [modalVisible, setModalVisible] = useState(false);
  const [showUveitisModal, setShowUveitisModal] = useState(false);
  const [showEnthesitisModal, setShowEnthesitisModal] = useState(false);
  const [showPeripheralModal, setShowPeripheralModal] = useState(false);
  const [editingFlare, setEditingFlare] = useState<Flare | null>(null);
  const [editingUveitis, setEditingUveitis] = useState<UveitisEpisode | null>(null);

  const editFlareLocations = editingFlare?.flare_type === 'enthesitis'
    ? ENTHESITIS_LOCATIONS
    : editingFlare?.flare_type === 'peripheral'
      ? PERIPHERAL_LOCATIONS
      : AS_LOCATIONS;

  const showUveitisSection = profile?.conditions?.includes('uveitis') ?? false;
  const showEnthesitisSection = profile?.conditions?.includes('enthesitis') ?? false;
  const showPeripheralSection = profile?.conditions?.includes('peripheral_joint') ?? false;

  const endedFlares = asFlares.filter((f) => f.end_date !== null);

  const handleEndFlare = () => {
    Alert.alert(
      t('flares.end_flare'),
      t('flares.confirm_end'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await endCurrentFlare();
            } catch {
              Alert.alert(t('errors.save_failed'));
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.screen, isDark && styles.screenDark]}>
        <LoadingSpinner fullScreen message={t('common.loading')} />
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
        {/* Screen title */}
        <View style={styles.screenTitleRow}>
          <Text style={[styles.screenTitle, isDark && styles.textPrimaryDark]}>
            {t('tabs.flares')}
          </Text>
          <ProfileButton />
        </View>

        {error && (
          <ErrorMessage message={error} onRetry={refresh} retryLabel={t('common.retry')} />
        )}

        {/* ── AS Flare card — status + history grouped ─── */}
        <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
          <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>{t('flares.as_flare')}</Text>

          {activeFlare ? (
            <View style={[styles.activeFlareInner, isDark && styles.activeFlareInnerDark]}>
              <View style={styles.activeFlareTitleRow}>
                <View style={styles.activeFlareIndicator} />
                <Text style={styles.activeFlareTitle}>{t('flares.active_flare')}</Text>
                <SeverityBadge severity={activeFlare.severity} isDark={isDark} />
              </View>
              <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                {t('flares.started')}: {formatDate(activeFlare.start_date)}
              </Text>
              <Text style={[styles.activeFlareDuration, isDark && styles.textSecDark]}>
                {t('flares.duration_ongoing')} · {tPlural(t, 'flares.duration_days', daysBetween(activeFlare.start_date, null))}
              </Text>
              {activeFlare.areas_affected.length > 0 && (
                <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                  {translatedAreaLabels(t, activeFlare.areas_affected, activeFlare.flare_type)}
                </Text>
              )}
              <TouchableOpacity onPress={() => setEditingFlare(activeFlare)} style={styles.activeFlareEditLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.historyEditLink}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <Button
                label={t('flares.end_flare')}
                onPress={handleEndFlare}
                variant="outline"
                textStyle={{ color: Colors.error }}
                style={styles.endFlareButton}
              />
            </View>
          ) : (
            <>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>{t('flares.no_current_flare')}</Text>
              </View>
              <Button
                label={t('flares.log_a_flare')}
                onPress={() => setModalVisible(true)}
                variant="outline"
                style={styles.logFlareBtn}
              />
            </>
          )}

          <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
          <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>{t('common.history')}</Text>

          {endedFlares.length === 0 ? (
            <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>{t('flares.no_past_flares')}</Text>
          ) : (
            endedFlares.map((flare) => (
              <FlareHistoryItem key={flare.id ?? flare.start_date} flare={flare} isDark={isDark} onEdit={() => setEditingFlare(flare)} />
            ))
          )}
        </View>

        {/* ── Enthesitis Flare card ─── */}
        {showEnthesitisSection && (
          <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
            <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>{t('flares.section_enthesitis')}</Text>

            {activeEnthesitis ? (
              <View style={[styles.activeFlareInner, isDark && styles.activeFlareInnerDark]}>
                <View style={styles.activeFlareTitleRow}>
                  <View style={styles.activeFlareIndicator} />
                  <Text style={[styles.activeFlareTitle, { flex: 1 }]}>{t('flares.active_enthesitis')}</Text>
                  <SeverityBadge severity={activeEnthesitis.severity} isDark={isDark} />
                </View>
                <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                  {t('flares.started')}: {formatDate(activeEnthesitis.start_date)}
                </Text>
                <Text style={[styles.activeFlareDuration, isDark && styles.textSecDark]}>
                  {t('flares.duration_ongoing')} · {tPlural(t, 'flares.duration_days', daysBetween(activeEnthesitis.start_date, null))}
                </Text>
                {activeEnthesitis.areas_affected.length > 0 && (
                  <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                    {translatedAreaLabels(t, activeEnthesitis.areas_affected, activeEnthesitis.flare_type)}
                  </Text>
                )}
                <TouchableOpacity onPress={() => setEditingFlare(activeEnthesitis)} style={styles.activeFlareEditLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.historyEditLink}>{t('common.edit')}</Text>
                </TouchableOpacity>
                <Button
                  label={t('common.mark_resolved')}
                  onPress={() => Alert.alert(t('flares.resolve_flare_title'), t('flares.resolve_enthesitis'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.resolve'), style: 'destructive', onPress: () => endEnthesitis() },
                  ])}
                  variant="outline"
                  textStyle={{ color: Colors.error }}
                  style={{ ...styles.endFlareButton, borderColor: Colors.error }}
                />
              </View>
            ) : (
              <>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>{t('flares.no_current_enthesitis')}</Text>
                </View>
                <Button label={t('flares.log_a_flare')} onPress={() => setShowEnthesitisModal(true)} variant="outline" style={styles.logFlareBtn} />
              </>
            )}

            <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
            <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>{t('common.history')}</Text>

            {enthesitisFlares.filter(f => f.end_date !== null).length === 0 ? (
              <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>{t('flares.no_past_enthesitis')}</Text>
            ) : enthesitisFlares.filter(f => f.end_date !== null).map(f => (
              <FlareHistoryItem key={f.id ?? f.start_date} flare={f} isDark={isDark} onEdit={() => setEditingFlare(f)} />
            ))}
          </View>
        )}

        {/* ── Peripheral Joint Flare card ─── */}
        {showPeripheralSection && (
          <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
            <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>Peripheral Joint Flare</Text>

            {activePeripheral ? (
              <View style={[styles.activeFlareInner, isDark && styles.activeFlareInnerDark]}>
                <View style={styles.activeFlareTitleRow}>
                  <View style={styles.activeFlareIndicator} />
                  <Text style={[styles.activeFlareTitle, { flex: 1 }]}>{t('flares.active_peripheral')}</Text>
                  <SeverityBadge severity={activePeripheral.severity} isDark={isDark} />
                </View>
                <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                  {t('flares.started')}: {formatDate(activePeripheral.start_date)}
                </Text>
                <Text style={[styles.activeFlareDuration, isDark && styles.textSecDark]}>
                  {t('flares.duration_ongoing')} · {tPlural(t, 'flares.duration_days', daysBetween(activePeripheral.start_date, null))}
                </Text>
                {activePeripheral.areas_affected.length > 0 && (
                  <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                    {translatedAreaLabels(t, activePeripheral.areas_affected, activePeripheral.flare_type)}
                  </Text>
                )}
                <TouchableOpacity onPress={() => setEditingFlare(activePeripheral)} style={styles.activeFlareEditLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.historyEditLink}>{t('common.edit')}</Text>
                </TouchableOpacity>
                <Button
                  label={t('common.mark_resolved')}
                  onPress={() => Alert.alert(t('flares.resolve_flare_title'), t('flares.resolve_peripheral'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.resolve'), style: 'destructive', onPress: () => endPeripheral() },
                  ])}
                  variant="outline"
                  textStyle={{ color: Colors.error }}
                  style={{ ...styles.endFlareButton, borderColor: Colors.error }}
                />
              </View>
            ) : (
              <>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>No current peripheral joint flare</Text>
                </View>
                <Button label={t('flares.log_a_flare')} onPress={() => setShowPeripheralModal(true)} variant="outline" style={styles.logFlareBtn} />
              </>
            )}

            <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
            <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>{t('common.history')}</Text>

            {peripheralFlares.filter(f => f.end_date !== null).length === 0 ? (
              <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>{t('flares.no_past_peripheral')}</Text>
            ) : peripheralFlares.filter(f => f.end_date !== null).map(f => (
              <FlareHistoryItem key={f.id ?? f.start_date} flare={f} isDark={isDark} onEdit={() => setEditingFlare(f)} />
            ))}
          </View>
        )}

        {/* ── Uveitis Flare card — status + history grouped ─── */}
        {showUveitisSection && (
          <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
            <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>{t('flares.section_uveitis')}</Text>

            {activeUveitis ? (
              <View style={[styles.activeFlareInner, isDark && styles.activeFlareInnerDark]}>
                <View style={styles.activeFlareTitleRow}>
                  <View style={styles.activeFlareIndicator} />
                  <Text style={[styles.activeFlareTitle, { flex: 1 }]}>{t('flares.active_uveitis')}</Text>
                  <SeverityBadge severity={activeUveitis.severity} isDark={isDark} />
                </View>
                <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                  {t('flares.started')}: {formatDate(activeUveitis.start_date)} · {UVEITIS_EYE_FULL_KEYS[activeUveitis.affected_eye] ? t(UVEITIS_EYE_FULL_KEYS[activeUveitis.affected_eye]) : activeUveitis.affected_eye}
                </Text>
                <Text style={[styles.activeFlareDuration, isDark && styles.textSecDark]}>
                  {t('flares.duration_ongoing')} · {tPlural(t, 'flares.duration_days', daysBetween(activeUveitis.start_date, null))}
                </Text>
                {activeUveitis.symptoms.length > 0 && (
                  <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                    {activeUveitis.symptoms.map(s => UVEITIS_SYMPTOM_KEYS[s] ? t(UVEITIS_SYMPTOM_KEYS[s]) : s.replace(/_/g, ' ')).join(', ')}
                  </Text>
                )}
                <TouchableOpacity onPress={() => setEditingUveitis(activeUveitis)} style={styles.activeFlareEditLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.historyEditLink}>{t('common.edit')}</Text>
                </TouchableOpacity>
                <Button
                  label={t('common.mark_resolved')}
                  onPress={() => {
                    Alert.alert(t('flares.resolve_episode_title'), t('flares.resolve_uveitis'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.resolve'), onPress: () => endEpisode(activeUveitis.id!) },
                    ]);
                  }}
                  variant="outline"
                  textStyle={{ color: Colors.error }}
                  style={{ ...styles.endFlareButton, borderColor: Colors.error }}
                />
              </View>
            ) : (
              <>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>{t('flares.no_current_episode')}</Text>
                </View>
                <Button
                  label={t('flares.log_episode_button')}
                  onPress={() => setShowUveitisModal(true)}
                  variant="outline"
                  style={styles.logFlareBtn}
                />
              </>
            )}

            <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
            <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>{t('common.history')}</Text>

            {uveitisEpisodes.filter(e => e.end_date !== null).length === 0 ? (
              <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>{t('flares.no_past_episodes')}</Text>
            ) : uveitisEpisodes.filter(e => e.end_date !== null).map((ep) => (
              <UveitisHistoryItem key={ep.id ?? ep.start_date} episode={ep} onEnd={() => endEpisode(ep.id!)} onEdit={() => setEditingUveitis(ep)} isDark={isDark} />
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <StartFlareModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={async (sev, areas, notes) => { await startFlare(sev, areas, notes); logEvent(Events.FLARE_LOGGED, { type: 'as' }).catch(() => {}); }}
        isDark={isDark}
        title={t('flares.log_as_title')}
        locationOptions={AS_LOCATIONS}
      />
      <StartFlareModal
        visible={showEnthesitisModal}
        onClose={() => setShowEnthesitisModal(false)}
        onConfirm={async (sev, areas, notes) => { await startEnthesitis(sev, areas, notes); logEvent(Events.FLARE_LOGGED, { type: 'enthesitis' }).catch(() => {}); }}
        isDark={isDark}
        title={t('flares.log_enthesitis_title')}
        locationOptions={ENTHESITIS_LOCATIONS}
      />
      <StartFlareModal
        visible={showPeripheralModal}
        onClose={() => setShowPeripheralModal(false)}
        onConfirm={async (sev, areas, notes) => { await startPeripheral(sev, areas, notes); logEvent(Events.FLARE_LOGGED, { type: 'peripheral' }).catch(() => {}); }}
        isDark={isDark}
        title={t('flares.log_peripheral_title')}
        locationOptions={PERIPHERAL_LOCATIONS}
      />
      <StartUveitisModal
        visible={showUveitisModal}
        onClose={() => setShowUveitisModal(false)}
        onConfirm={async (ep) => { await startEpisode(ep); logEvent(Events.FLARE_LOGGED, { type: 'uveitis' }).catch(() => {}); }}
        isDark={isDark}
      />
      <EditUveitisModal
        visible={editingUveitis !== null}
        episode={editingUveitis}
        onClose={() => setEditingUveitis(null)}
        onSave={async (id, updates) => { await updateUveitis(id, updates); setEditingUveitis(null); }}
        onDelete={async (id) => { await deleteUveitis(id); setEditingUveitis(null); }}
        isDark={isDark}
      />
      <EditFlareModal
        visible={editingFlare !== null}
        flare={editingFlare}
        onClose={() => setEditingFlare(null)}
        onSave={async (id, updates) => {
          const type = editingFlare?.flare_type ?? 'as';
          if (type === 'enthesitis') await updateEnthesitisFlare(id, updates);
          else if (type === 'peripheral') await updatePeripheralFlare(id, updates);
          else await updateAsFlare(id, updates);
          setEditingFlare(null);
        }}
        onDelete={async (id) => {
          const type = editingFlare?.flare_type ?? 'as';
          if (type === 'enthesitis') await deleteEnthesitisFlare(id);
          else if (type === 'peripheral') await deletePeripheralFlare(id);
          else await deleteAsFlare(id);
          setEditingFlare(null);
        }}
        isDark={isDark}
        locationOptions={editFlareLocations}
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
  textPrimaryDark: {
    color: Colors.textPrimaryDark,
  },
  textSecDark: {
    color: Colors.textSecondaryDark,
  },

  // Grouped section card — contains title + status + history
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  groupCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  groupCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    color: Colors.textPrimary,
  },
  activeFlareInner: {
    backgroundColor: Colors.error + '12',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.error + '50',
    gap: Spacing.xs,
  },
  activeFlareInnerDark: {
    backgroundColor: '#450A0A',
    borderColor: Colors.error + '60',
  },
  innerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginTop: Spacing.xs,
  },
  innerDividerDark: {
    backgroundColor: Colors.borderDark,
  },
  historySubLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
  },

  // Active flare card — red theme
  activeFlareCard: {
    backgroundColor: Colors.error + '12',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.error + '50',
    gap: Spacing.sm,
  },
  activeFlareCardDark: {
    backgroundColor: '#450A0A',
    borderColor: Colors.error + '70',
  },
  activeFlareTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  activeFlareIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
  activeFlareTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    fontFamily: FontFamily.extraBold,
    color: Colors.error,
    flex: 1,
  },
  activeFlareDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  activeFlareDuration: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  activeFlareAreas: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  endFlareButton: {
    marginTop: Spacing.xs,
    borderColor: Colors.error,
  },

  screenTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  screenTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    fontFamily: FontFamily.extraBold,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.sm,
  },

  // Status card — always shown, neutral when no flare
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  statusCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statusText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    color: Colors.textPrimary,
  },
  logFlareBtn: {
    alignSelf: 'flex-start',
  },

  // Section header row
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
  },
  sectionActionLink: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
  },
  emptyStateText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    paddingVertical: Spacing.xs,
  },

  // History items — 4px left border in severity color
  historyItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.md,
    paddingLeft: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    gap: Spacing.xs,
  },
  historyItemDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  historyEditLink: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  activeFlareEditLink: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  reopenFlareLink: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
  },
  reopenFlareLinkText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  historyDateRange: {
    fontSize: FontSize.md,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  historyDuration: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    color: Colors.textPrimary,
  },
  historyAreas: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },

  // Severity badge
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  emptyCardDark: {
    backgroundColor: Colors.surfaceDark,
    borderColor: Colors.borderDark,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Chip styles (used in modal)
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipDark: {
    borderColor: Colors.borderDark,
    backgroundColor: Colors.backgroundDark,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
    fontFamily: FontFamily.medium,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: FontFamily.bold,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  modalSheetDark: {
    backgroundColor: Colors.surfaceDark,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    fontFamily: FontFamily.extraBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  modalSectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  notesInput: {
    minHeight: 80,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  notesInputDark: {
    borderColor: Colors.borderDark,
    backgroundColor: Colors.backgroundDark,
    color: Colors.textPrimaryDark,
  },
  modalConfirmButton: {
    marginTop: Spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dateInputLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    marginBottom: 4,
    color: Colors.textSecondary,
  },
  dateInput: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },

  bottomPad: {
    height: Spacing.xl,
  },
  uveitisWarningBanner: {
    backgroundColor: Colors.error + '20',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.error + '50',
    marginBottom: Spacing.sm,
  },
  uveitisWarningText: {
    fontSize: FontSize.xs,
    color: Colors.error,
    fontWeight: '600',
    fontFamily: FontFamily.semiBold,
    lineHeight: 18,
  },
});
