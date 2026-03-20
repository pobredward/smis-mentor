import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 | SMIS Mentor',
  description: 'SMIS Mentor 개인정보처리방침',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-12 text-center">
            <div className="flex justify-center mb-4">
              <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">개인정보처리방침</h1>
            <p className="text-blue-100">최종 수정일: 2026년 3월 20일</p>
          </div>

          {/* Content */}
          <div className="px-8 py-10 space-y-8">
            {/* Section 1 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                1. 개인정보의 수집 및 이용 목적
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                (주)에스엠아이에스(이하 "회사")는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>회원 가입 및 관리: 회원 자격 유지·관리, 본인확인, 불만처리 등 민원처리</li>
                <li>서비스 제공: 멘토링 서비스 제공, 업무 관리, 알림 서비스 제공</li>
                <li>마케팅 및 광고: 신규 서비스 개발, 맞춤 서비스 제공, 이벤트 정보 제공</li>
              </ul>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                2. 수집하는 개인정보의 항목
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 아래와 같은 개인정보를 수집하고 있습니다.
              </p>
              
              <div className="space-y-4">
                <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">필수 수집 항목</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 이름, 이메일 주소, 전화번호, 역할(멘토/멘티)<br/>
                    • 소셜 로그인 시: 소셜 계정 고유 ID, 프로필 정보
                  </p>
                </div>

                <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">선택 수집 항목</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 프로필 사진, 자기소개, 관심 분야
                  </p>
                </div>

                <div className="bg-gray-50 border-l-4 border-gray-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">자동 수집 항목</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 서비스 이용 기록, 접속 로그, 쿠키, 접속 IP 정보, 기기 정보
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                3. 개인정보의 보유 및 이용기간
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>회원 탈퇴 시: 즉시 파기 (단, 관계 법령에 따라 보존할 필요가 있는 경우 일정 기간 보관 후 파기)</li>
                <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
                <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
                <li>표시·광고에 관한 기록: 6개월</li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                4. 개인정보의 제3자 제공
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 정보주체의 개인정보를 제1조(개인정보의 처리 목적)에서 명시한 범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.
              </p>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                <p className="text-gray-700 font-medium">
                  현재 회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                5. 개인정보의 파기 절차 및 방법
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.
              </p>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">파기 절차</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    이용자가 입력한 정보는 목적 달성 후 별도의 DB에 옮겨져(종이의 경우 별도의 서류) 내부 방침 및 기타 관련 법령에 따라 일정기간 저장된 후 혹은 즉시 파기됩니다.
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">파기 방법</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 전자적 파일 형태: 복원이 불가능한 방법으로 영구 삭제<br/>
                    • 종이 문서: 분쇄기로 분쇄하거나 소각
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                6. 정보주체의 권리·의무 및 행사방법
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                정보주체는 회사에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4 mb-4">
                <li>개인정보 열람 요구</li>
                <li>오류 등이 있을 경우 정정 요구</li>
                <li>삭제 요구</li>
                <li>처리정지 요구</li>
              </ul>
              <p className="text-gray-700 leading-relaxed">
                권리 행사는 회사에 대해 서면, 전화, 전자우편 등을 통하여 하실 수 있으며 회사는 이에 대해 지체없이 조치하겠습니다.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                7. 개인정보의 안전성 확보 조치
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>관리적 조치: 내부관리계획 수립·시행, 정기적 직원 교육 등</li>
                <li>기술적 조치: 개인정보처리시스템 등의 접근권한 관리, 접근통제시스템 설치, 고유식별정보 등의 암호화, 보안프로그램 설치</li>
                <li>물리적 조치: 전산실, 자료보관실 등의 접근통제</li>
              </ul>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                8. 개인정보 보호책임자
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-3">개인정보 보호책임자</h3>
                <div className="space-y-2 text-gray-700">
                  <p>담당자: 신선웅</p>
                  <p>이메일: pobredward@gmail.com</p>
                  <p>전화번호: 010-7656-7933</p>
                </div>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                9. 개인정보 처리방침 변경
              </h2>
              <p className="text-gray-700 leading-relaxed">
                이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
              </p>
            </section>

            {/* Contact Box */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6 mt-8">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-gray-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">문의사항</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    개인정보 처리에 관한 문의사항이 있으시면<br/>
                    pobredward@gmail.com 으로 연락주시기 바랍니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
