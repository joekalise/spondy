import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, Spacing, BorderRadius } from '@/constants/theme';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 10;
const TOUCH_AREA = 52;

function sliderColor(value: number, max: number): string {
  const pct = value / max;
  if (pct <= 0.3) return Colors.success;
  if (pct <= 0.6) return Colors.warning;
  return Colors.error;
}

interface DragSliderProps {
  value: number;
  onChange: (n: number) => void;
  isDark: boolean;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  showValue?: boolean;
}

export function DragSlider({
  value,
  onChange,
  isDark,
  min = 0,
  max = 10,
  minLabel,
  maxLabel,
  showValue = true,
}: DragSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const startXRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const color = sliderColor(value, max);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        startXRef.current = x;
        const pct = Math.max(0, Math.min(1, x / trackWidthRef.current));
        onChangeRef.current(Math.round(pct * (max - min) + min));
      },
      onPanResponderMove: (_, gestureState) => {
        const x = startXRef.current + gestureState.dx;
        const pct = Math.max(0, Math.min(1, x / trackWidthRef.current));
        onChangeRef.current(Math.round(pct * (max - min) + min));
      },
    })
  ).current;

  const fillPct = ((value - min) / (max - min)) * 100;
  const thumbLeft = trackWidth > 0
    ? Math.max(0, Math.min(trackWidth - THUMB_SIZE, ((value - min) / (max - min)) * trackWidth - THUMB_SIZE / 2))
    : 0;

  return (
    <View style={styles.wrapper}>
      {showValue && (
        <View style={styles.valueRow}>
          <Text style={[styles.number, { color }]}>{value}</Text>
          <Text style={[styles.denom, isDark && { color: Colors.textSecondaryDark }]}>/{max}</Text>
        </View>
      )}
      <View
        style={styles.touchArea}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWidthRef.current = w;
          setTrackWidth(w);
        }}
        {...panResponder.panHandlers}
      >
        <View style={[styles.trackBar, isDark && styles.trackBarDark]}>
          <View style={[styles.trackFill, { width: `${fillPct}%`, backgroundColor: color }]} />
        </View>
        {trackWidth > 0 && (
          <View style={[styles.thumb, { left: thumbLeft, backgroundColor: color }]} />
        )}
      </View>
      {(minLabel || maxLabel) && (
        <View style={styles.hintRow}>
          {minLabel ? <Text style={[styles.hint, isDark && { color: Colors.textSecondaryDark }]}>{minLabel}</Text> : <View />}
          {maxLabel ? <Text style={[styles.hint, isDark && { color: Colors.textSecondaryDark }]}>{maxLabel}</Text> : <View />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.xs },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  number: { fontSize: 48, fontWeight: '900', lineHeight: 54 },
  denom: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    paddingBottom: 6,
    marginLeft: 2,
  },
  touchArea: {
    height: TOUCH_AREA,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBar: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: Colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  trackBarDark: { backgroundColor: Colors.borderDark },
  trackFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (TOUCH_AREA - THUMB_SIZE) / 2,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
});
