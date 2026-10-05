import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 | SMIS CAMP',
  description: 'SMIS CAMP 개인정보처리방침',
};

/** 개정 시 두 값만 바꾼다. 시행일은 공지일로부터 7일 이후 (제12조) */
const LAST_UPDATED = '2026년 10월 4일';
const EFFECTIVE_DATE = '2026년 10월 11일';

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
            <p className="text-blue-100">최종 수정일: {LAST_UPDATED} · 시행일: {EFFECTIVE_DATE}</p>
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
                <li>캠프 운영: 급여 지급 및 원천징수 신고, 해외 송금, 항공권 발권·여행자보험 가입, 명찰·단체복 제작, 로밍 준비</li>
                <li>캠프 신청: 학부모 회원의 아이 등록, 캠프 참가 신청 · 신청서(사전 설문 포함) 접수, 참가 확정 · 반 배정 안내</li>
                <li>안전 관리: 캠프 참가 학생의 병원 내원 등 응급 상황 대응, 스태프 위치 공유</li>
                <li>채팅·통화: 캠프 스태프 간 채팅(메시지·사진·동영상·음성 메시지)과 음성·영상 통화, 새 메시지·걸려 오는 통화 알림</li>
                <li>커뮤니티·채팅 운영: 게시판·채팅방 운영, 신고 처리 및 이용 제한</li>
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
                    • 이름, 이메일 주소, 전화번호, 역할(멘토/원어민)<br/>
                    • 소셜 로그인 시: 소셜 계정 고유 ID, 프로필 정보
                  </p>
                </div>

                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">민감 정보 (별도 암호화 저장)</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • <strong>멘토 회원</strong>: 가입 시 주민등록번호 앞자리(생년월일 6자리)와 성별 자리(1자리)<br/>
                    &nbsp;&nbsp;— 수집 목적: 나이 산출 및 본인 확인<br/>
                    • <strong>캠프에 배정된 멘토</strong>: 주민등록번호 뒷자리(7자리)<br/>
                    &nbsp;&nbsp;— AES-256-GCM 방식으로 암호화하여 저장하며, 서버에서만 복호화 가능<br/>
                    &nbsp;&nbsp;— 수집 목적: 급여 지급에 따른 원천징수 신고 등 관계 법령상 의무 이행<br/>
                    • <strong>원어민 회원</strong>: 생년월일(YYYY-MM-DD)<br/>
                    &nbsp;&nbsp;— 수집 목적: 나이 확인 및 운영 관리
                  </p>
                </div>

                <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">캠프 배정 시 수집 항목 (캠프 코드가 부여된 멘토·원어민 교사)</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • <strong>멘토</strong>: 영어 닉네임(명찰용), 급여 계좌(은행·계좌번호·예금주)<br/>
                    • <strong>원어민 교사</strong>: 급여 계좌 — 계좌 개설 국가, 예금주 영문 성명, 은행명, 계좌번호 또는 IBAN, SWIFT/BIC 코드,
                    국가별 은행 식별번호(ABA·Transit·BSB·Sort Code·IFSC 등), 은행 주소, 수취인 주소 및 전화번호<br/>
                    &nbsp;&nbsp;— 해외 송금 시 송금 은행이 수취인 주소·전화번호를 요구하므로 함께 수집합니다.<br/>
                    • <strong>해외 캠프 참가자</strong>: 여권상 영문 성명, 여권 번호, 여권 만료일, 단체티 사이즈, 휴대폰 모델명<br/>
                    &nbsp;&nbsp;— 수집 목적: 항공권 발권, 여행자보험 가입, 단체복 준비, 해외 로밍 준비<br/>
                    • 계좌번호·IBAN·여권 정보는 일반 회원 정보와 분리된 저장소에 보관하며, 계좌번호·IBAN은 암호화합니다.
                    본인과 관리자만 조회할 수 있고, 관리자가 원문을 조회하면 그 기록이 남습니다.
                  </p>
                </div>

                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">캠프 참가 학생 정보</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    회사는 캠프 운영을 위해 참가 학생의 명단(이름, 연락처, 주민등록번호 등)을 처리합니다. 학생 정보는 학부모 회원이 앱에서 직접 입력하거나, 캠프 신청 시 받은 정보를 운영진이 입력합니다.<br/>
                    • <strong>학부모 회원</strong>: 이름, 전화번호(문자 인증), 이메일 또는 소셜 계정 정보<br/>
                    • <strong>아이 정보 (학부모가 법정대리인으로서 동의 후 입력)</strong>: 이름, 영어 이름, 성별, 생년월일, 보호자 · 기타 연락처, 지역 · 주소, 이메일,
                    복용약 · 알레르기 · 건강 특이사항, 여권 정보(해외 캠프), 주민등록번호(병원 진료 접수 · 보험 처리용, 암호화 저장)<br/>
                    • <strong>캠프 신청서</strong>: 학년, 입소 · 퇴소 여정, 단체티 사이즈, 사전 설문(학습 · 생활 습관 등 — 반 배정과 상담에 사용)<br/>
                    • 만 14세 미만 아이의 정보는 법정대리인인 학부모의 동의를 받아 처리하며, 동의 일시를 기록합니다.<br/>
                    • 스태프 화면에는 주민등록번호 뒷자리를 가려서 표시합니다.<br/>
                    • 원문은 관리자, 그리고 병원 내원 인솔자로 지정된 스태프에게만 해당 내원 기간 동안 표시되며, 조회할 때마다 기록이 남습니다.<br/>
                    • 수집 목적: 병원 진료 접수, 보험 처리 등 학생 안전 관리
                  </p>
                </div>

                <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">선택 수집 항목</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 프로필 사진, 자기소개, 관심 분야
                  </p>
                </div>

                <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">채팅·통화 이용 시 (자세한 내용은 제11조)</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 채팅: 보낸 메시지, 사진·동영상·음성 메시지 파일, 공감·투표·읽은 시각, 채팅방 알림·고정·숨김 설정, 차단 목록, 신고 내역<br/>
                    • 통화: 통화 기록(통화 종류, 건 사람, 참여자, 시작·연결·종료 시각, 통화 시간, 받지 않음·거절 여부)<br/>
                    &nbsp;&nbsp;— 통화 음성·영상은 실시간으로 전달만 하며 녹음하거나 저장하지 않습니다.
                  </p>
                </div>

                <div className="bg-gray-50 border-l-4 border-gray-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">자동 수집 항목</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 서비스 이용 기록, 접속 로그, 쿠키, 접속 IP 정보, 기기 정보<br/>
                    • 알림 수신용 기기 토큰: 앱 푸시 토큰, 웹 알림 토큰, iOS 통화 수신용 VoIP 토큰 (로그아웃하면 삭제)<br/>
                    • 위치 공유 기능 이용 시: GPS 기반 위도·경도 좌표 (사용자가 직접 활성화한 경우에 한함)<br/>
                    • 커뮤니티 이용 시: 게시글·댓글, 신고 및 차단 내역. 익명으로 작성한 글도 신고 처리와 법적 대응을 위해 작성자 계정은 내부적으로 기록되며, 다른 이용자에게는 공개되지 않습니다.<br/>
                    • 개인정보 조회·변경 기록(감사 로그): 관리자의 개인정보 조회, 회원 정보 변경, 민감 정보 열람 시 처리자·시각·대상
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
                <li>위치 기록: 마지막 갱신 후 14일이 지나면 자동 삭제</li>
                <li>채팅 메시지·첨부 파일·통화 기록: 채팅방이 유지되는 동안 보관. 보낸 사람이 메시지를 삭제하면 내용과 첨부 파일을 즉시 지웁니다.</li>
                <li>캠프 참가 정보(계좌·여권 등): 회원 탈퇴 시 파기. 단, 급여 지급·원천징수 관련 기록은 국세기본법 등 관계 법령이 정한 기간 동안 보관</li>
                <li>개인정보 조회·변경 기록(감사 로그): 「개인정보의 안전성 확보조치 기준」에 따라 2년 이상 보관</li>
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
                <p className="text-gray-700 text-sm leading-relaxed">
                  회사는 캠프 운영을 위해 필요한 경우에 한하여 아래와 같이 개인정보를 제공합니다.<br/><br/>
                  • <strong>항공사·여행사</strong>: 해외 캠프 참가자의 여권상 영문 성명·여권 번호·여권 만료일·생년월일 — 항공권 발권 (캠프 종료 시까지)<br/>
                  • <strong>보험사</strong>: 캠프 참가자의 성명·생년월일·여권 정보 — 여행자보험 가입 (보험 기간 종료 시까지)<br/>
                  • <strong>의료기관</strong>: 캠프 참가 학생의 성명·주민등록번호 — 진료 접수 (진료 목적 달성 시까지)<br/>
                  • <strong>송금 은행</strong>: 원어민 교사의 계좌 및 수취인 정보 — 급여 해외 송금 (송금 완료 시까지)<br/><br/>
                  그 밖에는 정보주체의 동의 또는 법률의 특별한 규정이 있는 경우를 제외하고 제3자에게 제공하지 않습니다.
                </p>
              </div>
            </section>

            {/* Section 5 - 처리 위탁 · 국외 이전 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                5. 개인정보 처리업무의 위탁 및 국외 이전
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 서비스 제공을 위해 아래와 같이 개인정보 처리업무를 위탁하고 있으며, 일부는 국외에서 처리됩니다.
                정보는 서비스 이용 시 네트워크를 통해 전송되며, 위탁 계약 종료 또는 회원 탈퇴 시까지(별도 기재가 있으면 그 기간) 보관됩니다.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-700 border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 border-b border-gray-200">수탁자 (국가)</th>
                      <th className="text-left p-3 border-b border-gray-200">위탁 업무 · 이전 항목</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border-b border-gray-100 align-top">Google LLC — Firebase (대한민국 서울 · 미국)</td>
                      <td className="p-3 border-b border-gray-100">회원 인증, 회원·채팅 데이터 저장(서울), 사진·동영상·음성 파일 저장(미국), 서버 기능 실행(서울), 앱·웹 알림 전달</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100 align-top">Agora Lab, Inc. (미국 · 통화 중계 서버는 이용자와 가까운 지역)</td>
                      <td className="p-3 border-b border-gray-100">음성·영상 통화 실시간 중계 — 통화 음성·영상(저장하지 않음), 통화 참여자 식별 번호, 접속 IP</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100 align-top">Apple Inc. (미국)</td>
                      <td className="p-3 border-b border-gray-100">iOS 앱 알림 및 걸려 오는 통화 알림 전달 — 기기 토큰, 알림 내용</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100 align-top">650 Industries, Inc. — Expo (미국)</td>
                      <td className="p-3 border-b border-gray-100">앱 알림 전달, 앱 업데이트 배포 — 기기 토큰, 알림 내용</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100 align-top">Vercel Inc. (미국)</td>
                      <td className="p-3 border-b border-gray-100">웹사이트 및 서버 API 운영 — 서비스 이용 중 전송되는 정보, 접속 로그</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-gray-100 align-top">Functional Software, Inc. — Sentry (미국)</td>
                      <td className="p-3 border-b border-gray-100">오류 기록 및 분석 — 오류 발생 시 기기·브라우저·앱 정보, 접속 IP</td>
                    </tr>
                    <tr>
                      <td className="p-3 align-top">(주)네이버클라우드 (대한민국)</td>
                      <td className="p-3">문자 메시지 발송 — 전화번호, 발송 내용</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed mt-3">
                국외 이전을 원하지 않으시면 회원 탈퇴 또는 해당 기능(채팅·통화 등)을 이용하지 않는 방법으로 거부할 수 있으나, 이 경우 해당 서비스 이용이 제한될 수 있습니다.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                6. 개인정보의 파기 절차 및 방법
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
                7. 정보주체의 권리·의무 및 행사방법
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
                8. 개인정보의 안전성 확보 조치
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>관리적 조치: 내부관리계획 수립·시행, 정기적 직원 교육 등</li>
                <li>기술적 조치: 개인정보처리시스템 등의 접근권한 관리, 접근통제시스템 설치, 고유식별정보 등의 암호화, 보안프로그램 설치</li>
                <li>물리적 조치: 전산실, 자료보관실 등의 접근통제</li>
              </ul>
              <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                <h3 className="font-semibold text-gray-900 mb-2">주민등록번호 암호화 처리 방침</h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  멘토 회원의 주민등록번호 뒷자리(7자리)는 「개인정보 보호법」 제24조 및 동법 시행령 제21조에 따라 다음과 같이 처리됩니다.<br/><br/>
                  • <strong>암호화 방식</strong>: AES-256-GCM (인증 암호화, 무결성 검증 포함)<br/>
                  • <strong>키 관리</strong>: 암호화 키는 서버 환경변수로만 보관하며, 클라이언트에 절대 노출되지 않습니다.<br/>
                  • <strong>처리 방식</strong>: 암호화·복호화는 서버(API Route)에서만 수행하며, 클라이언트는 암호화된 값에 접근할 수 없습니다.<br/>
                  • <strong>접근 권한</strong>: 복호화된 원문은 관리자(admin) 권한 보유자만 조회 가능합니다. 캠프 참가 학생의 주민등록번호는 병원 내원 인솔자로 지정된 스태프도 해당 내원 기간 동안 조회할 수 있습니다.<br/>
                  • <strong>조회 기록</strong>: 원문을 조회할 때마다 조회자·시각·대상이 감사 로그로 남습니다.<br/>
                  • <strong>계좌번호·IBAN</strong>: 주민등록번호와 같은 방식으로 암호화하여 저장합니다.<br/>
                  • <strong>저장소</strong>: Firebase Firestore에 암호화된 값(`rrnLastEncrypted`)으로 저장되며, Firestore Security Rules에 의해 클라이언트의 직접 쓰기가 차단됩니다.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                9. 개인정보 보호책임자
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

            {/* Section 9 - 위치 정보 처리 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                10. 위치 정보의 수집·이용
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 캠프 운영 스태프 간 실시간 위치 공유 서비스 제공을 위해 아래와 같이 위치 정보를 처리합니다.
              </p>

              <div className="space-y-4">
                <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">수집 항목</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    GPS 기반 실시간 위도·경도 좌표, 위치 업데이트 시각
                  </p>
                </div>

                <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">수집 및 이용 목적</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    캠프 진행 중 같은 캠프 코드를 보유한 스태프(멘토, 원어민 교사, 관리자) 간
                    실시간 위치 확인 및 안전 관리
                  </p>
                </div>

                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">수집 방법 및 동의</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    위치 공유는 사용자가 앱 내 위치 공유 토글을 직접 활성화한 경우에만 작동합니다.
                    앱 최초 실행 시 또는 기능 사용 시 위치 권한 허용 여부를 사용자에게 명시적으로 요청하며,
                    권한을 거부하면 위치 공유 기능은 작동하지 않습니다.
                    사용자는 언제든지 토글을 끄거나 기기 설정에서 위치 권한을 철회할 수 있습니다.
                  </p>
                </div>

                <div className="bg-purple-50 border-l-4 border-purple-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">포그라운드 및 백그라운드 위치 수집</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    위치 공유가 활성화된 상태에서 앱이 백그라운드로 전환되어도 위치 정보 업데이트가
                    지속됩니다(Android: Foreground Service 알림 표시, iOS: 상태 표시줄 위치 아이콘 표시).
                    이는 캠프 운영 중 스태프 위치를 지속적으로 파악하기 위한 목적이며,
                    사용자가 위치 공유를 끄면 즉시 중단됩니다.
                  </p>
                </div>

                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">공개 범위 및 보유 기간</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    수집된 위치 정보는 동일 캠프 코드를 보유한 스태프에게만 공개됩니다.
                    위치 공유를 끄는 즉시 지도에서 제거되며, 앱의 마이페이지 › 설정에서 '지금 위치 공유 끄기'로 모든 캠프의 위치 공유를 한 번에 끌 수 있습니다.
                    위치 기록은 마지막 갱신 후 14일이 지나면 자동으로 삭제됩니다.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 11 - 채팅·통화 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                11. 채팅·통화 정보의 처리
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                회사는 캠프 운영 스태프 간 소통을 위해 채팅과 음성·영상 통화 기능을 제공하며, 이에 필요한 정보를 아래와 같이 처리합니다.
              </p>
              <div className="space-y-4">
                <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">이용 대상 및 공개 범위</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    채팅은 캠프에 배정된 스태프(멘토, 원어민 교사, 관리자)만 이용할 수 있습니다. 메시지와 파일은 그 채팅방에 들어 있는 사람에게만 보이며,
                    캠프 배정에 따라 채팅방에 자동으로 들어가고 나옵니다. 나중에 배정된 스태프는 그 채팅방의 지난 대화도 볼 수 있습니다.
                  </p>
                </div>
                <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">통화</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    음성·영상 통화는 통화 중계 서비스(Agora)를 통해 실시간으로 전달되며, 회사와 수탁자 모두 통화 내용을 녹음하거나 저장하지 않습니다.
                    채팅방에는 통화 기록(통화 종류, 통화 시간, 받지 않음·거절 여부)만 남습니다.
                    1:1 통화가 걸려 오면 휴대폰의 통화 화면(iOS CallKit, Android 통화 화면)으로 알려 드리며, 이를 위해 기기 알림 토큰을 사용합니다.
                  </p>
                </div>
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">기기 권한</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    • 마이크: 통화, 음성 메시지 녹음 — 사용할 때만<br/>
                    • 카메라: 영상 통화, 사진·동영상 촬영 — 사용할 때만<br/>
                    • 사진 저장: 채팅방의 사진·동영상을 기기에 저장할 때<br/>
                    • 전화(Android): 걸려 오는 통화를 시스템 통화 화면으로 보여 주기 위해 — 전화번호나 통화 기록을 읽지 않습니다<br/>
                    • 연락처: 학부모 연락처를 기기 주소록에 저장할 때 — 주소록은 기기 안에서만 사용하며 서버로 보내지 않습니다<br/>
                    권한은 기기 설정에서 언제든지 철회할 수 있으며, 철회하면 해당 기능만 이용할 수 없습니다.
                  </p>
                </div>
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">보관 · 삭제 · 신고</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    메시지·첨부 파일·통화 기록은 채팅방이 유지되는 동안 보관합니다. 보낸 사람은 자신의 메시지를 삭제할 수 있으며, 삭제하면 내용과 첨부 파일을 즉시 지웁니다.
                    회원 탈퇴 후에도 이미 보낸 메시지는 다른 참여자의 대화 기록으로 남을 수 있습니다.
                    이용자는 부적절한 메시지를 신고하거나 상대를 차단할 수 있으며, 신고된 메시지는 관리자가 확인하여 삭제 등 필요한 조치를 합니다.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-600">
                12. 개인정보 처리방침 변경
              </h2>
              <p className="text-gray-700 leading-relaxed">
                이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4 mt-4 text-sm">
                <li>시행일: {EFFECTIVE_DATE}</li>
                <li>{EFFECTIVE_DATE} 개정: 채팅·통화 정보 처리(제11조), 개인정보 처리업무의 위탁 및 국외 이전(제5조), 알림 수신용 기기 토큰, 채팅·통화 보유 기간, 학부모 회원 · 아이 정보(법정대리인 동의) · 캠프 신청서 추가</li>
                <li>2026년 10월 6일 개정: 캠프 배정 시 수집 항목(계좌·여권 등), 원어민 해외 송금 정보, 캠프 참가 학생 정보 처리, 제3자 제공, 위치 기록 자동 삭제, 커뮤니티 신고·익명글 처리, 감사 로그 보관 내용 추가</li>
                <li>2026년 6월 14일: 이전 방침</li>
              </ul>
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
