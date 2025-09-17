export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="mt-30 bg-gray-50 border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 회사 정보 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">회사 정보</h3>
            <ul className="space-y-2">
              <li className="text-sm text-gray-500">회사명: (주)에스엠아이에스</li>
              <li className="text-sm text-gray-500">대표: 김선희</li>
              <li className="text-sm text-gray-500">법인사업자 등록번호: 427-88-03423</li>
              <li className="text-sm text-gray-500">주소: 경기 성남시 분당구 장미로 78 SMIS 라운지&교육센터 3층</li>
              <li className="text-sm text-gray-500">채용 문의: 신선웅 (010-7656-7933)</li>
            </ul>
          </div>
          
          {/* 연락처 및 주소 */}
          {/* <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">주소</h3>
            <p className="text-sm text-gray-500 mb-2">경기 성남시 분당구 장미로 78 SMIS 라운지&교육센터 3층 312호</p>
          </div> */}
          
          {/* 소셜 링크 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-4">소셜 링크</h3>
            <ul className="flex flex-col space-y-2">
              <li>
                <a 
                  href="http://pf.kakao.com/_Axafxcb/chat" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-sm text-gray-500 hover:text-gray-700"
                >
                  <span className="mr-2">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3C6.5 3 2 6.5 2 11c0 3.5 2.2 6.5 5.5 7.8-.1.5-.5 1.8-.6 2.1 0 0-.1.1-.1.1 0 .1 0 .1.1.1.1 0 1.9-1.3 2.7-1.8.8.1 1.6.2 2.4.2 5.5 0 10-3.5 10-8 0-4.5-4.5-8-10-8Z"/>
                    </svg>
                  </span>
                  카카오톡 채널
                </a>
              </li>
              <li>
                <a 
                  href="https://www.youtube.com/@smiscamp" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-sm text-gray-500 hover:text-gray-700"
                >
                  <span className="mr-2">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                    </svg>
                  </span>
                  유튜브 채널
                </a>
              </li>
              <li>
                <a 
                  href="https://www.smisedu.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-sm text-gray-500 hover:text-gray-700"
                >
                  <span className="mr-2">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                  </span>
                  공식 홈페이지
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 border-t border-gray-200 pt-6">
          <p className="text-center text-sm text-gray-500">
            &copy; {currentYear} (주)에스엠아이에스. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
} 