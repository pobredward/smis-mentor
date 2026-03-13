# 평가 기준 업데이트 가이드

## 방법 1: 관리자 페이지에서 업데이트

1. 관리자로 로그인
2. 다음 URL로 이동: `/admin/update-evaluation-criteria`
3. "평가 기준 업데이트" 버튼 클릭
4. 완료 후 페이지 새로고침

## 방법 2: 브라우저 콘솔에서 직접 실행

1. 관리자로 로그인 후 아무 관리자 페이지 접속
2. 브라우저 개발자 도구 열기 (F12)
3. Console 탭 선택
4. 다음 코드 복사 & 붙여넣기:

```javascript
// Firebase 설정 확인
const { db } = await import('/lib/firebase');
const { collection, query, where, getDocs, updateDoc, doc, Timestamp } = await import('firebase/firestore');

// 캠프 생활 평가 기준 업데이트
const updateCriteria = async () => {
  try {
    console.log('🔄 캠프 생활 평가 기준 업데이트 시작...');
    
    const q = query(
      collection(db, 'evaluationCriteria'),
      where('stage', '==', '캠프 생활'),
      where('isDefault', '==', true)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.error('❌ 캠프 생활 평가 기준을 찾을 수 없습니다.');
      return;
    }
    
    const criteriaId = snapshot.docs[0].id;
    console.log(`📝 문서 ID: ${criteriaId}`);
    
    const newCriteria = [
      {
        id: 'mentor_manager_collaboration',
        name: '멘토&매니저 협업',
        description: '멘토 간 협업 및 매니저와의 원활한 소통 및 협력',
        maxScore: 10,
        order: 1
      },
      {
        id: 'student_management',
        name: '학생 생활 관리',
        description: '학생들의 생활 관리 및 지도 능력',
        maxScore: 10,
        order: 2
      },
      {
        id: 'responsibility',
        name: '책임감',
        description: '맡은 역할에 대한 책임감 및 성실성',
        maxScore: 10,
        order: 3
      },
      {
        id: 'popularity',
        name: '인기도',
        description: '학생들이 이 멘토를 얼마나 좋아하고 따르는지',
        maxScore: 10,
        order: 4
      }
    ];
    
    await updateDoc(doc(db, 'evaluationCriteria', criteriaId), {
      criteria: newCriteria,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ 업데이트 완료!');
    console.log('📋 새로운 평가 항목:');
    newCriteria.forEach(item => {
      console.log(`  ${item.order}. ${item.name}`);
    });
    
    alert('평가 기준이 성공적으로 업데이트되었습니다! 페이지를 새로고침해주세요.');
  } catch (error) {
    console.error('❌ 오류:', error);
    alert('업데이트 실패: ' + error.message);
  }
};

// 실행
updateCriteria();
```

5. Enter 키를 눌러 실행
6. 완료 메시지 확인 후 페이지 새로고침

## 방법 3: Firebase Console에서 직접 수정

1. Firebase Console 접속
2. Firestore Database 선택
3. `evaluationCriteria` 컬렉션 찾기
4. `stage` 필드가 "캠프 생활"인 문서 찾기
5. `criteria` 배열을 다음으로 교체:

```json
[
  {
    "id": "mentor_manager_collaboration",
    "name": "멘토&매니저 협업",
    "description": "멘토 간 협업 및 매니저와의 원활한 소통 및 협력",
    "maxScore": 10,
    "order": 1
  },
  {
    "id": "student_management",
    "name": "학생 생활 관리",
    "description": "학생들의 생활 관리 및 지도 능력",
    "maxScore": 10,
    "order": 2
  },
  {
    "id": "responsibility",
    "name": "책임감",
    "description": "맡은 역할에 대한 책임감 및 성실성",
    "maxScore": 10,
    "order": 3
  },
  {
    "id": "popularity",
    "name": "인기도",
    "description": "학생들이 이 멘토를 얼마나 좋아하고 따르는지",
    "maxScore": 10,
    "order": 4
  }
]
```

6. `updatedAt` 필드를 현재 시간으로 업데이트
7. 저장

## 확인 방법

업데이트 후 `/admin/job-board-manage/applicants/[id]` 페이지에서:
- "캠프 생활" 단계 선택
- 평가 작성 시 새로운 항목들이 표시되는지 확인:
  1. 멘토&매니저 협업
  2. 학생 생활 관리
  3. 책임감
  4. 인기도
