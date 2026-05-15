import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { logEvent, Events } from '@/services/analytics';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

interface PremiumModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchase: () => void;
  onRestore: () => void;
  monthlyPrice: string | null;
  isPurchasing: boolean;
  isRestoring: boolean;
  isDark: boolean;
}

// ─── Mock renders ─────────────────────────────────────────────────────────────

function MockInsightCard({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? '#2D1A0E' : '#FFF7ED';
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <View style={[mock.card, { backgroundColor: cardBg, borderColor: Colors.primary + '40' }]}>
      <View style={mock.row}>
        <Text style={[mock.cardTitle, { color: textPrimary }]}>Your weekly insight</Text>
        <View style={mock.badge}><Text style={mock.badgeText}>AI</Text></View>
      </View>
      <Text style={[mock.body, { color: textSecondary }]}>
        Your pain was lower on days you slept over 7 hours. Fatigue spiked mid-week — likely linked to Tuesday's longer walk.
      </Text>
      <View style={mock.chipRow}>
        {['😴 Sleep → pain', '🚶 Activity', '📈 Trending up'].map(t => (
          <View key={t} style={[mock.chip, { borderColor: Colors.primary + '60' }]}>
            <Text style={[mock.chipText, { color: Colors.primary }]}>{t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MockChatCard({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const userBg = Colors.primary;
  const aiBg = isDark ? '#3a3330' : '#F5F5F4';

  return (
    <View style={[mock.card, { backgroundColor: cardBg, borderColor: isDark ? Colors.borderDark : Colors.border }]}>
      <View style={mock.row}>
        <Text style={[mock.cardTitle, { color: textPrimary }]}>Chat with your data</Text>
        <View style={mock.badge}><Text style={mock.badgeText}>AI</Text></View>
      </View>
      <View style={mock.chatBubbleUser}>
        <Text style={[mock.chatText, { color: '#FFFFFF', backgroundColor: userBg }]}>
          Why do I tend to flare on weekends?
        </Text>
      </View>
      <View style={mock.chatBubbleAi}>
        <Text style={[mock.chatText, { color: textPrimary, backgroundColor: aiBg }]}>
          Your data shows sleep is shorter on Friday nights, and you're 3× more active on Saturdays. Both are correlated with flares in your history.
        </Text>
      </View>
      <Text style={[mock.chatPrompt, { color: textSecondary }]}>Ask anything about your health data…</Text>
    </View>
  );
}

function MockFlareCard({ isDark }: { isDark: boolean }) {
  const cardBg = isDark ? '#1a1200' : '#FFFBEB';
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  const bars = [3, 5, 4, 7, 6, 8, 5];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const maxBar = 8;

  return (
    <View style={[mock.card, { backgroundColor: cardBg, borderColor: Colors.warning + '60' }]}>
      <View style={mock.row}>
        <Text style={[mock.cardTitle, { color: textPrimary }]}>Flare risk</Text>
        <View style={[mock.badge, { backgroundColor: Colors.warning + '20' }]}>
          <Text style={[mock.badgeText, { color: Colors.warning }]}>⚠ Elevated</Text>
        </View>
      </View>
      <View style={mock.chartRow}>
        {bars.map((h, i) => (
          <View key={i} style={mock.barCol}>
            <View style={mock.barTrack}>
              <View style={[
                mock.barFill,
                { height: `${(h / maxBar) * 100}%`, backgroundColor: h >= 7 ? Colors.error : h >= 5 ? Colors.warning : Colors.success },
              ]} />
            </View>
            <Text style={[mock.barLabel, { color: textSecondary }]}>{days[i]}</Text>
          </View>
        ))}
      </View>
      <Text style={[mock.body, { color: textSecondary, marginTop: Spacing.xs }]}>
        Stiffness has been trending up for 3 days. Based on your patterns, take it easy this weekend.
      </Text>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function PremiumModal({
  visible,
  onClose,
  onPurchase,
  onRestore,
  monthlyPrice,
  isPurchasing,
  isRestoring,
  isDark,
}: PremiumModalProps) {
  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;

  const features: { icon: string; title: string; body: string }[] = [
    {
      icon: '📊',
      title: 'Weekly AI insight report',
      body: 'Every week, Spondy analyses your logs and surfaces the patterns driving your symptoms.',
    },
    {
      icon: '💬',
      title: 'Chat with your data',
      body: 'Ask anything — "why do I flare on weekends?" or "what helps my sleep?" — and get answers grounded in your own history.',
    },
    {
      icon: '🔮',
      title: 'Flare prediction nudges',
      body: 'When your patterns suggest a flare is building, Spondy lets you know early — so you can act before it peaks.',
    },
    {
      icon: '🎯',
      title: 'Extended personalisation',
      body: 'The more context you give, the smarter your insights get. Premium unlocks full AI personalisation.',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      onShow={() => logEvent(Events.PREMIUM_MODAL_OPENED).catch(() => {})}
    >
      <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
        {/* Close button */}
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Text style={[styles.closeText, { color: textSecondary }]}>✕</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>✦</Text>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>Spondy Premium</Text>
            <Text style={[styles.headerSubtitle, { color: textSecondary }]}>
              Understand your AS like never before. Let your data tell the story.
            </Text>
          </View>

          {/* Mock screenshots */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>See it in action</Text>
          <MockInsightCard isDark={isDark} />
          <MockChatCard isDark={isDark} />
          <MockFlareCard isDark={isDark} />

          {/* Feature list */}
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>What's included</Text>
          <View style={[styles.featureCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {features.map((f, i) => (
              <View key={f.title} style={[styles.featureRow, i < features.length - 1 && { borderBottomWidth: 1, borderBottomColor: cardBorder }]}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={styles.featureTextWrap}>
                  <Text style={[styles.featureTitle, { color: textPrimary }]}>{f.title}</Text>
                  <Text style={[styles.featureBody, { color: textSecondary }]}>{f.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Pricing */}
          {monthlyPrice && (
            <Text style={[styles.priceAmount, { color: textPrimary }]}>
              {monthlyPrice} / month
            </Text>
          )}
          <Text style={[styles.trialLabel, { color: textSecondary }]}>
            Start with a 14-day free trial
          </Text>
          <Text style={[styles.pricingNote, { color: textSecondary }]}>
            Cancel any time from Settings → Apple ID → Subscriptions.
          </Text>
          <View style={styles.legalRow}>
            <Text
              style={[styles.legalLink, { color: textSecondary }]}
              onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
            >
              Terms of Use
            </Text>
            <Text style={[styles.legalDot, { color: textSecondary }]}> · </Text>
            <Text
              style={[styles.legalLink, { color: textSecondary }]}
              onPress={() => Linking.openURL('https://gist.github.com/joekalise/fb689414dba7ade9f6d7383ccad9cf1f')}
            >
              Privacy Policy
            </Text>
          </View>

          {/* CTAs */}
          <TouchableOpacity
            onPress={onPurchase}
            disabled={isPurchasing}
            activeOpacity={0.85}
            style={[styles.primaryBtn, { opacity: isPurchasing ? 0.7 : 1 }]}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Start free trial</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onRestore}
            disabled={isRestoring}
            activeOpacity={0.7}
            style={styles.restoreBtn}
          >
            {isRestoring ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Text style={[styles.restoreText, { color: textSecondary }]}>Restore purchases</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mock = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  badge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  body: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  chatBubbleUser: {
    alignItems: 'flex-end',
    marginBottom: Spacing.xs,
  },
  chatBubbleAi: {
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  chatText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: '85%',
    overflow: 'hidden',
  },
  chatPrompt: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 6,
    marginTop: Spacing.sm,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
  },
  barLabel: {
    fontSize: 10,
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: Spacing.md,
    paddingBottom: 0,
  },
  closeText: {
    fontSize: 20,
    fontWeight: '500',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  headerEmoji: {
    fontSize: 36,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  featureCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  featureIcon: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
    marginTop: 1,
  },
  featureTextWrap: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  featureBody: {
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  trialLabel: {
    fontSize: FontSize.sm,
    marginBottom: 6,
  },
  pricingNote: {
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  legalLink: {
    fontSize: FontSize.xs,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: FontSize.xs,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  restoreText: {
    fontSize: FontSize.sm,
  },
});
