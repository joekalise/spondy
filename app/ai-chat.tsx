import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useColorScheme,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { useWeeklyData } from '@/hooks/useWeeklyData';
import { useFlares } from '@/hooks/useFlares';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useHealthHistory } from '@/hooks/useHealthHistory';
import { sendChatMessage } from '@/services/aiInsights';
import { getDailyLogs } from '@/services/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(text: string, isDark: boolean): React.ReactElement {
  const textColor = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const secondaryColor = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  const lines = text.split('\n');
  const elements: React.ReactElement[] = [];
  let key = 0;

  const renderInline = (line: string, baseColor: string): React.ReactElement => {
    // Handle **bold** inline segments
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length === 1) {
      return <Text key={key++} style={{ color: baseColor, fontSize: FontSize.sm, lineHeight: 20 }}>{line}</Text>;
    }
    return (
      <Text key={key++} style={{ color: baseColor, fontSize: FontSize.sm, lineHeight: 20 }}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <Text key={i} style={{ fontWeight: '700', color: baseColor }}>
                {part.slice(2, -2)}
              </Text>
            );
          }
          return part;
        })}
      </Text>
    );
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      // Blank line — add spacing
      elements.push(<View key={key++} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Heading: ### or ## or #
    if (/^#{1,3} /.test(line)) {
      const headingText = line.replace(/^#{1,3} /, '');
      elements.push(
        <Text key={key++} style={{ fontWeight: '700', fontSize: FontSize.sm, color: textColor, lineHeight: 20, marginTop: 4 }}>
          {headingText}
        </Text>
      );
      i++;
      continue;
    }

    // Bullet: - or •
    if (/^[-•] /.test(line)) {
      const bulletText = line.replace(/^[-•] /, '');
      elements.push(
        <View key={key++} style={{ flexDirection: 'row', paddingLeft: 4, gap: 6 }}>
          <Text style={{ color: textColor, fontSize: FontSize.sm, lineHeight: 20 }}>{'•'}</Text>
          {renderInline(bulletText, textColor)}
        </View>
      );
      i++;
      continue;
    }

    // Normal paragraph line
    elements.push(renderInline(line, textColor));
    i++;
  }

  return <View style={{ gap: 2 }}>{elements}</View>;
}

// ─── TypingIndicator ──────────────────────────────────────────────────────────

function TypingIndicator({ isDark }: { isDark: boolean }) {
  const bubbleBg = isDark ? Colors.surfaceDark : Colors.surface;
  const bubbleBorder = isDark ? Colors.borderDark : Colors.border;
  const dotColor = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <View style={[styles.bubbleWrapper, styles.assistantWrapper]}>
      <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: bubbleBg, borderColor: bubbleBorder }]}>
        <Text style={{ color: dotColor, fontSize: FontSize.lg, letterSpacing: 2 }}>
          {'· · ·'}
        </Text>
      </View>
    </View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, isDark }: { message: Message; isDark: boolean }) {
  const isUser = message.role === 'user';
  const bubbleBg = isUser ? Colors.primary : (isDark ? Colors.surfaceDark : Colors.surface);
  const bubbleBorder = isUser ? Colors.primary : (isDark ? Colors.borderDark : Colors.border);
  const textColor = isUser ? '#FFFFFF' : (isDark ? Colors.textPrimaryDark : Colors.textPrimary);

  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          { backgroundColor: bubbleBg, borderColor: bubbleBorder },
        ]}
      >
        {isUser ? (
          <Text style={[styles.bubbleText, { color: textColor }]}>
            {message.content}
          </Text>
        ) : (
          renderMarkdown(message.content, isDark)
        )}
      </View>
    </View>
  );
}

// ─── LockedState ──────────────────────────────────────────────────────────────

function LockedState({
  isDark,
  onUpgrade,
}: {
  isDark: boolean;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation();
  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <View style={[styles.lockedContainer, { backgroundColor: bg }]}>
      <Text style={[styles.lockedTitle, { color: textPrimary }]}>
        {t('ai_chat.locked_title')}
      </Text>
      <Text style={[styles.lockedBody, { color: textSecondary }]}>
        {t('ai_chat.locked_body')}
      </Text>
      <TouchableOpacity
        onPress={onUpgrade}
        activeOpacity={0.8}
        style={styles.upgradeBtn}
      >
        <Text style={styles.upgradeBtnText}>{t('ai_chat.upgrade_cta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const CHAT_HISTORY_MAX = 50;

function chatStorageKey(userId: string): string {
  return `@spondy_chat_history_${userId}`;
}

export default function AIChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user } = useAuth();
  const { profile } = useProfile();
  const { flares } = useFlares();
  const { isSubscribed, isLoading: subLoading, purchase } = useSubscription();
  const { history: healthHistory } = useHealthHistory(28);

  // 28 days of logs for richer chat context (same window as weekly insight)
  const [logs, setLogs] = useState<import('@/types').DailyLog[]>([]);
  useEffect(() => {
    if (!user) return;
    getDailyLogs(user.id, 28).then(setLogs).catch(() => {});
  }, [user]);

  const scrollRef = useRef<ScrollView>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const initialGreeting: Message = {
    id: 'greeting',
    role: 'assistant',
    content: t('ai_chat.greeting'),
  };

  const [messages, setMessages] = useState<Message[]>([initialGreeting]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Load persisted history on mount
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(chatStorageKey(user.id))
      .then((raw) => {
        if (raw) {
          const stored: Message[] = JSON.parse(raw);
          if (stored.length > 0) {
            setMessages(stored);
          }
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [user]);

  // Save messages to AsyncStorage (capped at CHAT_HISTORY_MAX)
  const saveHistory = useCallback(async (msgs: Message[]) => {
    if (!user) return;
    const capped = msgs.slice(-CHAT_HISTORY_MAX);
    await AsyncStorage.setItem(chatStorageKey(user.id), JSON.stringify(capped)).catch(() => {});
  }, [user]);

  // Clear chat handler
  const handleClearChat = useCallback(() => {
    Alert.alert(
      'Clear conversation history?',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (user) {
              await AsyncStorage.removeItem(chatStorageKey(user.id)).catch(() => {});
            }
            setMessages([initialGreeting]);
          },
        },
      ]
    );
  }, [user, initialGreeting]);

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.surfaceDark : Colors.surface;
  const cardBorder = isDark ? Colors.borderDark : Colors.border;
  const textPrimary = isDark ? Colors.textPrimaryDark : Colors.textPrimary;
  const textSecondary = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.surfaceDark : Colors.surface;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setIsSending(true);
    await saveHistory(nextMessages);

    try {
      // Build conversation history for Claude (excluding greeting to keep it clean)
      const history = nextMessages
        .filter((m) => m.id !== 'greeting')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Always include the current user message
      const fullHistory = history.length === 0
        ? [{ role: 'user' as const, content: trimmed }]
        : history;

      const response = await sendChatMessage({
        messages: fullHistory,
        logs,
        flares,
        healthHistory,
        profile: profile ?? {
          user_id: user?.id ?? '',
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
        aiContext: profile?.ai_context ?? undefined,
      });

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
      };
      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        saveHistory(updated);
        return updated;
      });
    } catch (err) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('ai_chat.error'),
      };
      setMessages((prev) => {
        const updated = [...prev, errorMsg];
        saveHistory(updated);
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, messages, logs, flares, user, profile, healthHistory, saveHistory, t]);

  const canSend = inputText.trim().length > 0 && !isSending;

  if (subLoading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: bg, borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Text style={[styles.backText, { color: Colors.primary }]}>{'‹ Back'}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          {t('ai_chat.title')}
        </Text>
        <TouchableOpacity
          onPress={handleClearChat}
          activeOpacity={0.8}
          style={styles.backBtn}
        >
          <Text style={[styles.clearText, { color: textSecondary }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {!isSubscribed ? (
        <LockedState isDark={isDark} onUpgrade={purchase} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Messages list */}
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} isDark={isDark} />
            ))}
            {isSending && <TypingIndicator isDark={isDark} />}
          </ScrollView>

          {/* Input row */}
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: bg,
                borderTopColor: cardBorder,
              },
            ]}
          >
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: inputBg,
                  borderColor: cardBorder,
                  color: textPrimary,
                },
              ]}
              placeholder={t('ai_chat.placeholder')}
              placeholderTextColor={textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              editable={!isSending}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.8}
              style={[
                styles.sendBtn,
                { opacity: canSend ? 1 : 0.4 },
              ]}
            >
              <Text style={styles.sendBtnText}>{t('ai_chat.send')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    minWidth: 60,
  },
  backText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  clearText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  messagesList: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  assistantWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  userBubble: {
    borderTopRightRadius: 4,
  },
  assistantBubble: {
    borderTopLeftRadius: 4,
  },
  bubbleText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    minHeight: 40,
    maxHeight: 80,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  // Locked state
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  lockedTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  lockedBody: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  upgradeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
