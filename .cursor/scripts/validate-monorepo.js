#!/usr/bin/env node

/**
 * 모노레포 아키텍처 검증 스크립트
 * Cursor Agent가 코드 변경 후 실행할 수 있는 검증 도구
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
const SHARED_DIR = path.join(PACKAGES_DIR, 'shared');
const WEB_DIR = path.join(PACKAGES_DIR, 'web');
const MOBILE_DIR = path.join(PACKAGES_DIR, 'mobile');
const FUNCTIONS_DIR = path.join(ROOT_DIR, 'functions');

class MonorepoValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  // 1. 패키지 구조 검증
  validatePackageStructure() {
    const requiredDirs = [SHARED_DIR, WEB_DIR, MOBILE_DIR, FUNCTIONS_DIR];
    
    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        this.errors.push(`필수 디렉터리가 없습니다: ${dir}`);
      }
    });

    // package.json 존재 확인
    const requiredPackageJsons = [
      path.join(ROOT_DIR, 'package.json'),
      path.join(SHARED_DIR, 'package.json'),
      path.join(WEB_DIR, 'package.json'),
      path.join(MOBILE_DIR, 'package.json'),
      path.join(FUNCTIONS_DIR, 'package.json'),
    ];

    requiredPackageJsons.forEach(packageJsonPath => {
      if (!fs.existsSync(packageJsonPath)) {
        this.errors.push(`필수 package.json이 없습니다: ${packageJsonPath}`);
      }
    });
  }

  // 2. 의존성 방향 검증
  validateDependencyDirection() {
    try {
      const sharedPackageJson = JSON.parse(
        fs.readFileSync(path.join(SHARED_DIR, 'package.json'), 'utf8')
      );

      // shared가 web/mobile을 의존하는지 검사
      const dependencies = {
        ...sharedPackageJson.dependencies,
        ...sharedPackageJson.devDependencies
      };

      Object.keys(dependencies).forEach(dep => {
        if (dep.includes('@smis-mentor/web') || dep.includes('@smis-mentor/mobile')) {
          this.errors.push(`❌ 의존성 방향 위반: shared가 ${dep}를 의존하고 있습니다`);
        }

        // 플랫폼 특화 라이브러리 검사
        const webOnlyLibs = ['next', 'react-hot-toast', '@next/', 'next-'];
        const mobileOnlyLibs = ['expo', 'react-native', '@react-navigation', '@expo/'];
        
        webOnlyLibs.forEach(lib => {
          if (dep.includes(lib)) {
            this.errors.push(`❌ 플랫폼 특화 라이브러리: shared가 웹 전용 라이브러리 ${dep}를 사용합니다`);
          }
        });

        mobileOnlyLibs.forEach(lib => {
          if (dep.includes(lib)) {
            this.errors.push(`❌ 플랫폼 특화 라이브러리: shared가 모바일 전용 라이브러리 ${dep}를 사용합니다`);
          }
        });
      });

    } catch (error) {
      this.errors.push(`shared/package.json 읽기 실패: ${error.message}`);
    }
  }

  // 3. 중복 코드 감지
  detectDuplicateCode() {
    const webSrcDir = path.join(WEB_DIR, 'src');
    const mobileSrcDir = path.join(MOBILE_DIR, 'src');

    if (!fs.existsSync(webSrcDir) || !fs.existsSync(mobileSrcDir)) {
      return;
    }

    const webFiles = this.getJsFiles(webSrcDir);
    const mobileFiles = this.getJsFiles(mobileSrcDir);

    // 동일한 파일명 검사
    webFiles.forEach(webFile => {
      const webBasename = path.basename(webFile);
      mobileFiles.forEach(mobileFile => {
        const mobileBasename = path.basename(mobileFile);
        
        if (webBasename === mobileBasename && 
            webBasename !== 'index.ts' && 
            webBasename !== 'index.tsx') {
          this.warnings.push(`⚠️ 중복 파일명 발견: ${webBasename} (web/mobile 모두 존재)`);
        }
      });
    });
  }

  // 4. 내부 패키지 참조 검증
  validateInternalReferences() {
    const packagesToCheck = [
      { name: 'web', dir: WEB_DIR },
      { name: 'mobile', dir: MOBILE_DIR },
      { name: 'functions', dir: FUNCTIONS_DIR }
    ];

    packagesToCheck.forEach(({ name, dir }) => {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
        );

        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        Object.entries(deps).forEach(([depName, version]) => {
          if (depName === '@smis-mentor/shared') {
            if (!version.startsWith('file:')) {
              this.errors.push(`❌ ${name}: @smis-mentor/shared는 file: 프로토콜을 사용해야 합니다`);
            }
          }
        });

      } catch (error) {
        this.errors.push(`${name}/package.json 읽기 실패: ${error.message}`);
      }
    });
  }

  // 5. 빌드 스크립트 검증
  validateBuildScripts() {
    try {
      const rootPackageJson = JSON.parse(
        fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')
      );

      const requiredScripts = [
        'dev:setup',
        'build:shared',
        'build:all',
        'build:parallel'
      ];

      requiredScripts.forEach(script => {
        if (!rootPackageJson.scripts || !rootPackageJson.scripts[script]) {
          this.errors.push(`❌ 필수 빌드 스크립트가 없습니다: ${script}`);
        }
      });

      // shared 의존성 검증
      const buildAll = rootPackageJson.scripts?.['build:all'];
      if (buildAll && !buildAll.includes('build:shared')) {
        this.warnings.push(`⚠️ build:all이 build:shared 의존성을 포함하지 않을 수 있습니다`);
      }

    } catch (error) {
      this.errors.push(`루트 package.json 읽기 실패: ${error.message}`);
    }
  }

  // 유틸리티: JS/TS 파일 재귀적으로 찾기
  getJsFiles(dir) {
    const files = [];
    
    if (!fs.existsSync(dir)) return files;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    items.forEach(item => {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.next') {
        files.push(...this.getJsFiles(fullPath));
      } else if (item.isFile() && /\.(ts|tsx|js|jsx)$/.test(item.name)) {
        files.push(fullPath);
      }
    });
    
    return files;
  }

  // 전체 검증 실행
  validate() {
    console.log('🔍 모노레포 아키텍처 검증 시작...\n');

    this.validatePackageStructure();
    this.validateDependencyDirection();
    this.detectDuplicateCode();
    this.validateInternalReferences();
    this.validateBuildScripts();

    // 결과 출력
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ 모노레포 아키텍처 검증 통과!\n');
      return true;
    }

    if (this.errors.length > 0) {
      console.log('❌ 오류 발견:');
      this.errors.forEach(error => console.log(`  ${error}`));
      console.log();
    }

    if (this.warnings.length > 0) {
      console.log('⚠️ 경고사항:');
      this.warnings.forEach(warning => console.log(`  ${warning}`));
      console.log();
    }

    console.log('💡 해결 방법은 .cursor/rules/monorepo-architecture.md를 참고하세요.\n');

    return this.errors.length === 0;
  }
}

// 스크립트 실행
if (require.main === module) {
  const validator = new MonorepoValidator();
  const isValid = validator.validate();
  process.exit(isValid ? 0 : 1);
}

module.exports = MonorepoValidator;