import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';
import { logEvent, Events } from '@/services/analytics';

export function UpdateBanner() {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [isApplying, setIsApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Not available in dev builds or already dismissed
  if (__DEV__ || dismissed || (!isUpdateAvailable && !isUpdatePending)) return null;

  async function handleUpdate() {
    setIsApplying(true);
    try {
      if (isUpdateAvailable && !isUpdatePending) {
        await Updates.fetchUpdateAsync();
      }
      await logEvent(Events.OTA_UPDATE_APPLIED);
      await Updates.reloadAsync();
    } catch {
      setIsApplying(false);
    }
  }

  return (
    <View style={styles.banner}>
      <View style={styles.left}>
        <Text style={styles.title}>Update available</Text>
        <Text style={styles.subtitle}>Tap to get the latest version</Text>
      </View>
      <View style={styles.right}>
        <TouchableOpacity onPress={handleUpdate} disabled={isApplying} style={styles.updateBtn} activeOpacity={0.8}>
          {isApplying ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.updateText}>Update</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDismissed(true)} style={styles.dismissBtn} activeOpacity={0.7}>
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  left: { flex: 1 },
  title: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  subtitle: {
    color: '#FFFFFF',
    opacity: 0.85,
    fontSize: FontSize.xs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  updateBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    minWidth: 70,
    alignItems: 'center',
  },
  updateText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    color: '#FFFFFF',
    fontSize: 16,
    opacity: 0.7,
  },
});
