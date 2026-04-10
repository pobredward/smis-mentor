/**
 * 앱 설정 초기 데이터 생성 스크립트
 * 
 * 사용법:
 * node scripts/init-app-config.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin 초기화
const serviceAccountPath = path.join(__dirname, '../functions/serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const DEFAULT_LOADING_QUOTES = [
  '오늘도 학생들과 함께 성장하는 하루 되세요 ✨',
  '멘토링의 순간들이 모여 특별한 여름을 만듭니다 🌟',
  '작은 관심 하나가 학생들에게 큰 힘이 됩니다 💪',
  '함께 배우고 성장하는 SMIS 캠프 🎓',
  '학생들의 꿈을 응원하는 멘토가 되어주세요 🌈',
  '매일매일이 새로운 배움의 기회입니다 📚',
  '긍정적인 에너지로 캠프를 가득 채워주세요 ⚡',
  '학생들과의 소통이 가장 큰 보람입니다 💬',
  '오늘도 최선을 다하는 여러분을 응원합니다 🙌',
  '즐거운 캠프 생활 되세요! 화이팅! 🔥',
];

async function initAppConfig() {
  try {
    console.log('🚀 앱 설정 초기화 시작...');

    const configRef = db.collection('appConfig').doc('main');
    const configDoc = await configRef.get();

    if (configDoc.exists()) {
      console.log('⚠️ 앱 설정이 이미 존재합니다. 덮어쓰시겠습니까? (yes/no)');
      
      // 간단한 확인 (프로덕션에서는 더 나은 방법 사용)
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('덮어쓰기? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes') {
          await createConfig(configRef);
        } else {
          console.log('❌ 작업이 취소되었습니다.');
        }
        rl.close();
        process.exit(0);
      });
    } else {
      await createConfig(configRef);
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ 에러 발생:', error);
    process.exit(1);
  }
}

async function createConfig(configRef) {
  await configRef.set({
    loadingQuotes: DEFAULT_LOADING_QUOTES,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'system',
  });

  console.log('✅ 앱 설정이 성공적으로 생성되었습니다!');
  console.log(`📦 로딩 문구 ${DEFAULT_LOADING_QUOTES.length}개가 추가되었습니다.`);
}

initAppConfig();
