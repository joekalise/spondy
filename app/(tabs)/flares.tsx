import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useFlares } from '@/hooks/useFlares';
import { useUveitisEpisodes } from '@/hooks/useUveitisEpisodes';
import { useProfile } from '@/contexts/ProfileContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { Button } from '@/components/common/Button';
import { ProfileButton } from '@/components/common/ProfileButton';
import { FlareSeverity, Flare, FlareType, UveitisEpisode, UveitisEye, UveitisSymptom } from '@/types';

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
  return new Date(dateStr).toLocaleDateString('en-GB', {
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

const AS_LOCATIONS: { value: string; label: string }[] = [
  { value: 'lower_back', label: 'Lower back / SI' },
  { value: 'upper_back', label: 'Upper back' },
  { value: 'hips', label: 'Hips' },
  { value: 'neck', label: 'Neck' },
  { value: 'chest', label: 'Chest / ribs' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'knees', label: 'Knees' },
  { value: 'jaw', label: 'Jaw (TMJ)' },
];

const ENTHESITIS_LOCATIONS: { value: string; label: string }[] = [
  { value: 'heel_achilles', label: 'Heel / Achilles' },
  { value: 'plantar_fascia', label: 'Plantar fascia' },
  { value: 'chest_sternum', label: 'Chest / sternum' },
  { value: 'ribs', label: 'Ribs' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'si_joint', label: 'SI joint' },
  { value: 'knee_tendon', label: 'Knee tendon' },
  { value: 'other', label: 'Other' },
];

const PERIPHERAL_LOCATIONS: { value: string; label: string }[] = [
  { value: 'knee', label: 'Knee' },
  { value: 'hip', label: 'Hip' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'ankle', label: 'Ankle' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'fingers_toes', label: 'Fingers / toes' },
  { value: 'other', label: 'Other' },
];

// ─── Edit Flare Modal ─────────────────────────────────────────────────────────

interface EditFlareModalProps {
  visible: boolean;
  flare: Flare | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Flare>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isDark: boolean;
  locationOptions: { value: string; label: string }[];
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
    Alert.alert('Delete flare', 'This will permanently remove this entry.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
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
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>Edit flare</Text>

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
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700' }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Location</Text>
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
                    {loc.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Dates</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>Start</Text>
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
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>End (leave blank if ongoing)</Text>
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

          <Button label="Save changes" onPress={handleSave} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button
            label="Delete this entry"
            onPress={handleDelete}
            variant="ghost"
            textStyle={{ color: Colors.error }}
          />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
        </View>
      </View>
    </Modal>
  );
}

// ─── Flare history item ──────────────────────────────────────────────────────

function FlareHistoryItem({ flare, isDark, onEdit }: { flare: Flare; isDark: boolean; onEdit: () => void }) {
  const { t } = useTranslation();
  const days = daysBetween(flare.start_date, flare.end_date);
  const areaLabels = flare.areas_affected.map(a => a.replace(/_/g, ' ')).join(', ');
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
            <Text style={[styles.historyEditLink, { color: Colors.primary }]}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.historyDuration, isDark && styles.textPrimaryDark]}>
        {flare.end_date
          ? t('flares.duration_days', { days })
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
  locationOptions: { value: string; label: string }[];
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
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
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
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700' }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>
            Location (optional)
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
                    {loc.label}
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

          <Button label="Log flare" onPress={handleConfirm} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
        </View>
      </View>
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
    Alert.alert('Delete episode', 'This will permanently remove this episode.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await onDelete(episode.id!); onClose(); }
        catch { Alert.alert(t('errors.save_failed')); }
      }},
    ]);
  };

  const SEVERITIES: FlareSeverity[] = ['mild', 'moderate', 'severe'];
  const EYES: { value: UveitisEye; label: string }[] = [
    { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' },
  ];
  const SYMPTOMS_LIST: { value: UveitisSymptom; label: string }[] = [
    { value: 'red_eye', label: 'Red eye' }, { value: 'photophobia', label: 'Light sensitivity' },
    { value: 'blurred_vision', label: 'Blurred vision' }, { value: 'eye_pain', label: 'Eye pain' },
    { value: 'floaters', label: 'Floaters' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, isDark && styles.modalSheetDark]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, isDark && styles.textPrimaryDark]}>Edit uveitis episode</Text>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Severity</Text>
          <View style={styles.chipRow}>
            {SEVERITIES.map(sev => {
              const selected = severity === sev;
              const color = SEVERITY_COLOR[sev];
              return (
                <TouchableOpacity key={sev} onPress={() => setSeverity(sev)}
                  style={[styles.chip, isDark && styles.chipDark, selected && { backgroundColor: color + '22', borderColor: color }]}
                  activeOpacity={0.7}>
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700' }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Affected eye</Text>
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

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Symptoms</Text>
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

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Dates</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>Start</Text>
              <TextInput style={[styles.dateInput, isDark && styles.notesInputDark]}
                value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateInputLabel, isDark && styles.textSecDark]}>End</Text>
              <TextInput style={[styles.dateInput, isDark && styles.notesInputDark]}
                value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
                keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>{t('flares.notes')}</Text>
          <TextInput style={[styles.notesInput, isDark && styles.notesInputDark]}
            placeholder="Optional notes..." placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
            value={notes} onChangeText={setNotes} multiline numberOfLines={2} textAlignVertical="top" />

          <Button label="Save changes" onPress={handleSave} isLoading={isSaving} style={styles.modalConfirmButton} />
          <Button label="Delete this entry" onPress={handleDelete} variant="ghost" textStyle={{ color: Colors.error }} />
          <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
        </View>
      </View>
    </Modal>
  );
}

// ─── Uveitis history item ────────────────────────────────────────────────────

function UveitisHistoryItem({ episode, onEnd, onEdit, isDark }: { episode: UveitisEpisode; onEnd: () => void; onEdit: () => void; isDark: boolean }) {
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
            <Text style={[styles.historyEditLink, { color: Colors.primary }]}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.historyDuration, isDark && styles.textPrimaryDark]}>
        {episode.affected_eye.charAt(0).toUpperCase() + episode.affected_eye.slice(1)} eye
        {episode.end_date ? ` · ${daysBetween(episode.start_date, episode.end_date)} days` : ' · Ongoing'}
      </Text>
      {episode.symptoms.length > 0 && (
        <Text style={[styles.historyAreas, isDark && styles.textSecDark]}>
          {episode.symptoms.map(s => s.replace(/_/g, ' ')).join(', ')}
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
    { value: 'red_eye', label: 'Red eye' },
    { value: 'photophobia', label: 'Light sensitivity' },
    { value: 'blurred_vision', label: 'Blurred vision' },
    { value: 'eye_pain', label: 'Eye pain' },
    { value: 'floaters', label: 'Floaters' },
  ];

  const EYES: { value: UveitisEye; label: string }[] = [
    { value: 'left', label: 'Left eye' },
    { value: 'right', label: 'Right eye' },
    { value: 'both', label: 'Both eyes' },
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
                  <Text style={[styles.chipText, isDark && styles.textSecDark, selected && { color, fontWeight: '700' }]}>
                    {t(`flares.severity_${sev}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Affected eye */}
          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Affected eye</Text>
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
          <Text style={[styles.modalSectionLabel, isDark && styles.textPrimaryDark]}>Symptoms</Text>
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
            placeholder="Optional notes..."
            placeholderTextColor={isDark ? Colors.textSecondaryDark : Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          <Button label="Log episode" onPress={handleConfirm} isLoading={isSaving} style={styles.modalConfirmButton} />
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
            Flares
          </Text>
          <ProfileButton />
        </View>

        {error && (
          <ErrorMessage message={error} onRetry={refresh} retryLabel={t('common.retry')} />
        )}

        {/* ── AS Flare card — status + history grouped ─── */}
        <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
          <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>AS Flare</Text>

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
                {t('flares.duration_ongoing')} · {daysBetween(activeFlare.start_date, null)} days
              </Text>
              {activeFlare.areas_affected.length > 0 && (
                <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                  {activeFlare.areas_affected.map(a => a.replace(/_/g, ' ')).join(', ')}
                </Text>
              )}
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
                <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>No current flare</Text>
              </View>
              <Button
                label="Log a flare"
                onPress={() => setModalVisible(true)}
                variant="outline"
                style={styles.logFlareBtn}
              />
            </>
          )}

          <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
          <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>History</Text>

          {endedFlares.length === 0 ? (
            <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>No past flares recorded.</Text>
          ) : (
            endedFlares.map((flare) => (
              <FlareHistoryItem key={flare.id ?? flare.start_date} flare={flare} isDark={isDark} onEdit={() => setEditingFlare(flare)} />
            ))
          )}
        </View>

        {/* ── Enthesitis Flare card ─── */}
        {showEnthesitisSection && (
          <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
            <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>Enthesitis Flare</Text>

            {activeEnthesitis ? (
              <View style={[styles.activeFlareInner, isDark && styles.activeFlareInnerDark]}>
                <View style={styles.activeFlareTitleRow}>
                  <View style={styles.activeFlareIndicator} />
                  <Text style={[styles.activeFlareTitle, { flex: 1 }]}>Active enthesitis flare</Text>
                  <SeverityBadge severity={activeEnthesitis.severity} isDark={isDark} />
                </View>
                <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                  Started: {formatDate(activeEnthesitis.start_date)}
                </Text>
                {activeEnthesitis.areas_affected.length > 0 && (
                  <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                    {activeEnthesitis.areas_affected.map(a => a.replace(/_/g, ' ')).join(', ')}
                  </Text>
                )}
                <Button
                  label="Mark as resolved"
                  onPress={() => Alert.alert('Resolve flare', 'Mark this enthesitis flare as resolved?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Resolve', style: 'destructive', onPress: () => endEnthesitis() },
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
                  <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>No current enthesitis flare</Text>
                </View>
                <Button label="Log a flare" onPress={() => setShowEnthesitisModal(true)} variant="outline" style={styles.logFlareBtn} />
              </>
            )}

            <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
            <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>History</Text>

            {enthesitisFlares.filter(f => f.end_date !== null).length === 0 ? (
              <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>No past enthesitis flares recorded.</Text>
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
                  <Text style={[styles.activeFlareTitle, { flex: 1 }]}>Active peripheral flare</Text>
                  <SeverityBadge severity={activePeripheral.severity} isDark={isDark} />
                </View>
                <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                  Started: {formatDate(activePeripheral.start_date)}
                </Text>
                {activePeripheral.areas_affected.length > 0 && (
                  <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                    {activePeripheral.areas_affected.map(a => a.replace(/_/g, ' ')).join(', ')}
                  </Text>
                )}
                <Button
                  label="Mark as resolved"
                  onPress={() => Alert.alert('Resolve flare', 'Mark this peripheral joint flare as resolved?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Resolve', style: 'destructive', onPress: () => endPeripheral() },
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
                <Button label="Log a flare" onPress={() => setShowPeripheralModal(true)} variant="outline" style={styles.logFlareBtn} />
              </>
            )}

            <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
            <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>History</Text>

            {peripheralFlares.filter(f => f.end_date !== null).length === 0 ? (
              <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>No past peripheral joint flares recorded.</Text>
            ) : peripheralFlares.filter(f => f.end_date !== null).map(f => (
              <FlareHistoryItem key={f.id ?? f.start_date} flare={f} isDark={isDark} onEdit={() => setEditingFlare(f)} />
            ))}
          </View>
        )}

        {/* ── Uveitis Flare card — status + history grouped ─── */}
        {showUveitisSection && (
          <View style={[styles.groupCard, isDark && styles.groupCardDark]}>
            <Text style={[styles.groupCardTitle, isDark && styles.textPrimaryDark]}>Uveitis Flare</Text>

            {activeUveitis ? (
              <View style={[styles.activeFlareInner, isDark && styles.activeFlareInnerDark]}>
                <View style={styles.activeFlareTitleRow}>
                  <View style={styles.activeFlareIndicator} />
                  <Text style={[styles.activeFlareTitle, { flex: 1 }]}>Active uveitis episode</Text>
                  <SeverityBadge severity={activeUveitis.severity} isDark={isDark} />
                </View>
                <Text style={[styles.activeFlareDate, isDark && styles.textSecDark]}>
                  Started: {formatDate(activeUveitis.start_date)} · {activeUveitis.affected_eye} eye
                </Text>
                {activeUveitis.symptoms.length > 0 && (
                  <Text style={[styles.activeFlareAreas, isDark && styles.textSecDark]}>
                    {activeUveitis.symptoms.map(s => s.replace(/_/g, ' ')).join(', ')}
                  </Text>
                )}
                <Button
                  label="Mark as resolved"
                  onPress={() => {
                    Alert.alert('Resolve episode', 'Mark this uveitis episode as resolved?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Resolve', onPress: () => endEpisode(activeUveitis.id!) },
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
                  <Text style={[styles.statusText, isDark && styles.textPrimaryDark]}>No current episode</Text>
                </View>
                <Button
                  label="Log an episode"
                  onPress={() => setShowUveitisModal(true)}
                  variant="outline"
                  style={styles.logFlareBtn}
                />
              </>
            )}

            <View style={[styles.innerDivider, isDark && styles.innerDividerDark]} />
            <Text style={[styles.historySubLabel, isDark && styles.textSecDark]}>History</Text>

            {uveitisEpisodes.filter(e => e.end_date !== null).length === 0 ? (
              <Text style={[styles.emptyStateText, isDark && styles.textSecDark]}>No past episodes recorded.</Text>
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
        onConfirm={startFlare}
        isDark={isDark}
        title="Log AS flare"
        locationOptions={AS_LOCATIONS}
      />
      <StartFlareModal
        visible={showEnthesitisModal}
        onClose={() => setShowEnthesitisModal(false)}
        onConfirm={startEnthesitis}
        isDark={isDark}
        title="Log enthesitis flare"
        locationOptions={ENTHESITIS_LOCATIONS}
      />
      <StartFlareModal
        visible={showPeripheralModal}
        onClose={() => setShowPeripheralModal(false)}
        onConfirm={startPeripheral}
        isDark={isDark}
        title="Log peripheral joint flare"
        locationOptions={PERIPHERAL_LOCATIONS}
      />
      <StartUveitisModal
        visible={showUveitisModal}
        onClose={() => setShowUveitisModal(false)}
        onConfirm={startEpisode}
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
    color: Colors.textSecondary,
  },
  sectionActionLink: {
    fontSize: FontSize.sm,
    fontWeight: '700',
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
  },
  historyDateRange: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  historyDuration: {
    fontSize: FontSize.md,
    fontWeight: '700',
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
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  modalSectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
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
    lineHeight: 18,
  },
});
