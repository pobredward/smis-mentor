import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { toDriveImageUrl, type STSheetStudent } from '@smis-mentor/shared';

/** 명단 탭(반·호수·입퇴소)과 숙소 방 시트가 같이 쓰는 학생 카드 속 — 사진·이름·반·방 */
interface StudentCardContentProps {
  item: STSheetStudent;
  isForeign?: boolean;
  filterType?: 'class' | 'room' | 'departure' | 'arrival';
  /** 맨 아래 초록 한 줄 (숙소 시트: 그룹·공항조) */
  extraLine?: string | null;
}

export const StudentCardContent = React.memo(({ item, isForeign, filterType, extraLine }: StudentCardContentProps) => {
  const photoUrl = toDriveImageUrl(item.profilePhoto);

  // "홍길동 (G2M)" 형식: grade에서 숫자만 + 성별 (예: "G2" + "M")
  const gradeNum = item.grade?.replace(/[^0-9]/g, '') ?? '';
  const gradePrefix = item.grade?.replace(/[0-9].*/g, '') ?? 'G';
  const gradeBadge = gradeNum ? `${gradePrefix}${gradeNum}${item.gender === 'M' ? 'M' : 'F'}` : '';

  // 반번호 | 고유번호
  const classNumberLine = [item.classNumber, item.studentId].filter(Boolean).join(' | ') || null;

  // 반 담당자: `반:classMentor(className반)` 형식
  const classPrefix = isForeign ? 'Class' : '반';
  const classLine = item.classMentor
    ? `${classPrefix}:${item.classMentor}${item.className ? `(${item.className}반)` : ''}`
    : null;

  // 방/호수: `방:unitMentor(roomNumber호)` 형식
  const unitPrefix = isForeign ? 'Room' : '방';
  const unitMentorName = item.unitMentor || item.unit;
  const unitLine = unitMentorName
    ? `${unitPrefix}:${unitMentorName}${item.roomNumber ? `(${item.roomNumber}호)` : ''}`
    : item.roomNumber
    ? `${unitPrefix}:(${item.roomNumber}호)`
    : null;

  // 입소/퇴소 조 정보
  const extItem = item as STSheetStudent & {
    departureGroup?: string;
    departureInstructor?: string;
    arrivalGroup?: string;
    arrivalInstructor?: string;
  };
  const rosterLine = filterType === 'departure'
    ? (extItem.departureGroup
        ? `${extItem.departureGroup}${extItem.departureInstructor ? ` (${extItem.departureInstructor})` : ''}`
        : null)
    : filterType === 'arrival'
    ? (extItem.arrivalGroup
        ? `${extItem.arrivalGroup}${extItem.arrivalInstructor ? ` (${extItem.arrivalInstructor})` : ''}`
        : null)
    : null;

  return (
    <View style={cardStyles.wrapper}>
      {/* 프로필 사진 */}
      {photoUrl ? (
        <Image
          source={photoUrl}
          style={cardStyles.photo}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[cardStyles.photo, cardStyles.photoPlaceholder]}>
          <Ionicons
            name="person"
            size={32}
            color={item.gender === 'M' ? '#93c5fd' : '#fcd34d'}
          />
        </View>
      )}

      {/* 이름 + 배지 */}
      <Text
        style={[cardStyles.name, item.gender === 'M' ? cardStyles.nameBlue : cardStyles.nameYellow]}
        numberOfLines={1}
      >
        {item.name}{gradeBadge ? ` (${gradeBadge})` : ''}
      </Text>

      {/* 반번호 | 고유번호 */}
      {classNumberLine ? (
        <Text style={cardStyles.sub} numberOfLines={1}>
          {classNumberLine}
        </Text>
      ) : null}

      {/* 영어 이름 */}
      {item.englishName ? (
        <Text style={cardStyles.sub} numberOfLines={1}>{item.englishName}</Text>
      ) : null}

      {/* 반 담당자 */}
      {classLine ? (
        <Text style={cardStyles.subSmall} numberOfLines={1}>{classLine}</Text>
      ) : null}

      {/* 방 + 호수 */}
      {unitLine ? (
        <Text style={cardStyles.subSmall} numberOfLines={1}>{unitLine}</Text>
      ) : null}

      {/* 입소/퇴소 조 정보 */}
      {rosterLine ? (
        <Text style={[cardStyles.subSmall, cardStyles.rosterText]} numberOfLines={1}>{rosterLine}</Text>
      ) : null}

      {extraLine ? (
        <Text style={[cardStyles.subSmall, cardStyles.rosterText]} numberOfLines={1}>{extraLine}</Text>
      ) : null}
    </View>
  );
});

const cardStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingBottom: 6,
    gap: 2,
  },
  // 사진은 카드 폭 끝까지 — 위 모서리는 카드(overflow hidden)가 둥글게 잘라 준다
  photo: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: 4,
  },
  photoPlaceholder: {
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 11,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  nameBlue: {
    color: '#3b82f6',
  },
  nameYellow: {
    color: '#d97706',
  },
  sub: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
  },
  subSmall: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
  },
  rosterText: {
    color: '#16a34a',
    fontWeight: '600' as const,
  },
});
