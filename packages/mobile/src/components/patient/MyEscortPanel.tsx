import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { PatientRecord } from '@smis-mentor/shared';
import { myActiveEscortVisit, L, dataLabel } from '@smis-mentor/shared';
import { EscortSsn } from './EscortSsn';

/** 환자 탭 상단 — 내가 인솔할 학생 (병원 접수용 정보, 주민번호 자동 표시) */
export function MyEscortPanel({ records, myName, onOpen }: { records: PatientRecord[]; myName?: string | null; onOpen: (id: string) => void }) {
  const mine = records
    .map((r) => ({ r, v: myActiveEscortVisit(r.hospitalVisits, myName) }))
    .filter((x) => !!x.v) as Array<{ r: PatientRecord; v: NonNullable<ReturnType<typeof myActiveEscortVisit>> & Record<string, any> }>;
  if (mine.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 4, borderRadius: 12, borderWidth: 2, borderColor: '#fdba74', backgroundColor: '#fff7ed', padding: 10, gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: '#9a3412' }}>{L('patient.studentsIMEscorting')} {mine.length}{L('patient.infoForHospitalCheckIn')}</Text>
      {mine.map(({ r, v }) => (
        <TouchableOpacity key={r.id} activeOpacity={0.8} onPress={() => onOpen(r.id)}
          style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#fed7aa', padding: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>
              {r.studentName}
              <Text style={{ fontSize: 11, fontWeight: '400', color: '#6b7280' }}>  {[r.grade, r.className, r.roomNumber && L('patient.roomN', { v0: r.roomNumber })].filter(Boolean).join(' · ')}</Text>
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: v.hospitalStatus === '내원예정' ? '#f97316' : '#22c55e', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' }}>{dataLabel(v.hospitalStatus)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('common.idNumber')}</Text>
            <EscortSsn recordId={r.id} auto />
          </View>
          {!!v.hospitalName && <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.hospital')} {v.hospitalName}</Text>}
          {(!!v.departureTime || !!v.transportSlot) && <Text style={{ fontSize: 11, color: '#374151' }}>{[v.departureTime && L('patient.departAtN', { v0: v.departureTime }), v.transportSlot && dataLabel(v.transportSlot)].filter(Boolean).join(' · ')}</Text>}
          {!!r.symptom && <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.symptoms')} {r.symptom}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}
