import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function TermsOfServiceScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="document-text" size={48} color="#3b82f6" />
        <Text style={styles.title}>서비스 이용약관</Text>
        <Text style={styles.lastUpdated}>최종 수정일: 2026년 3월 20일</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제1조 (목적)</Text>
          <Text style={styles.paragraph}>
            본 약관은 (주)에스엠아이에스(이하 "회사")가 제공하는 멘토링 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제2조 (정의)</Text>
          <Text style={styles.paragraph}>
            본 약관에서 사용하는 용어의 정의는 다음과 같습니다.
          </Text>
          <View style={styles.definitionList}>
            <View style={styles.definitionItem}>
              <Text style={styles.definitionTerm}>1. "서비스"</Text>
              <Text style={styles.definitionDesc}>
                회사가 제공하는 모든 온라인 멘토링 서비스 및 관련 부가서비스를 의미합니다.
              </Text>
            </View>
            <View style={styles.definitionItem}>
              <Text style={styles.definitionTerm}>2. "이용자"</Text>
              <Text style={styles.definitionDesc}>
                본 약관에 따라 회사가 제공하는 서비스를 받는 회원 및 비회원을 말합니다.
              </Text>
            </View>
            <View style={styles.definitionItem}>
              <Text style={styles.definitionTerm}>3. "회원"</Text>
              <Text style={styles.definitionDesc}>
                회사와 서비스 이용계약을 체결하고 회원 아이디(ID)를 부여받은 이용자를 말합니다.
              </Text>
            </View>
            <View style={styles.definitionItem}>
              <Text style={styles.definitionTerm}>4. "멘토"</Text>
              <Text style={styles.definitionDesc}>
                특정 분야의 지식과 경험을 바탕으로 멘티에게 조언과 지도를 제공하는 회원을 말합니다.
              </Text>
            </View>
            <View style={styles.definitionItem}>
              <Text style={styles.definitionTerm}>5. "멘티"</Text>
              <Text style={styles.definitionDesc}>
                멘토로부터 조언과 지도를 받는 회원을 말합니다.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제3조 (약관의 효력 및 변경)</Text>
          <Text style={styles.paragraph}>
            ① 본 약관은 서비스를 이용하고자 하는 모든 이용자에게 그 효력이 발생합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 회사는 필요한 경우 관련 법령을 위배하지 않는 범위 내에서 본 약관을 변경할 수 있으며, 약관이 변경되는 경우 변경 사항을 시행일자 7일 전부터 서비스 내 공지사항을 통해 공지합니다.
          </Text>
          <Text style={styles.paragraph}>
            ③ 회원이 변경된 약관에 동의하지 않는 경우, 회원은 서비스 이용을 중단하고 이용계약을 해지할 수 있습니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제4조 (회원가입)</Text>
          <Text style={styles.paragraph}>
            ① 이용자는 회사가 정한 가입 양식에 따라 회원정보를 기입한 후 본 약관에 동의한다는 의사표시를 함으로써 회원가입을 신청합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 회사는 제1항과 같이 회원으로 가입할 것을 신청한 이용자 중 다음 각 호에 해당하지 않는 한 회원으로 등록합니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 가입신청자가 본 약관에 의하여 이전에 회원자격을 상실한 적이 있는 경우</Text>
            <Text style={styles.bulletItem}>• 실명이 아니거나 타인의 명의를 이용한 경우</Text>
            <Text style={styles.bulletItem}>• 허위의 정보를 기재하거나, 회사가 제시하는 내용을 기재하지 않은 경우</Text>
            <Text style={styles.bulletItem}>• 만 14세 미만 아동이 법정대리인의 동의를 얻지 않은 경우</Text>
          </View>
          <Text style={styles.paragraph}>
            ③ 회원가입계약의 성립 시기는 회사의 승낙이 회원에게 도달한 시점으로 합니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제5조 (서비스의 제공 및 변경)</Text>
          <Text style={styles.paragraph}>
            ① 회사는 회원에게 아래와 같은 서비스를 제공합니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 멘토-멘티 매칭 서비스</Text>
            <Text style={styles.bulletItem}>• 멘토링 일정 관리 서비스</Text>
            <Text style={styles.bulletItem}>• 업무 관리 및 알림 서비스</Text>
            <Text style={styles.bulletItem}>• 커뮤니티 및 정보 공유 서비스</Text>
            <Text style={styles.bulletItem}>• 기타 회사가 추가 개발하거나 다른 회사와의 제휴 계약 등을 통해 회원에게 제공하는 일체의 서비스</Text>
          </View>
          <Text style={styles.paragraph}>
            ② 회사는 상당한 이유가 있는 경우에 운영상, 기술상의 필요에 따라 제공하고 있는 전부 또는 일부 서비스를 변경할 수 있습니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제6조 (서비스의 중단)</Text>
          <Text style={styles.paragraph}>
            ① 회사는 컴퓨터 등 정보통신설비의 보수점검, 교체 및 고장, 통신의 두절 등의 사유가 발생한 경우에는 서비스의 제공을 일시적으로 중단할 수 있습니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 회사는 제1항의 사유로 서비스의 제공이 일시적으로 중단됨으로 인하여 이용자 또는 제3자가 입은 손해에 대하여 배상합니다. 단, 회사가 고의 또는 과실이 없음을 입증하는 경우에는 그러하지 아니합니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제7조 (회원의 의무)</Text>
          <Text style={styles.paragraph}>
            ① 회원은 다음 행위를 하여서는 안 됩니다.
          </Text>
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={20} color="#dc2626" />
            <View style={styles.warningContent}>
              <Text style={styles.warningText}>• 신청 또는 변경 시 허위 내용의 등록</Text>
              <Text style={styles.warningText}>• 타인의 정보 도용</Text>
              <Text style={styles.warningText}>• 회사가 게시한 정보의 변경</Text>
              <Text style={styles.warningText}>• 회사가 정한 정보 이외의 정보(컴퓨터 프로그램 등) 등의 송신 또는 게시</Text>
              <Text style={styles.warningText}>• 회사 및 기타 제3자의 저작권 등 지적재산권에 대한 침해</Text>
              <Text style={styles.warningText}>• 회사 및 기타 제3자의 명예를 손상시키거나 업무를 방해하는 행위</Text>
              <Text style={styles.warningText}>• 외설 또는 폭력적인 메시지, 화상, 음성, 기타 공서양속에 반하는 정보를 서비스에 공개 또는 게시하는 행위</Text>
            </View>
          </View>
          <Text style={styles.paragraph}>
            ② 회원은 관계법, 본 약관의 규정, 이용안내 및 서비스와 관련하여 공지한 주의사항, 회사가 통지하는 사항 등을 준수하여야 하며, 기타 회사의 업무에 방해되는 행위를 하여서는 안 됩니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제8조 (회원 탈퇴 및 자격 상실)</Text>
          <Text style={styles.paragraph}>
            ① 회원은 회사에 언제든지 탈퇴를 요청할 수 있으며 회사는 즉시 회원탈퇴를 처리합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 회원이 다음 각 호의 사유에 해당하는 경우, 회사는 회원자격을 제한 및 정지시킬 수 있습니다.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• 가입 신청 시에 허위 내용을 등록한 경우</Text>
            <Text style={styles.bulletItem}>• 다른 사람의 서비스 이용을 방해하거나 그 정보를 도용하는 등 전자상거래 질서를 위협하는 경우</Text>
            <Text style={styles.bulletItem}>• 서비스를 이용하여 법령 또는 본 약관이 금지하거나 공서양속에 반하는 행위를 하는 경우</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제9조 (개인정보보호)</Text>
          <Text style={styles.paragraph}>
            ① 회사는 이용자의 개인정보 수집 시 서비스 제공을 위하여 필요한 범위에서 최소한의 개인정보를 수집합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 회사는 회원가입 시 구매계약 이행에 필요한 정보를 미리 수집하지 않습니다. 다만, 관련 법령상 의무이행을 위하여 구매계약 이전에 본인확인이 필요한 경우로서 최소한의 특정 개인정보를 수집하는 경우에는 그러하지 아니합니다.
          </Text>
          <Text style={styles.paragraph}>
            ③ 회사는 이용자의 개인정보를 수집·이용하는 때에는 당해 이용자에게 그 목적을 고지하고 동의를 받습니다.
          </Text>
          <Text style={styles.paragraph}>
            ④ 개인정보 보호에 관한 더 자세한 사항은 개인정보처리방침을 참고하시기 바랍니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제10조 (저작권의 귀속 및 이용제한)</Text>
          <Text style={styles.paragraph}>
            ① 회사가 작성한 저작물에 대한 저작권 기타 지적재산권은 회사에 귀속합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 이용자는 서비스를 이용함으로써 얻은 정보 중 회사에게 지적재산권이 귀속된 정보를 회사의 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리목적으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제11조 (분쟁해결)</Text>
          <Text style={styles.paragraph}>
            ① 회사는 이용자가 제기하는 정당한 의견이나 불만을 반영하고 그 피해를 보상처리하기 위하여 피해보상처리기구를 설치·운영합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 회사는 이용자로부터 제출되는 불만사항 및 의견은 우선적으로 그 사항을 처리합니다. 다만, 신속한 처리가 곤란한 경우에는 이용자에게 그 사유와 처리일정을 즉시 통보해 드립니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>제12조 (재판권 및 준거법)</Text>
          <Text style={styles.paragraph}>
            ① 회사와 이용자 간에 발생한 서비스 이용에 관한 분쟁에 대하여는 대한민국 법을 적용합니다.
          </Text>
          <Text style={styles.paragraph}>
            ② 서비스 이용으로 발생한 분쟁에 관한 소송은 민사소송법상의 관할법원에 제기합니다.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerBox}>
            <Ionicons name="information-circle-outline" size={20} color="#6b7280" />
            <View style={styles.footerContent}>
              <Text style={styles.footerTitle}>부칙</Text>
              <Text style={styles.footerText}>
                본 약관은 2026년 3월 20일부터 적용됩니다.
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
  definitionList: {
    gap: 12,
  },
  definitionItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  definitionTerm: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  definitionDesc: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  bulletList: {
    gap: 8,
    marginBottom: 12,
  },
  bulletItem: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    paddingLeft: 8,
  },
  warningBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
    flexDirection: 'row',
    gap: 12,
  },
  warningContent: {
    flex: 1,
    gap: 6,
  },
  warningText: {
    fontSize: 13,
    color: '#7f1d1d',
    lineHeight: 18,
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
