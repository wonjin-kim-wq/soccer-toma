// app.js - 적토마 FC 메인 애플리케이션 코디네이터
// 탭 전환, 모달 제어, 모듈 간 상호작용 바인딩, Firebase 설정 관리 총괄

import { dbService } from './database.js';
import { playerRecords } from './player-records.js';
import { duesManager } from './dues-manager.js';
import { tacticalBoard } from './tactical-board.js';

class AppController {
  constructor() {
    this.currentViewId = 'view-dashboard';
  }

  async start() {
    console.log('적토마 FC 매니지먼트 시스템 기동 중...');
    
    // 1. 데이터베이스 상태 모니터링 배지 바인딩
    await dbService.init((isConnected) => {
      this.updateDbStatusBadge(isConnected);
    });

    // 2. 모듈별 생명주기 및 초기화 시작
    // 선수 데이터 갱신 시 -> 회비 매니저에 즉각 플레이어 목록 갱신 연계 바인딩
    playerRecords.init(async (playersList) => {
      await duesManager.updatePlayersList(playersList);
    });
    
    duesManager.init();
    tacticalBoard.init();

    // 3. 글로벌 UI 이벤트 바인딩
    this.setupViewNavigation();
    this.setupModalEvents();
    this.setupFirebaseConfigEvents();
    this.setupTacticalPanelEvents();

    console.log('적토마 FC 시스템 준비 완료!');
  }

  // 데이터베이스 연결 배지 업데이트
  updateDbStatusBadge(isConnected) {
    const badge = document.getElementById('db-status-badge');
    const text = document.getElementById('db-status-text');

    if (!badge || !text) return;

    if (isConnected) {
      badge.className = 'status-badge connected';
      text.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Firebase 동기화';
    } else {
      badge.className = 'status-badge disconnected';
      text.innerHTML = '<i class="fa-solid fa-hard-drive"></i> 로컬 저장 모드';
    }
  }

  // 탭 네비게이션 제어
  setupViewNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    const headerTitle = document.getElementById('header-title');

    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const targetViewId = item.dataset.target;
        if (!targetViewId) return;

        // 1. 활성 탭 하이라이트 전환
        menuItems.forEach(mi => mi.classList.remove('active'));
        item.classList.add('active');

        // 2. 활성 뷰 영역 토글
        const views = document.querySelectorAll('.content-view');
        views.forEach(v => v.classList.remove('active'));
        
        const targetView = document.getElementById(targetViewId);
        if (targetView) targetView.classList.add('active');

        // 3. 헤더 타이틀 매칭 변경
        headerTitle.textContent = item.querySelector('span').textContent;

        // 4. 스포티한 추가 전술판 대응: 탭이 전술판이 되면 캔버스 크기 맞춤 갱신
        if (targetViewId === 'view-tactics') {
          setTimeout(() => {
            tacticalBoard.resizeCanvas();
          }, 50);
        }

        // 5. 탭 이동 시 최신 통계 및 데이터 리프레시 반영
        if (targetViewId === 'view-dashboard') {
          playerRecords.updateDashboardStats();
          tacticalBoard.loadSavedTacticsList();
        }
      });
    });
  }

  // 공통 모달 열기/닫기 이벤트 바인딩
  setupModalEvents() {
    // 닫기 트리거 등록
    const closeBtns = document.querySelectorAll('[data-close]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
      });
    });

    // 외부 바인딩 모달 배경 클릭 시 닫기
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

    // 설정 모달 열기 버튼 바인딩
    const btnOpenSettings = document.getElementById('btn-open-settings');
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }
  }

  // Firebase 설정 모달 작동 핸들러
  openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    const config = dbService.getFirebaseConfig();

    if (config) {
      document.getElementById('fb-apiKey').value = config.apiKey || '';
      document.getElementById('fb-projectId').value = config.projectId || '';
      document.getElementById('fb-appId').value = config.appId || '';
      document.getElementById('fb-authDomain').value = config.authDomain || '';
    } else {
      document.getElementById('fb-apiKey').value = '';
      document.getElementById('fb-projectId').value = '';
      document.getElementById('fb-appId').value = '';
      document.getElementById('fb-authDomain').value = '';
    }

    if (modal) modal.classList.add('active');
  }

  setupFirebaseConfigEvents() {
    const form = document.getElementById('firebase-config-form');
    const btnClear = document.getElementById('btn-clear-settings');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const apiKey = document.getElementById('fb-apiKey').value.trim();
        const projectId = document.getElementById('fb-projectId').value.trim();
        const appId = document.getElementById('fb-appId').value.trim();
        const authDomain = document.getElementById('fb-authDomain').value.trim();

        const config = { apiKey, projectId, appId };
        if (authDomain) config.authDomain = authDomain;

        try {
          alert('Firebase 연결 및 동기화를 시작합니다. 잠시만 기다려주세요...');
          await dbService.saveFirebaseConfig(config);
          
          alert('Firebase가 성공적으로 연동되었으며 기존 로컬 데이터가 동기화되었습니다!');
          
          // 모달 닫고 시스템 리로드
          document.getElementById('modal-settings').classList.remove('active');
          location.reload(); // 리로딩하여 모든 모듈 최신 커넥션 기준으로 재수립
        } catch (error) {
          alert('Firebase 연동 실패! 입력한 세부 정보를 다시 확인해주세요.\n오류: ' + error.message);
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Firebase 설정을 제거하고 로컬 전용 저장 모드로 복구하시겠습니까? 데이터는 로컬 브라우저에 보존됩니다.')) {
          dbService.clearFirebaseConfig();
          alert('Firebase 연동 정보가 삭제되었으며 로컬 모드로 전환되었습니다.');
          document.getElementById('modal-settings').classList.remove('active');
          location.reload();
        }
      });
    }
  }

  // 전술판 제어 관련 추가 글로벌 이벤트 바인딩
  setupTacticalPanelEvents() {
    const selectFormation = document.getElementById('formation-select');
    const btnApply = document.getElementById('btn-apply-formation');
    const btnOpenSaveTactic = document.getElementById('btn-save-tactic-modal');
    const formSaveTactic = document.getElementById('tactic-save-form');

    if (btnApply && selectFormation) {
      btnApply.addEventListener('click', () => {
        const formation = selectFormation.value;
        tacticalBoard.applyFormation(formation);
        alert(`포메이션 [${formation}] 배치가 적용되었습니다.`);
      });
    }

    // 전술 패턴 저장 모달 오픈
    if (btnOpenSaveTactic) {
      btnOpenSaveTactic.addEventListener('click', () => {
        document.getElementById('tactic-name').value = '';
        document.getElementById('modal-tactic-save').classList.add('active');
      });
    }

    // 전술 패턴 제출 완료
    if (formSaveTactic) {
      formSaveTactic.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('tactic-name').value.trim();
        if (!name) return;

        await tacticalBoard.saveTactic(name);
        alert(`'${name}' 전술이 정상적으로 저장되었습니다!`);
        document.getElementById('modal-tactic-save').classList.remove('active');
      });
    }
  }
}

// 브라우저 돔 로딩 완료 시 앱 실행
document.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.start();
});
