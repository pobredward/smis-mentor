import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={48} color="#3b82f6" />
        <Text style={styles.title}>개인정보처리방침</Text>
        <Text style={styles.lastUpdated}>최종 수정일: 2026년 3월 20일</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. 개인정보의 수집 및 이용 목적</Text>
          <Text style={styles.paragraph}>
            (주)에스엠아이에스(이하 "회사")는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 회원 가입 및 관리: 회원 자격 유지·관리, 본인확인, 불만처리 등 민원처리</Text>
            <Text style={styles.bulletItem}>• 서비스 제공: 멘토링 서비스 제공, 업무 관리, 알림 서비스 제공</Text>
            <Text style={styles.bulletItem}>• 마케팅 및 광고: 신규 서비스 개발, 맞춤 서비스 제공, 이벤트 정보 제공</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. 수집하는 개인정보의 항목</Text>
          <Text style={styles.paragraph}>
            회사는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 아래와 같은 개인정보를 수집하고 있습니다.
          </Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>필수 수집 항목</Text>
            <Text style={styles.infoBoxContent}>
              • 이름, 이메일 주소, 전화번호, 역할(멘토/멘티)
              {'\n'}• 소셜 로그인 시: 소셜 계정 고유 ID, 프로필 정보
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>선택 수집 항목</Text>
            <Text style={styles.infoBoxContent}>
              • 프로필 사진, 자기소개, 관심 분야
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>자동 수집 항목</Text>
            <Text style={styles.infoBoxContent}>
              • 서비스 이용 기록, 접속 로그, 쿠키, 접속 IP 정보, 기기 정보
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. 개인정보의 보유 및 이용기간</Text>
          <Text style={styles.paragraph}>
            회사는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 회원 탈퇴 시: 즉시 파기 (단, 관계 법령에 따라 보존할 필요가 있는 경우 일정 기간 보관 후 파기)</Text>
            <Text style={styles.bulletItem}>• 계약 또는 청약철회 등에 관한 기록: 5년</Text>
            <Text style={styles.bulletItem}>• 대금결제 및 재화 등의 공급에 관한 기록: 5년</Text>
            <Text style={styles.bulletItem}>• 소비자의 불만 또는 분쟁처리에 관한 기록: 3년</Text>
            <Text style={styles.bulletItem}>• 표시·광고에 관한 기록: 6개월</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. 개인정보의 제3자 제공</Text>
          <Text style={styles.paragraph}>
            회사는 정보주체의 개인정보를 제1조(개인정보의 처리 목적)에서 명시한 범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.
          </Text>
          <Text style={styles.paragraph}>
            현재 회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. 개인정보의 파기 절차 및 방법</Text>
          <Text style={styles.paragraph}>
            회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.
          </Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>파기 절차</Text>
            <Text style={styles.infoBoxContent}>
              이용자가 입력한 정보는 목적 달성 후 별도의 DB에 옮겨져(종이의 경우 별도의 서류) 내부 방침 및 기타 관련 법령에 따라 일정기간 저장된 후 혹은 즉시 파기됩니다.
            </Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoBoxTitle}>파기 방법</Text>
            <Text style={styles.infoBoxContent}>
              • 전자적 파일 형태: 복원이 불가능한 방법으로 영구 삭제
              {'\n'}• 종이 문서: 분쇄기로 분쇄하거나 소각
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. 정보주체의 권리·의무 및 행사방법</Text>
          <Text style={styles.paragraph}>
            정보주체는 회사에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 개인정보 열람 요구</Text>
            <Text style={styles.bulletItem}>• 오류 등이 있을 경우 정정 요구</Text>
            <Text style={styles.bulletItem}>• 삭제 요구</Text>
            <Text style={styles.bulletItem}>• 처리정지 요구</Text>
          </View>
          <Text style={styles.paragraph}>
            권리 행사는 회사에 대해 서면, 전화, 전자우편 등을 통하여 하실 수 있으며 회사는 이에 대해 지체없이 조치하겠습니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. 개인정보의 안전성 확보 조치</Text>
          <Text style={styles.paragraph}>
            회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 관리적 조치: 내부관리계획 수립·시행, 정기적 직원 교육 등</Text>
            <Text style={styles.bulletItem}>• 기술적 조치: 개인정보처리시스템 등의 접근권한 관리, 접근통제시스템 설치, 고유식별정보 등의 암호화, 보안프로그램 설치</Text>
            <Text style={styles.bulletItem}>• 물리적 조치: 전산실, 자료보관실 등의 접근통제</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. 개인정보 보호책임자</Text>
          <Text style={styles.paragraph}>
            회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
          </Text>
          <View style={styles.contactBox}>
            <Text style={styles.contactTitle}>개인정보 보호책임자</Text>
            <Text style={styles.contactContent}>
              담당자: 신선웅{'\n'}
              이메일: pobredward@gmail.com{'\n'}
              전화번호: 010-7656-7933
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. 개인정보 처리방침 변경</Text>
          <Text style={styles.paragraph}>
            이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerBox}>
            <Ionicons name="mail-outline" size={20} color="#6b7280" />
            <View style={styles.footerContent}>
              <Text style={styles.footerTitle}>문의사항</Text>
              <Text style={styles.footerText}>
                개인정보 처리에 관한 문의사항이 있으시면{'\n'}
                pobredward@gmail.com 으로 연락주시기 바랍니다.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
  },
  lastUpdated: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    lineHeight: 24,
  },
  paragraph: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletList: {
    gap: 8,
  },
  bulletItem: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    paddingLeft: 8,
  },
  infoBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  infoBoxContent: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  contactBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  contactContent: {
    fontSize: 14,
    color: '#1e3a8a',
    lineHeight: 22,
  },
  footer: {
    marginTop: 16,
    marginBottom: 32,
  },
  footerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  footerContent: {
    flex: 1,
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  footerText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },
});
