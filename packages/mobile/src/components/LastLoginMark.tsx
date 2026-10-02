import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { L } from '@smis-mentor/shared';

interface LastLoginMarkProps {
  /** 이 버튼이 이 기기에서 마지막으로 성공한 로그인 방법인가 */
  active: boolean;
  /** 버튼 아래 작은 안내 (가린 이메일 ab***@gmail.com) */
  caption?: string;
  children: React.ReactNode;
}

/**
 * 로그인 버튼에 '최근 로그인' 꼬리표를 붙이는 감싸개.
 * - active 가 바뀌어도 같은 View 로 감싸 둬서 버튼이 다시 마운트되지 않는다.
 * - 꼬리표는 버튼 오른쪽 위 테두리에 걸치고, 터치는 그대로 버튼으로 넘긴다.
 * - 스크린리더 안내는 버튼의 accessibilityHint 로 주고 꼬리표 자체는 읽지 않는다.
 */
export function LastLoginMark({ active, caption, children }: LastLoginMarkProps) {
  return (
    <View>
      {children}
      {active && (
        <View
          pointerEvents="none"
          style={styles.badge}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.badgeText}>{L('profile.lastUsedLogin')}</Text>
        </View>
      )}
      {active && caption ? (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** 최근 로그인 버튼의 스크린리더 안내 */
export const lastLoginA11yHint = (active: boolean): string | undefined =>
  active ? L('profile.lastUsedLoginA11y') : undefined;

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 0,
    right: 12,
    height: 18,
    paddingHorizontal: 8,
    borderRadius: 9,
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    zIndex: 1,
    // 소셜 버튼(elevation 2) 위에 그려지도록 (Android)
    elevation: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  caption: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 4,
  },
});
