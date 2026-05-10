import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import { Colors } from '@/constants/colors';

interface SpondyMarkProps {
  size?: number;
  bg?: string;
  fg?: string;
}

export function SpondyMark({
  size = 48,
  bg = Colors.primary,
  fg = '#FFFFFF',
}: SpondyMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Background circle */}
      <Circle cx={50} cy={50} r={48} fill={bg} />

      {/* Spine line */}
      <Line x1={50} y1={24} x2={50} y2={76} stroke={fg} strokeWidth={4} strokeLinecap="round" />

      {/* Top vertebra */}
      <Circle cx={50} cy={24} r={9} fill={fg} />
      <Line x1={41} y1={24} x2={28} y2={24} stroke={fg} strokeWidth={3} strokeLinecap="round" />
      <Line x1={59} y1={24} x2={72} y2={24} stroke={fg} strokeWidth={3} strokeLinecap="round" />

      {/* Middle vertebra */}
      <Circle cx={50} cy={50} r={10} fill={fg} />
      <Line x1={40} y1={50} x2={26} y2={50} stroke={fg} strokeWidth={3} strokeLinecap="round" />
      <Line x1={60} y1={50} x2={74} y2={50} stroke={fg} strokeWidth={3} strokeLinecap="round" />

      {/* Bottom vertebra */}
      <Circle cx={50} cy={76} r={9} fill={fg} />
      <Line x1={41} y1={76} x2={28} y2={76} stroke={fg} strokeWidth={3} strokeLinecap="round" />
      <Line x1={59} y1={76} x2={72} y2={76} stroke={fg} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
