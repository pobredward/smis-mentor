/**
 * 말풍선 글 — 줄바꿈 그대로, http(s) 주소는 눌러서 연다
 */
import React, { useMemo } from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { logger } from '@smis-mentor/shared';

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;
/** 주소 끝에 붙은 문장 부호는 주소에서 뺀다 */
const TRAILING_RE = /[.,!?;:)\]}'"…。、]+$/;

type Part = { text: string; url?: string };

function splitLinks(text: string): Part[] {
  const parts: Part[] = [];
  const re = new RegExp(URL_RE.source, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    let url = m[0];
    const trail = TRAILING_RE.exec(url)?.[0] ?? '';
    if (trail) url = url.slice(0, url.length - trail.length);
    if (!url) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

interface LinkedTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onLongPress?: () => void;
}

export function LinkedText({ text, style, linkStyle, onLongPress }: LinkedTextProps) {
  const parts = useMemo(() => splitLinks(text), [text]);
  return (
    <Text style={style} onLongPress={onLongPress} suppressHighlighting>
      {parts.map((p, i) =>
        p.url ? (
          <Text
            key={i}
            style={linkStyle}
            onPress={() => {
              Linking.openURL(p.url!).catch((e) => logger.warn('링크 열기 실패:', e));
            }}
            onLongPress={onLongPress}
          >
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}
