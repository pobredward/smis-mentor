/**
 * 말풍선 글 — 줄바꿈 그대로, http(s) 주소는 눌러서 연다.
 * 대화 내용 검색 중이면 검색어 자리를 노란색으로 (주소 부분은 그대로)
 */
import React, { useMemo } from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { logger, splitByQuery } from '@smis-mentor/shared';

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
  /** 강조할 검색어 (없으면 강조 없음) */
  highlight?: string;
  highlightStyle?: StyleProp<TextStyle>;
}

export function LinkedText({ text, style, linkStyle, onLongPress, highlight, highlightStyle }: LinkedTextProps) {
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
        ) : highlight ? (
          <Text key={i}>
            {splitByQuery(p.text, highlight).map((h, j) => (
              <Text key={j} style={h.hit ? highlightStyle : undefined}>{h.text}</Text>
            ))}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        ),
      )}
    </Text>
  );
}
