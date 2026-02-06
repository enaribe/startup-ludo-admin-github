/**
 * Design System Tokens - Mirrored from mobile app
 * Source: startup-ludo/src/styles/{colors,typography,spacing}.ts
 */

export const COLORS = {
  // Primary colors
  primary: '#FFBC40',
  primaryLight: '#FFD580',
  primaryDark: '#CC9633',

  // Background
  background: '#0C243E',
  backgroundLight: '#194F8A',

  // Text
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textMuted: 'rgba(255, 255, 255, 0.5)',

  // Card
  card: 'rgba(0, 0, 0, 0.3)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',

  // Player colors
  players: {
    yellow: '#FFBC40',
    blue: '#1F91D0',
    green: '#4CAF50',
    red: '#F35145',
  },

  // Event colors
  events: {
    quiz: '#4A90E2',
    funding: '#50C878',
    duel: '#FF6B6B',
    opportunity: '#FFB347',
    challenge: '#9B59B6',
    safe: '#95A5A6',
    start: '#2ECC71',
    finish: '#E74C3C',
  },

  // Status colors
  success: '#4CAF50',
  successLight: 'rgba(76, 175, 80, 0.2)',
  error: '#F44336',
  errorLight: 'rgba(244, 67, 54, 0.2)',
  warning: '#FF9800',
  warningLight: 'rgba(255, 152, 0, 0.2)',
  info: '#2196F3',
  infoLight: 'rgba(33, 150, 243, 0.2)',

  // Surface
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceVariant: 'rgba(255, 255, 255, 0.1)',

  // UI
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',

  // Border
  border: 'rgba(255, 255, 255, 0.2)',
  borderLight: 'rgba(255, 255, 255, 0.1)',

  // Disabled
  disabled: 'rgba(255, 255, 255, 0.3)',
  disabledBackground: 'rgba(0, 0, 0, 0.2)',
} as const;

export const SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const BORDER_RADIUS = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const;
