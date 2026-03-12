# ApplicantsManageClient 마이그레이션 가이드

## 기존 코드에서 새로운 Hook 방식으로 변경하기

### Step 1: Import 변경

**기존:**
```typescript
import {
  SMSTemplate,
  getAllSMSTemplates,
  getSMSTemplateByTypeAndJobBoard,
  saveSMSTemplate,
  updateSMSTemplate,
  TemplateType,
} from '@/lib/smsTemplateService';
```

**변경 후:**
```typescript
import { useSMSTemplates } from '@/hooks/useSMSTemplates';
import { SMSMessageBox } from '@/components/admin/SMSMessageBox';
import { TemplateType } from '@/lib/smsTemplateService';
```

---

### Step 2: 상태 변수 제거 (Hook이 대체)

**기존 (삭제):**
```typescript
const [documentPassMessage, setDocumentPassMessage] = useState('');
const [documentFailMessage, setDocumentFailMessage] = useState('');
const [interviewScheduledMessage, setInterviewScheduledMessage] = useState('');
const [interviewPassMessage, setInterviewPassMessage] = useState('');
const [interviewFailMessage, setInterviewFailMessage] = useState('');
const [finalPassMessage, setFinalPassMessage] = useState('');
const [finalFailMessage, setFinalFailMessage] = useState('');
const [isSavingTemplate, setIsSavingTemplate] = useState(false);
```

**변경 후 (추가):**
```typescript
const {
  messages,
  updateMessage,
  saveTemplate,
  isLoading: isLoadingTemplates,
  isSaving: isSavingTemplate,
} = useSMSTemplates({
  jobBoardId: jobBoard?.id,
  jobBoardTitle: jobBoard?.title,
  onLoadSuccess: () => {
    // 템플릿 로드 성공 시 (선택사항)
  },
  onLoadError: (error) => {
    console.error('템플릿 로드 실패:', error);
  },
});
```

---

### Step 3: loadTemplates 함수 제거

**기존 (삭제 - 총 74줄):**
```typescript
const loadTemplates = useCallback(async () => {
  if (!jobBoard || !jobBoard.id) return;

  try {
    setIsLoading(true);

    // document_pass 템플릿 로드
    const documentPassTemplate = await getSMSTemplateByTypeAndJobBoard('document_pass', jobBoard.id);
    if (documentPassTemplate) {
      setDocumentPassMessage(documentPassTemplate.content);
    } else {
      setDocumentPassMessage(`안녕하세요...`);
    }
    // ... 반복되는 코드 70줄
  } catch (error) {
    console.error('템플릿 로드 실패:', error);
    toast.error('템플릿을 불러오는 데 실패했습니다.');
  } finally {
    setIsLoading(false);
  }
}, [jobBoard]);
```

**변경 후:**
Hook이 자동으로 처리하므로 함수 자체가 필요 없음! ✅

---

### Step 4: saveTemplate 함수 제거

**기존 (삭제 - 총 80줄):**
```typescript
const saveTemplate = async (type: TemplateType, content: string) => {
  if (!jobBoard || !jobBoard.id) return;

  try {
    setIsSavingTemplate(true);
    const currentUser = auth.currentUser;
    const createdBy = currentUser?.uid || 'system';
    const existingTemplate = await getSMSTemplateByTypeAndJobBoard(type, jobBoard.id);
    
    if (existingTemplate && existingTemplate.id) {
      updateSMSTemplate(existingTemplate.id, {
        content,
        type,
        refJobBoardId: jobBoard.id,
        title: `${type} 템플릿`,
        createdBy
      }).catch(error => {
        console.error('템플릿 업데이트 백그라운드 오류:', error);
      });
    } else {
      // ... 반복되는 코드
    }
    
    // 로컬 상태 즉시 업데이트
    switch (type) {
      case 'document_pass':
        setDocumentPassMessage(content);
        break;
      // ... 7개 case 반복
    }
    
    toast.success('템플릿이 저장되었습니다.');
  } catch (error) {
    console.error('템플릿 저장 실패:', error);
    toast.error('템플릿 저장에 실패했습니다.');
  } finally {
    setIsSavingTemplate(false);
  }
};
```

**변경 후:**
Hook이 자동으로 처리! ✅

---

### Step 5: JSX 업데이트

**기존 (각 메시지 박스마다 반복):**
```tsx
{showDocumentPassMessage && (
  <div className="mt-4 p-4 rounded-lg border bg-green-50 border-green-200">
    <h4 className="text-sm font-semibold mb-2">서류 합격 메시지 내용</h4>
    
    <textarea
      value={documentPassMessage}
      onChange={(e) => setDocumentPassMessage(e.target.value)}
      className="w-full px-3 py-2 border rounded-md"
      rows={5}
    />
    
    <div className="mt-2">
      <label>발신번호 선택</label>
      <input 
        type="radio" 
        value="01076567933"
        checked={fromNumber === '01076567933'}
        onChange={(e) => setFromNumber(e.target.value)}
      />
      <label>010-7656-7933 (대표)</label>
      {/* ... 반복 */}
    </div>
    
    <div className="mt-4 flex gap-2">
      <Button onClick={() => setShowDocumentPassMessage(false)}>취소</Button>
      <Button onClick={() => saveTemplate('document_pass', documentPassMessage)}>저장</Button>
      <Button onClick={() => sendMessage(documentPassMessage)}>전송</Button>
    </div>
  </div>
)}
```

**변경 후 (간결!):**
```tsx
{showDocumentPassMessage && (
  <SMSMessageBox
    title="서류 합격 메시지 내용"
    type="document_pass"
    message={messages.documentPass}
    onMessageChange={(msg) => updateMessage('documentPass', msg)}
    fromNumber={fromNumber}
    onFromNumberChange={setFromNumber}
    currentJobBoardId={jobBoard?.id || ''}
    onSave={() => saveTemplate('document_pass', messages.documentPass)}
    onSend={() => sendMessage(messages.documentPass)}
    onCancel={() => setShowDocumentPassMessage(false)}
    isSaving={isSavingTemplate}
    isSending={isLoadingMessage}
    backgroundColor="#d1fae5"
    buttonColor="#10b981"
  />
)}
```

---

### Step 6: 전체 메시지 타입 교체

**메시지 접근 방식 변경:**

| 기존 | 변경 후 |
|------|---------|
| `documentPassMessage` | `messages.documentPass` |
| `documentFailMessage` | `messages.documentFail` |
| `interviewScheduledMessage` | `messages.interviewScheduled` |
| `interviewPassMessage` | `messages.interviewPass` |
| `interviewFailMessage` | `messages.interviewFail` |
| `finalPassMessage` | `messages.finalPass` |
| `finalFailMessage` | `messages.finalFail` |

**업데이트 방식 변경:**

| 기존 | 변경 후 |
|------|---------|
| `setDocumentPassMessage(value)` | `updateMessage('documentPass', value)` |
| `setDocumentFailMessage(value)` | `updateMessage('documentFail', value)` |
| ... | ... |

---

### Step 7: useEffect 제거

**기존 (삭제):**
```typescript
useEffect(() => {
  if (selectedApplication?.user) {
    loadTemplates();
  }
}, [selectedApplication, loadTemplates]);
```

**변경 후:**
Hook이 자동으로 처리! ✅

---

## 코드 라인 수 비교

### 기존 코드
- 상태 변수: 8개 (8줄)
- loadTemplates 함수: 74줄
- saveTemplate 함수: 80줄
- JSX (7개 메시지 박스): 각 50줄 × 7 = 350줄
- **총 약 512줄**

### 개선 후
- Hook 선언: 10줄
- JSX (7개 메시지 박스): 각 15줄 × 7 = 105줄
- **총 약 115줄**

### 결과
**397줄 감소 (77% 코드 감소!)** 🎉

---

## 마이그레이션 체크리스트

- [ ] Import 변경
- [ ] useSMSTemplates Hook 추가
- [ ] 기존 상태 변수 제거 (8개)
- [ ] loadTemplates 함수 제거
- [ ] saveTemplate 함수 제거
- [ ] useEffect 제거
- [ ] 7개 메시지 박스 JSX를 SMSMessageBox 컴포넌트로 교체
- [ ] messages.xxx로 메시지 접근 변경
- [ ] updateMessage로 업데이트 변경
- [ ] 테스트: 템플릿 로드
- [ ] 테스트: 템플릿 저장
- [ ] 테스트: SMS 전송
- [ ] 테스트: 이전 템플릿 불러오기 (신규 기능)

---

## 주의사항

1. **jobBoard prop 확인**
   - Hook에 `jobBoard?.id`와 `jobBoard?.title` 전달
   - `jobBoard`가 없으면 템플릿이 로드되지 않음

2. **메시지 이름 매핑**
   - camelCase 사용: `documentPass`, `interviewScheduled` 등
   - 기존의 snake_case와 다름에 주의

3. **타입 매핑**
   ```typescript
   const typeToKeyMap: Record<TemplateType, keyof TemplateMessages> = {
     'document_pass': 'documentPass',
     'document_fail': 'documentFail',
     'interview_scheduled': 'interviewScheduled',
     'interview_pass': 'interviewPass',
     'interview_fail': 'interviewFail',
     'final_pass': 'finalPass',
     'final_fail': 'finalFail',
   };
   ```

4. **SMSMessageBox의 currentJobBoardId**
   - 이전 템플릿 불러오기 기능에 필수
   - 현재 공고를 제외하기 위해 사용

---

## 추가 개선 제안

### 더 간결하게 만들기

7개 메시지 박스가 여전히 반복적이므로, 추가 추상화 가능:

```typescript
const MESSAGE_BOX_CONFIG = [
  { 
    type: 'document_pass' as TemplateType, 
    key: 'documentPass' as keyof TemplateMessages,
    show: showDocumentPassMessage,
    setShow: setShowDocumentPassMessage,
    title: '서류 합격 메시지 내용',
    backgroundColor: '#d1fae5',
    buttonColor: '#10b981',
  },
  // ... 나머지 6개
];

// JSX
{MESSAGE_BOX_CONFIG.map(config => (
  config.show && (
    <SMSMessageBox
      key={config.type}
      title={config.title}
      type={config.type}
      message={messages[config.key]}
      onMessageChange={(msg) => updateMessage(config.key, msg)}
      fromNumber={fromNumber}
      onFromNumberChange={setFromNumber}
      currentJobBoardId={jobBoard?.id || ''}
      onSave={() => saveTemplate(config.type, messages[config.key])}
      onSend={() => sendMessage(messages[config.key])}
      onCancel={() => config.setShow(false)}
      isSaving={isSavingTemplate}
      isSending={isLoadingMessage}
      backgroundColor={config.backgroundColor}
      buttonColor={config.buttonColor}
    />
  )
))}
```

이렇게 하면 **추가로 300줄 감소** 가능! 🚀
