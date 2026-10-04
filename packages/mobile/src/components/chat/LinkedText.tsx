/**
 * 말풍선 글 — 줄바꿈 그대로, http(s) 주소는 눌러서 연다, @멘션은 굵게(나를 부른 멘션은 더 진하게).
 * 대화 내용 검색 중이면 검색어 자리를 노란색으로 (주소 부분은 그대로)
 */
import React, { useMemo } from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { logger, mentionParts, splitByQuery, type ChatRoom } from '@smis-mentor/shared';

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;
/** 주소 끝에 붙은 문장 부호는 주소에서 뺀다 */
const TRAILING_RE = /[.,!?;:)\]}'"…。、]+$/;

type Part = { text: string; url?: string; mention?: string };

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
  /** @멘션 강조 — 방 사람 이름으로 찾는다 */
  mentionRoom?: Pick<ChatRoom, 'memberInfo'> | null;
  myUid?: string;
  mentionStyle?: StyleProp<TextStyle>;
  /** 나를 부른 멘션 (@나 · @모두) */
  mentionMeStyle?: StyleProp<TextStyle>;
}

export function LinkedText({
  text,
  style,
  linkStyle,
  onLongPress,
  highlight,
  highlightStyle,
  mentionRoom,
  myUid,
  mentionStyle,
  mentionMeStyle,
}: LinkedTextProps) {
  const parts = useMemo<Part[]>(() => {
    const byMention = mentionRoom ? mentionParts(text, mentionRoom) : [{ text }];
    return byMention.flatMap((p) => (p.mention ? [{ text: p.text, mention: p.mention }] : splitLinks(p.text)));
  }, [text, mentionRoom]);

  const plain = (t: string, key: React.Key) =>
    highlight ? (
      <Text key={key}>
        {splitByQuery(t, highlight).map((h, j) => (
          <Text key={j} style={h.hit ? highlightStyle : undefined}>{h.text}</Text>
        ))}
      </Text>
    ) : (
      <Text key={key}>{t}</Text>
    );

  return (
    <Text style={style} onLongPress={onLongPress} suppressHighlighting>
      {parts.map((p, i) => {
        if (p.mention) {
          const me = p.mention === 'all' || (!!myUid && p.mention === myUid);
          return (
            <Text key={i} style={me ? mentionMeStyle : mentionStyle}>
              {p.text}
            </Text>
          );
        }
        if (p.url) {
          return (
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
          );
        }
        return plain(p.text, i);
      })}
    </Text>
  );
}
