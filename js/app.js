// app.js - 적토마 FC 메인 애플리케이션 코디네이터
// 탭 전환, 모달 제어, 모듈 간 상호작용 바인딩, Firebase 설정 관리 총괄

import { dbService } from './database.js';
import { playerRecords } from './player-records.js';
import { duesManager } from './dues-manager.js';
import { tacticalBoard } from './tactical-board.js';
import { schedulerService } from './scheduler.js'; // [NEW] 경기 일정 관리자
import { feedbackManager } from './feedback-manager.js'; // [NEW] 개인 피드백 관리자
import { matchFeedbackManager } from './match-feedback.js'; // [NEW] 경기 피드백 관리자

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
    // 선수 데이터 갱신 시 -> 회비 매니저 및 피드백 매니저에 즉각 플레이어 목록 갱신 연계 바인딩
    playerRecords.init(async (playersList) => {
      await duesManager.updatePlayersList(playersList);
      await feedbackManager.updatePlayersList(playersList);
      this.updateVotingPlayersList(playersList); // [NEW] 투표용 선수 목록 동적 반영
      this.updateLineupPlayersList(playersList); // [NEW] 선발 라인업 선수 목록 동적 반영
    });
    
    duesManager.init();
    tacticalBoard.init();
    feedbackManager.init();
    matchFeedbackManager.init(); // [NEW] 경기 피드백 매니저 초기화
    
    // [NEW] 경기 일정 서비스 모듈 구동
    // 일정이 추가되거나 변경되면 -> 대시보드 상단 D-Day, 투표, 선발 라인업 위젯 갱신
    await schedulerService.init((schedules) => {
      this.updateDashboardDday(schedules);
      this.checkDashboardVoting(schedules); // [NEW] 베스트/워스트 투표 가용성 체크
      this.checkDashboardLineup(schedules); // [NEW] 선발 라인업 가용성 체크
      matchFeedbackManager.updateSchedulesList(schedules); // [NEW] 피드백 경기 리스트 갱신
    });

    // 3. 글로벌 UI 이벤트 바인딩
    this.setupViewNavigation();
    this.setupModalEvents();
    this.setupFirebaseConfigEvents();
    this.setupTacticalPanelEvents();
    this.setupDdayShortcutEvents(); // [NEW] 바로가기 바인딩

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
          schedulerService.loadSchedules(); // 일정 최신화 유도
        }

        if (targetViewId === 'view-schedule') {
          schedulerService.render();
        }

        if (targetViewId === 'view-match-feedback') {
          schedulerService.loadSchedules();
        }
      });
    });
  }

  // [NEW] 대시보드 다음 경기 D-Day 실시간 카드 연산 모듈
  updateDashboardDday(schedules) {
    const ddayBadge = document.getElementById('dday-badge');
    const ddayOpponent = document.getElementById('dday-opponent');
    const ddayDatetime = document.getElementById('dday-datetime');
    const ddayLocation = document.getElementById('dday-location');

    if (!ddayBadge || !ddayOpponent || !ddayDatetime || !ddayLocation) return;

    // 오늘 날짜 포맷팅 (시, 분, 초 제거하여 순수 날짜 기준 계산)
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 오늘 포함 미래의 경기 일정 필터링
    const upcoming = schedules.filter(s => s.date >= todayStr);

    if (upcoming.length === 0) {
      // 1) 경기 일정이 전혀 없을 경우 플레이스홀더 출력
      ddayBadge.textContent = '대기';
      ddayBadge.style.background = 'linear-gradient(135deg, var(--text-muted) 0%, #334155 100%)';
      ddayBadge.style.boxShadow = 'none';
      ddayOpponent.textContent = '예정된 경기 일정이 없습니다.';
      ddayDatetime.textContent = '일정 관리 탭으로 이동해서 새 경기를 추가해보세요!';
      ddayLocation.textContent = '미정';
      return;
    }

    // 시간순으로 정렬되었으므로, 가장 첫 인덱스가 가장 가까운 경기
    const nextMatch = upcoming[0];

    // D-Day 연산
    const todayDate = new Date(todayStr + 'T00:00:00');
    const matchDate = new Date(nextMatch.date + 'T00:00:00');
    const diffTime = matchDate - todayDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // 요일 구하기
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[new Date(nextMatch.date).getDay()];

    // 배지 텍스트 렌더링
    if (diffDays === 0) {
      ddayBadge.textContent = 'D-DAY';
      ddayBadge.style.background = 'linear-gradient(135deg, var(--danger) 0%, #DC2626 100%)';
      ddayBadge.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)';
    } else {
      ddayBadge.textContent = `D-${diffDays}`;
      ddayBadge.style.background = 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)';
      ddayBadge.style.boxShadow = '0 4px 15px rgba(245, 158, 11, 0.3)';
    }

    // 상대 팀 정보
    ddayOpponent.textContent = `상대: ${nextMatch.opponent}`;
    ddayDatetime.textContent = `${nextMatch.date.replace(/-/g, '년 ')}일 (${dayName}) ${nextMatch.time}`;
    ddayLocation.textContent = nextMatch.location;
  }

  // [NEW] 대시보드 D-Day 카드 내부 바로가기 버튼 바인딩
  setupDdayShortcutEvents() {
    const btnGo = document.getElementById('btn-dday-go-schedule');
    if (btnGo) {
      btnGo.addEventListener('click', () => {
        const scheduleTabMenu = document.querySelector('.menu-item[data-target="view-schedule"]');
        if (scheduleTabMenu) {
          scheduleTabMenu.click();
        }
      });
    }
  }

  // 공통 모달 열기/닫기 이벤트 바인딩
  setupModalEvents() {
    const closeBtns = document.querySelectorAll('[data-close]');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
      });
    });

    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

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
          
          document.getElementById('modal-settings').classList.remove('active');
          location.reload();
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

    if (btnOpenSaveTactic) {
      btnOpenSaveTactic.addEventListener('click', () => {
        document.getElementById('tactic-name').value = '';
        document.getElementById('modal-tactic-save').classList.add('active');
      });
    }

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

  // [NEW] 대시보드 베스트 & 워스트 투표 1주일간 노출 체크 모듈
  async checkDashboardVoting(schedules) {
    const votingContainer = document.getElementById('dashboard-voting-container');
    const votingTitle = document.getElementById('voting-match-title');
    const votingForm = document.getElementById('dashboard-voting-form');
    const votingResults = document.getElementById('dashboard-voting-results');

    if (!votingContainer || !votingTitle || !votingForm || !votingResults) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr + 'T00:00:00');

    // 최근 치른 경기 중 오늘 기준 일주일(7일) 이내 경기 찾기 (date <= 오늘 && date >= 오늘 - 7일)
    const pastMatches = schedules.filter(s => {
      if (s.date > todayStr) return false;
      const matchDate = new Date(s.date + 'T00:00:00');
      const diffTime = today - matchDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });

    if (pastMatches.length === 0) {
      votingContainer.style.display = 'block';
      votingContainer.classList.add('widget-inactive');
      votingTitle.innerHTML = `<i class="fa-solid fa-lock" style="margin-right: 6px;"></i> 베스트/워스트 투표는 경기가 끝난 후에 활성화됩니다.`;
      votingForm.style.display = 'flex';
      votingResults.style.display = 'none';
      
      // 비활성 시 클릭 핸들러 (중복 바인딩 방지)
      if (votingContainer.dataset.clickBound !== 'true') {
        votingContainer.dataset.clickBound = 'true';
        votingContainer.addEventListener('click', () => {
          if (votingContainer.classList.contains('widget-inactive')) {
            alert('🗳️ 베스트/워스트 투표는 경기가 끝난 후 일주일(7일) 동안만 활성화되어 참여하실 수 있습니다!');
          }
        });
      }
      return;
    }

    // 가장 최근의 과거 경기 1개 타겟 지정
    pastMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
    const targetMatch = pastMatches[0];

    votingContainer.classList.remove('widget-inactive');
    votingContainer.style.display = 'block';
    
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[new Date(targetMatch.date).getDay()];
    votingTitle.innerHTML = `⭐ <strong>${targetMatch.date.replace(/-/g, '/')} (${dayName}) 상대: ${targetMatch.opponent}</strong> 경기 베스트/워스트 투표가 진행 중입니다! (경기 후 7일간 활성)`;

    // 이미 투표했는지 여부 판단 (LocalStorage에 jeoktoma_voted_MATCHID 키 검사)
    const hasVoted = localStorage.getItem(`jeoktoma_voted_${targetMatch.id}`);
    
    if (hasVoted) {
      votingForm.style.display = 'none';
      votingResults.style.display = 'flex';
      await this.renderVotingResults(targetMatch.id);
    } else {
      votingForm.style.display = 'flex';
      votingResults.style.display = 'none';
      this.setupVotingFormSubmit(targetMatch.id);
    }
  }

  // 투표 폼 제출 설정
  setupVotingFormSubmit(matchId) {
    const votingForm = document.getElementById('dashboard-voting-form');
    const votingResults = document.getElementById('dashboard-voting-results');

    if (!votingForm) return;

    if (votingForm.dataset.listenerBound === 'true') return;
    votingForm.dataset.listenerBound = 'true';

    votingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const bestSelect = document.getElementById('vote-best-select');
      const worstSelect = document.getElementById('vote-worst-select');

      if (!bestSelect || !worstSelect) return;

      const bestId = bestSelect.value;
      const worstId = worstSelect.value;

      if (!bestId || !worstId) {
        alert('베스트와 워스트 선수를 모두 선택해 주세요.');
        return;
      }

      if (bestId === worstId) {
        alert('베스트 선수와 워스트 선수는 동일인으로 선택할 수 없습니다.');
        return;
      }

      try {
        await dbService.submitVote(matchId, bestId, worstId);
        
        // 투표 로컬 플래그 마킹
        localStorage.setItem(`jeoktoma_voted_${matchId}`, 'true');
        
        alert('투표가 소중하게 반영되었습니다! 실시간 결과를 확인해보세요.');
        
        // UI 변경 및 결과 렌더링
        votingForm.style.display = 'none';
        votingResults.style.display = 'flex';
        await this.renderVotingResults(matchId);

      } catch (err) {
        console.error(err);
        alert('투표 반영 중 오류가 발생했습니다: ' + err.message);
      }
    });
  }

  // 투표용 선수 드롭다운 셀렉트 채우기
  updateVotingPlayersList(playersList) {
    this.cachedPlayers = playersList;
    const bestSelect = document.getElementById('vote-best-select');
    const worstSelect = document.getElementById('vote-worst-select');

    if (!bestSelect || !worstSelect) return;

    const placeholder = '<option value="" disabled selected>선수 선택...</option>';
    const optionsHtml = playersList.map(p => {
      return `<option value="${p.id}">${p.name} (#${p.backNumber} - ${p.position})</option>`;
    }).join('');

    bestSelect.innerHTML = placeholder + optionsHtml;
    worstSelect.innerHTML = placeholder + optionsHtml;
  }

  // 실시간 투표 득표율 시각화 렌더링 (퍼센트 그라데이션 바)
  async renderVotingResults(matchId) {
    const bestResultsList = document.getElementById('vote-best-results-list');
    const worstResultsList = document.getElementById('vote-worst-results-list');

    if (!bestResultsList || !worstResultsList || !this.cachedPlayers) return;

    const votesData = await dbService.getVotes(matchId);
    const bestVotes = votesData.best || {};
    const worstVotes = votesData.worst || {};

    let totalBestCount = 0;
    let totalWorstCount = 0;

    for (const pid in bestVotes) totalBestCount += (bestVotes[pid] || 0);
    for (const pid in worstVotes) totalWorstCount += (worstVotes[pid] || 0);

    const bestRank = this.cachedPlayers.map(p => {
      const count = bestVotes[p.id] || 0;
      const rate = totalBestCount > 0 ? Math.round((count / totalBestCount) * 100) : 0;
      return { player: p, count, rate };
    }).sort((a, b) => b.count - a.count).slice(0, 3);

    const worstRank = this.cachedPlayers.map(p => {
      const count = worstVotes[p.id] || 0;
      const rate = totalWorstCount > 0 ? Math.round((count / totalWorstCount) * 100) : 0;
      return { player: p, count, rate };
    }).sort((a, b) => b.count - a.count).slice(0, 3);

    bestResultsList.innerHTML = bestRank.map((item, index) => {
      const rankBadge = index === 0 ? '👑 MOM' : `${index + 1}위`;
      return `
        <div class="vote-progress-wrapper">
          <div class="vote-progress-header">
            <span style="font-weight: 800; color: #fff;">${rankBadge} ${item.player.name} <span style="font-size:0.7rem; color:var(--text-muted); font-weight:500;">#${item.player.backNumber}</span></span>
            <span style="color: var(--primary); font-weight: 800;">${item.rate}% (${item.count}표)</span>
          </div>
          <div class="vote-progress-bar-bg">
            <div class="vote-progress-bar-fill best" style="width: ${item.rate}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    worstResultsList.innerHTML = worstRank.map((item, index) => {
      const rankBadge = `${index + 1}위`;
      return `
        <div class="vote-progress-wrapper">
          <div class="vote-progress-header">
            <span style="font-weight: 800; color: #fff;">${rankBadge} ${item.player.name} <span style="font-size:0.7rem; color:var(--text-muted); font-weight:500;">#${item.player.backNumber}</span></span>
            <span style="color: var(--danger); font-weight: 800;">${item.rate}% (${item.count}표)</span>
          </div>
          <div class="vote-progress-bar-bg">
            <div class="vote-progress-bar-fill worst" style="width: ${item.rate}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // [NEW] 대시보드 선발 라인업 스케줄러 노출 체크 모듈
  async checkDashboardLineup(schedules) {
    const container = document.getElementById('dashboard-lineup-container');
    const title = document.getElementById('lineup-match-title');
    if (!container || !title) return;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr + 'T00:00:00');
    
    // 7 days upcoming window (today <= date <= today + 7)
    const upcoming = schedules.filter(s => {
      if (s.date < todayStr) return false;
      const matchDate = new Date(s.date + 'T00:00:00');
      const diffTime = matchDate - today;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (upcoming.length === 0) {
      container.style.display = 'block';
      container.classList.add('widget-inactive');
      title.innerHTML = `<i class="fa-solid fa-lock" style="margin-right: 6px;"></i> 선발 라인업 빌더는 경기 일주일 전부터 활성화됩니다.`;
      
      // 비활성 시 클릭 핸들러 (중복 바인딩 방지)
      if (container.dataset.clickBound !== 'true') {
        container.dataset.clickBound = 'true';
        container.addEventListener('click', () => {
          if (container.classList.contains('widget-inactive')) {
            alert('⚽ 경기 선발 라인업은 예정된 경기 일주일(7일) 전부터 활성화되어 직접 배치하실 수 있습니다!');
          }
        });
      }
      return;
    }
    
    container.classList.remove('widget-inactive');
    const targetMatch = upcoming[0];
    container.style.display = 'block';
    
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[new Date(targetMatch.date).getDay()];
    title.innerHTML = `⚽ <strong>${targetMatch.date.replace(/-/g, '/')} (${dayName}) 상대: ${targetMatch.opponent}</strong> 경기 선발 라인업을 배치해 주세요. (경기 일주일 전 활성)`;
    
    this.currentLineupMatchId = targetMatch.id;
    await this.restoreLineup(targetMatch.id);
  }

  // 선발 라인업 드롭다운 채우기
  updateLineupPlayersList(playersList) {
    this.cachedPlayers = playersList;
    const selects = document.querySelectorAll('.mini-pitch .node-select');
    selects.forEach(select => {
      const pos = select.dataset.position;
      const placeholder = `<option value="" disabled selected>${pos.toUpperCase()}</option>`;
      const options = playersList.map(p => `<option value="${p.id}">${p.name} (#${p.backNumber})</option>`).join('');
      select.innerHTML = placeholder + options + `<option value="none">선택 안함</option>`;
      
      if (select.dataset.listenerBound !== 'true') {
        select.dataset.listenerBound = 'true';
        select.addEventListener('change', () => this.autoSaveLineup());
      }
    });
    
    // 비동기 레이스 컨디션 방지: 이미 경기 ID가 활성화된 경우 로딩된 선수 옵션들에 맞춰 선택 상태 복원
    if (this.currentLineupMatchId) {
      this.restoreLineup(this.currentLineupMatchId);
    }
  }

  // 기존 저장된 라인업 복원
  async restoreLineup(matchId) {
    const playersData = await dbService.getLineup(matchId);
    const selects = document.querySelectorAll('.mini-pitch .node-select');
    selects.forEach(select => {
      const pos = select.dataset.position;
      select.value = playersData[pos] || '';
    });
  }

  // 선발 라인업 자동 실시간 저장
  async autoSaveLineup() {
    if (!this.currentLineupMatchId) return;
    const playersData = {};
    const selects = document.querySelectorAll('.mini-pitch .node-select');
    selects.forEach(select => {
      const pos = select.dataset.position;
      if (select.value && select.value !== 'none') {
        playersData[pos] = select.value;
      } else {
        playersData[pos] = '';
      }
    });
    await dbService.saveLineup(this.currentLineupMatchId, playersData);
  }
}

// 브라우저 돔 로딩 완료 시 앱 실행
document.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.start();
});
