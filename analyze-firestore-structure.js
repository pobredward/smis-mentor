// Firestore 데이터 구조 분석 스크립트
const admin = require('firebase-admin');

// Firebase Admin 초기화 (이미 되어있다면 생략)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function analyzeUserDataStructure() {
  console.log('🔍 Firestore 사용자 데이터 구조 분석 시작...\n');

  const usersSnapshot = await db.collection('users').limit(10).get();
  
  console.log(`총 ${usersSnapshot.size}명의 사용자 샘플 분석:\n`);
  
  const results = [];
  
  usersSnapshot.forEach((doc) => {
    const data = doc.data();
    const analysis = {
      '문서 ID': doc.id,
      'userId 필드': data.userId || 'undefined',
      'id 필드': data.id || 'undefined',
      'email': data.email,
      'status': data.status,
      'role': data.role,
      'authProviders': data.authProviders?.map(p => p.providerId).join(', ') || 'none',
      '일치 여부': {
        'docId === userId': doc.id === data.userId,
        'docId === id': doc.id === data.id,
        'userId === id': data.userId === data.id,
      }
    };
    results.push(analysis);
  });

  // 결과 출력
  results.forEach((result, index) => {
    console.log(`\n[유저 ${index + 1}]`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📄 문서 ID: ${result['문서 ID']}`);
    console.log(`🆔 userId 필드: ${result['userId 필드']}`);
    console.log(`🔖 id 필드: ${result['id 필드']}`);
    console.log(`📧 email: ${result['email']}`);
    console.log(`📊 status: ${result['status']} | role: ${result['role']}`);
    console.log(`🔗 authProviders: ${result['authProviders']}`);
    console.log(`\n✅ 일치 여부:`);
    console.log(`   문서ID === userId: ${result['일치 여부']['docId === userId']}`);
    console.log(`   문서ID === id: ${result['일치 여부']['docId === id']}`);
    console.log(`   userId === id: ${result['일치 여부']['userId === id']}`);
  });

  // 통계
  const stats = {
    total: results.length,
    docIdMatchesUserId: results.filter(r => r['일치 여부']['docId === userId']).length,
    docIdMatchesId: results.filter(r => r['일치 여부']['docId === id']).length,
    allMatch: results.filter(r => 
      r['일치 여부']['docId === userId'] && 
      r['일치 여부']['docId === id']
    ).length,
  };

  console.log('\n\n📊 통계 요약');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`총 사용자: ${stats.total}명`);
  console.log(`문서ID = userId: ${stats.docIdMatchesUserId}명 (${(stats.docIdMatchesUserId/stats.total*100).toFixed(1)}%)`);
  console.log(`문서ID = id: ${stats.docIdMatchesId}명 (${(stats.docIdMatchesId/stats.total*100).toFixed(1)}%)`);
  console.log(`모두 일치: ${stats.allMatch}명 (${(stats.allMatch/stats.total*100).toFixed(1)}%)`);

  // architronic00@naver.com 특별 조회
  console.log('\n\n🔎 architronic00@naver.com 특별 조회');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const naverUserSnapshot = await db.collection('users').where('email', '==', 'architronic00@naver.com').get();
  if (!naverUserSnapshot.empty) {
    const doc = naverUserSnapshot.docs[0];
    const data = doc.data();
    console.log(`📄 문서 ID: ${doc.id}`);
    console.log(`🆔 userId 필드: ${data.userId}`);
    console.log(`🔖 id 필드: ${data.id}`);
    console.log(`🔗 authProviders: ${data.authProviders?.map(p => p.providerId).join(', ')}`);
    console.log(`\n분석:`);
    console.log(`   문서ID === userId: ${doc.id === data.userId}`);
    console.log(`   문서ID === id: ${doc.id === data.id}`);
  }
}

analyzeUserDataStructure().catch(console.error);
