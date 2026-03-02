/**
 * Firestore에 테스트 데이터를 생성하는 스크립트
 * Firebase Admin SDK를 사용하여 smis-mentor 프로젝트에 직접 연결
 */

const admin = require('firebase-admin');

// Firebase Admin 초기화 - 프로젝트 ID 직접 지정
admin.initializeApp({
  projectId: 'smis-mentor',
});

const db = admin.firestore();

async function createTestData() {
  try {
    console.log('🔄 테스트 데이터 생성 시작...');
    console.log('   프로젝트: smis-mentor');

    // 테스트 학생 데이터
    const testStudents = [
      {
        studentId: 'ST001',
        koreanName: '김테스트',
        englishName: 'Kim Test',
        gender: '남',
        grade: '고1',
        className: '1반',
        classNumber: '1',
        classMentor: '이겸수',
        unit: 'A유닛',
        unitMentor: '이겸수',
        phone: '010-1234-5678',
        parentPhone: '010-9876-5432',
        region: '서울',
        address: '서울시 강남구',
        school: '테스트고등학교',
        lastSyncedAt: admin.firestore.Timestamp.now()
      },
      {
        studentId: 'ST002',
        koreanName: '박학생',
        englishName: 'Park Student',
        gender: '여',
        grade: '고2',
        className: '2반',
        classNumber: '5',
        classMentor: '박현정',
        unit: 'A유닛',
        unitMentor: '이겸수',
        phone: '010-2222-3333',
        parentPhone: '010-4444-5555',
        region: '서울',
        address: '서울시 송파구',
        school: '샘플고등학교',
        lastSyncedAt: admin.firestore.Timestamp.now()
      },
      {
        studentId: 'ST003',
        koreanName: '이멘토',
        englishName: 'Lee Mentor',
        gender: '남',
        grade: '고1',
        className: '1반',
        classNumber: '10',
        classMentor: '이겸수',
        unit: 'B유닛',
        unitMentor: '김선생',
        phone: '010-3333-4444',
        parentPhone: '010-5555-6666',
        region: '경기',
        address: '경기도 성남시',
        school: '예제고등학교',
        lastSyncedAt: admin.firestore.Timestamp.now()
      }
    ];

    // stSheetCache 컬렉션에 E27 캠프 데이터 저장
    const cacheRef = db.collection('stSheetCache').doc('E27');
    
    await cacheRef.set({
      campCode: 'E27',
      data: testStudents,
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      syncedBy: 'test-admin',
      syncedByName: 'Test Admin',
      version: 1,
      totalStudents: testStudents.length
    });

    console.log('✅ 테스트 데이터 생성 완료!');
    console.log(`   - 캠프 코드: E27`);
    console.log(`   - 학생 수: ${testStudents.length}명`);
    console.log('');
    console.log('생성된 학생 목록:');
    testStudents.forEach((student, index) => {
      console.log(`${index + 1}. ${student.koreanName} (${student.studentId}) - 반멘토: ${student.classMentor}, 유닛: ${student.unitMentor}`);
    });

    // Firestore 데이터 확인
    const doc = await cacheRef.get();
    if (doc.exists) {
      console.log('');
      console.log('✅ Firestore 저장 확인 완료!');
      console.log(`   버전: ${doc.data().version}`);
      console.log(`   총 학생 수: ${doc.data().totalStudents}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 에러 발생:', error);
    process.exit(1);
  }
}

createTestData();
