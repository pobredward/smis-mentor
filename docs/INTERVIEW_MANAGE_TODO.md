# InterviewManageClient.tsx SMS 메시지 박스 교체 가이드

## ✅ 완료된 작업
- `ApplicantsManageClient.tsx`: 7개 메시지 박스 모두 SMSMessageBox 컴포넌트로 교체 완료

## 🔄 추가 작업 필요
- `InterviewManageClient.tsx`: 동일한 패턴으로 교체 필요

---

## InterviewManageClient.tsx 교체 패턴

### 1. Import 추가됨 ✅
```typescript
import { SMSMessageBox } from '@/components/admin/SMSMessageBox';
```

### 2. 교체해야 할 7개 메시지 박스

InterviewManageClient.tsx의 메시지 박스들도 ApplicantsManageClient.tsx와 동일한 패턴으로 교체하면 됩니다.

#### 교체 전 패턴:
```tsx
{showDocumentPassMessage && (
  <div className="mt-4 border border-green-200 rounded-md p-4 bg-green-50">
    <label>서류 합격 메시지 내용</label>
    <textarea ... />
    <div>발신번호 선택 ...</div>
    <div>
      <Button>취소</Button>
      <Button>저장</Button>
      <Button>전송</Button>
    </div>
  </div>
)}
```

#### 교체 후 패턴:
```tsx
{showDocumentPassMessage && (
  <SMSMessageBox
    title="서류 합격 메시지 내용"
    type="document_pass"
    message={documentPassMessage}
    onMessageChange={setDocumentPassMessage}
    fromNumber={fromNumber}
    onFromNumberChange={setFromNumber}
    currentJobBoardId={selectedApplication?.refJobBoardId || ''}
    onSave={() => saveTemplate('document_pass', documentPassMessage)}
    onSend={() => sendMessage(documentPassMessage)}
    onCancel={() => setShowDocumentPassMessage(false)}
    isSaving={isSavingTemplate}
    isSending={isLoadingMessage}
    backgroundColor="#d1fae5"
    buttonColor="#10b981"
  />
)}
```

### 3. 전체 교체 리스트

| 메시지 타입 | title | type | message 변수 | setState | backgroundColor | buttonColor |
|------------|-------|------|-------------|----------|-----------------|-------------|
| 서류 합격 | "서류 합격 메시지 내용" | `document_pass` | `documentPassMessage` | `setDocumentPassMessage` | `#d1fae5` | `#10b981` |
| 서류 불합격 | "서류 불합격 메시지 내용" | `document_fail` | `documentFailMessage` | `setDocumentFailMessage` | `#fee2e2` | `#ef4444` |
| 면접 예정 | "면접 예정 메시지 내용" | `interview_scheduled` | `interviewScheduledMessage` | `setInterviewScheduledMessage` | `#dbeafe` | `#3b82f6` |
| 면접 합격 | "면접 합격 메시지 내용" | `interview_pass` | `interviewPassMessage` | `setInterviewPassMessage` | `#d1fae5` | `#10b981` |
| 면접 불합격 | "면접 불합격 메시지 내용" | `interview_fail` | `interviewFailMessage` | `setInterviewFailMessage` | `#fee2e2` | `#ef4444` |
| 최종 합격 | "최종 합격 메시지 내용" | `final_pass` | `finalPassMessage` | `setFinalPassMessage` | `#d1fae5` | `#10b981` |
| 최종 불합격 | "최종 불합격 메시지 내용" | `final_fail` | `finalFailMessage` | `setFinalFailMessage` | `#fee2e2` | `#ef4444` |

### 4. 주의사항

**InterviewManageClient에서 다른 점:**
- `currentJobBoardId`: `selectedApplication?.refJobBoardId || ''` 사용 (jobBoard?.id가 아님)

---

## 자동 교체 스크립트 (VSCode)

VSCode의 Find & Replace 기능을 사용하여 한 번에 교체할 수 있습니다:

1. **Ctrl+H** (Find & Replace) 열기
2. **Use Regular Expression** 활성화 (아이콘 클릭)
3. 아래 패턴으로 검색 및 교체

### 서류 합격 메시지
**Find:**
```
{showDocumentPassMessage && \([\s\S]*?\)\s*}\s*\n\s*{\/\* 불합격 메시지 박스 \*\/}
```

**Replace:**
```
{showDocumentPassMessage && (
                        <SMSMessageBox
                          title="서류 합격 메시지 내용"
                          type="document_pass"
                          message={documentPassMessage}
                          onMessageChange={setDocumentPassMessage}
                          fromNumber={fromNumber}
                          onFromNumberChange={setFromNumber}
                          currentJobBoardId={selectedApplication?.refJobBoardId || ''}
                          onSave={() => saveTemplate('document_pass', documentPassMessage)}
                          onSend={() => sendMessage(documentPassMessage)}
                          onCancel={() => setShowDocumentPassMessage(false)}
                          isSaving={isSavingTemplate}
                          isSending={isLoadingMessage}
                          backgroundColor="#d1fae5"
                          buttonColor="#10b981"
                        />
                      )}
                      
                      {/* 불합격 메시지 박스 */}
```

(나머지 6개도 동일한 패턴으로 교체)

---

## 검증 방법

교체 후 다음을 확인하세요:

1. **컴파일 오류 없음**
   ```bash
   npm run build
   ```

2. **기능 테스트**
   - 각 상태(서류/면접/최종)에서 메시지 박스 열기
   - "📋 이전 템플릿" 버튼이 보이는지 확인 ✨
   - 템플릿 선택 모달이 열리는지 확인 ✨
   - 템플릿 저장/전송 기능 동작 확인

3. **UI 테스트**
   - 문자 수 카운터 표시 확인
   - 발신번호 라디오 버튼 동작 확인
   - 버튼 스타일 및 로딩 상태 확인

---

## 완료 체크리스트

### ApplicantsManageClient.tsx ✅
- [x] Import 추가
- [x] 서류 합격 메시지 교체
- [x] 서류 불합격 메시지 교체
- [x] 면접 예정 메시지 교체
- [x] 면접 합격 메시지 교체
- [x] 면접 불합격 메시지 교체
- [x] 최종 합격 메시지 교체
- [x] 최종 불합격 메시지 교체

### InterviewManageClient.tsx
- [x] Import 추가
- [ ] 서류 합격 메시지 교체
- [ ] 서류 불합격 메시지 교체
- [ ] 면접 예정 메시지 교체
- [ ] 면접 합격 메시지 교체
- [ ] 면접 불합격 메시지 교체
- [ ] 최종 합격 메시지 교체
- [ ] 최종 불합격 메시지 교체

---

## 예상 효과

각 파일당:
- **코드 라인 수**: ~350줄 감소
- **중복 코드**: 완전 제거
- **새 기능**: 이전 템플릿 불러오기 버튼 자동 추가 ✨
- **UX 개선**: 문자 수 표시, 경고 메시지 등
