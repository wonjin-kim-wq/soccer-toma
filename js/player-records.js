// player-records.js - 적토마 FC 선수 기록 관리 및 시각 리더보드 모듈
// 선수 CRUD, 테이블 내 스탯 즉각 증감 (+/-), 검색/필터링, 득점왕/도움왕 통계 연동

import { dbService } from './database.js';

class PlayerRecords {
  constructor() {
    this.tableBody = document.getElementById('player-table-body');
    this.searchEl = document.getElementById('player-search');
    this.positionFilterEl = document.getElementById('player-position-filter');
    
    this.players = [];
    this.searchQuery = '';
    this.positionFilter = 'ALL';
    
    // 모달 엘리먼트
    this.modal = document.getElementById('modal-player');
    this.form = document.getElementById('player-form');
    this.modalTitle = document.getElementById('player-modal-title');
    
    this.onPlayersUpdateCallback = null;
  }

  // 초기화 및 리스너 등록
  init(onPlayersUpdate = null) {
    if (onPlayersUpdate) {
      this.onPlayersUpdateCallback = onPlayersUpdate;
    }

    this.loadPlayers();

    // 검색 및 필터 이벤트 바인딩
    if (this.searchEl) {
      this.searchEl.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderPlayerTable();
      });
    }

    if (this.positionFilterEl) {
      this.positionFilterEl.addEventListener('change', (e) => {
        this.positionFilter = e.target.value;
        this.renderPlayerTable();
      });
    }

    // 신규 선수 추가 모달 열기
    const btnAdd = document.getElementById('btn-add-player');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        this.openAddModal();
      });
    }

    // 선수 폼 서밋 핸들러
    if (this.form) {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleFormSubmit();
      });
    }
  }

  // 데이터 로드
  async loadPlayers() {
    this.players = await dbService.getPlayers();
    this.renderPlayerTable();
    this.updateDashboardStats();
    if (this.onPlayersUpdateCallback) {
      this.onPlayersUpdateCallback(this.players);
    }
  }

  // 테이블 렌더링
  renderPlayerTable() {
    if (!this.tableBody) return;

    // 필터링 적용
    const filtered = this.players.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      const matchPosition = this.positionFilter === 'ALL' || p.position === this.positionFilter;
      return matchSearch && matchPosition;
    });

    if (filtered.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            조건에 맞는 선수가 없습니다. 신규 선수를 추가해보세요!
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = filtered.map(p => `
      <tr data-id="${p.id}">
        <!-- 선수 이름 -->
        <td>
          <div class="player-info-cell">
            <div class="avatar">${p.name.substring(0, 1)}</div>
            <div>
              <div class="leader-name">${p.name}</div>
            </div>
          </div>
        </td>
        <!-- 등번호 -->
        <td style="text-align: center; font-weight: 700; color: var(--text-secondary);">
          ${p.backNumber}번
        </td>
        <!-- 포지션 -->
        <td style="text-align: center;">
          <span class="player-position-badge position-${p.position.toLowerCase()}">
            ${p.position === 'FW' ? '공격수 (FW)' : 
              p.position === 'MF' ? '미드필더 (MF)' : 
              p.position === 'DF' ? '수비수 (DF)' : '골키퍼 (GK)'}
          </span>
        </td>
        <!-- 출전 경기수 -->
        <td style="text-align: center;">
          <div class="stat-counter-cell">
            <button class="stat-counter-btn btn-stat-down" data-field="matches"><i class="fa-solid fa-minus"></i></button>
            <span class="stat-counter-val field-matches">${p.matches}</span>
            <button class="stat-counter-btn btn-stat-up" data-field="matches"><i class="fa-solid fa-plus"></i></button>
          </div>
        </td>
        <!-- 득점 -->
        <td style="text-align: center;">
          <div class="stat-counter-cell">
            <button class="stat-counter-btn btn-stat-down" data-field="goals"><i class="fa-solid fa-minus"></i></button>
            <span class="stat-counter-val field-goals text-amber-500">${p.goals}</span>
            <button class="stat-counter-btn btn-stat-up" data-field="goals"><i class="fa-solid fa-plus"></i></button>
          </div>
        </td>
        <!-- 도움 -->
        <td style="text-align: center;">
          <div class="stat-counter-cell">
            <button class="stat-counter-btn btn-stat-down" data-field="assists"><i class="fa-solid fa-minus"></i></button>
            <span class="stat-counter-val field-assists text-sky-400">${p.assists}</span>
            <button class="stat-counter-btn btn-stat-up" data-field="assists"><i class="fa-solid fa-plus"></i></button>
          </div>
        </td>
        <!-- 관리 액션 -->
        <td style="text-align: center;">
          <div class="action-btns" style="justify-content: center;">
            <button class="btn btn-secondary btn-icon btn-edit-player" style="width:30px; height:30px; font-size:0.75rem;" title="수정">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-danger btn-icon btn-delete-player" style="width:30px; height:30px; font-size:0.75rem;" title="삭제">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // 인라인 스탯 증감 이벤트 연결
    this.tableBody.querySelectorAll('.stat-counter-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const playerId = row.dataset.id;
        const button = e.target.closest('.stat-counter-btn');
        const field = button.dataset.field;
        const isUp = button.classList.contains('btn-stat-up');
        
        await this.adjustPlayerStat(playerId, field, isUp);
      });
    });

    // 수정 버튼 이벤트 연결
    this.tableBody.querySelectorAll('.btn-edit-player').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        const playerId = row.dataset.id;
        const player = this.players.find(p => p.id === playerId);
        if (player) this.openEditModal(player);
      });
    });

    // 삭제 버튼 이벤트 연결
    this.tableBody.querySelectorAll('.btn-delete-player').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        const playerId = row.dataset.id;
        const player = this.players.find(p => p.id === playerId);
        if (player && confirm(`선수 '${player.name}' 정보를 삭제하시겠습니까? 관련 회비 기록도 전부 삭제됩니다.`)) {
          await dbService.deletePlayer(playerId);
          await this.loadPlayers();
        }
      });
    });
  }

  // 스탯 인라인 조절 로직 (+/-)
  async adjustPlayerStat(playerId, field, isUp) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    if (isUp) {
      player[field]++;
    } else {
      player[field] = Math.max(0, player[field] - 1);
    }

    // 로컬 즉시 반영(빠른 반응형 느낌 부여)
    const row = this.tableBody.querySelector(`tr[data-id="${playerId}"]`);
    if (row) {
      const valSpan = row.querySelector(`.field-${field}`);
      if (valSpan) valSpan.textContent = player[field];
    }

    // 서버/스토리지 최종 영구 저장
    await dbService.savePlayer(player);
    
    // 글로벌 대시보드 통계 업데이트
    this.updateDashboardStats();
    
    // 타 탭에 전달
    if (this.onPlayersUpdateCallback) {
      this.onPlayersUpdateCallback(this.players);
    }
  }

  // 폼 등록 모달 열기
  openAddModal() {
    this.modalTitle.textContent = "신규 선수 등록";
    this.form.reset();
    document.getElementById('player-id').value = '';
    document.getElementById('player-goals').value = '0';
    document.getElementById('player-assists').value = '0';
    document.getElementById('player-matches').value = '0';
    
    this.modal.classList.add('active');
  }

  // 폼 수정 모달 열기
  openEditModal(player) {
    this.modalTitle.textContent = `'${player.name}' 정보 수정`;
    document.getElementById('player-id').value = player.id;
    document.getElementById('player-name').value = player.name;
    document.getElementById('player-backNumber').value = player.backNumber;
    document.getElementById('player-position').value = player.position;
    document.getElementById('player-goals').value = player.goals;
    document.getElementById('player-assists').value = player.assists;
    document.getElementById('player-matches').value = player.matches;
    
    this.modal.classList.add('active');
  }

  // 모달 닫기
  closeModal() {
    this.modal.classList.remove('active');
  }

  // 폼 제출 완료 로직
  async handleFormSubmit() {
    const id = document.getElementById('player-id').value;
    const name = document.getElementById('player-name').value.trim();
    const backNumber = document.getElementById('player-backNumber').value.trim();
    const position = document.getElementById('player-position').value;
    const goals = parseInt(document.getElementById('player-goals').value) || 0;
    const assists = parseInt(document.getElementById('player-assists').value) || 0;
    const matches = parseInt(document.getElementById('player-matches').value) || 0;

    const playerObj = {
      id: id || 'player_' + Date.now(),
      name,
      backNumber,
      position,
      goals,
      assists,
      matches
    };

    await dbService.savePlayer(playerObj);
    this.closeModal();
    await this.loadPlayers();
  }

  // 대시보드 통계 카드 및 리더보드 실시간 갱신
  updateDashboardStats() {
    const totalPlayersEl = document.getElementById('stat-total-players');
    const totalGoalsEl = document.getElementById('stat-total-goals');
    const topScorersEl = document.getElementById('dashboard-top-scorers');
    const topAssistersEl = document.getElementById('dashboard-top-assisters');

    // 1. 단순 스탯
    if (totalPlayersEl) totalPlayersEl.textContent = `${this.players.length}명`;
    
    const sumGoals = this.players.reduce((sum, p) => sum + (p.goals || 0), 0);
    if (totalGoalsEl) totalGoalsEl.textContent = `${sumGoals}골`;

    // 2. 득점왕 랭킹 (정렬 후 상위 3명 추출)
    if (topScorersEl) {
      const sortedScorers = [...this.players]
        .filter(p => (p.goals || 0) > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 3);

      if (sortedScorers.length === 0) {
        topScorersEl.innerHTML = `<p class="text-muted" style="font-size:0.8rem; text-align:center; padding:12px 0;">아직 시즌 득점이 없습니다.</p>`;
      } else {
        topScorersEl.innerHTML = sortedScorers.map((p, index) => `
          <div class="leader-item">
            <div class="leader-profile">
              <div class="avatar">${index + 1}</div>
              <div>
                <div class="leader-name">${p.name} <span class="leader-number">#${p.backNumber}</span></div>
              </div>
            </div>
            <div class="leader-value">${p.goals}골</div>
          </div>
        `).join('');
      }
    }

    // 3. 도움왕 랭킹
    if (topAssistersEl) {
      const sortedAssisters = [...this.players]
        .filter(p => (p.assists || 0) > 0)
        .sort((a, b) => b.assists - a.assists)
        .slice(0, 3);

      if (sortedAssisters.length === 0) {
        topAssistersEl.innerHTML = `<p class="text-muted" style="font-size:0.8rem; text-align:center; padding:12px 0;">아직 도움 기록이 없습니다.</p>`;
      } else {
        topAssistersEl.innerHTML = sortedAssisters.map((p, index) => `
          <div class="leader-item">
            <div class="leader-profile">
              <div class="avatar" style="${index === 0 ? 'background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-color:#34D399;' : ''}">${index + 1}</div>
              <div>
                <div class="leader-name">${p.name} <span class="leader-number">#${p.backNumber}</span></div>
              </div>
            </div>
            <div class="leader-value" style="color:var(--info);">${p.assists}도움</div>
          </div>
        `).join('');
      }
    }
  }
}

export const playerRecords = new PlayerRecords();
