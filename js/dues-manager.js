// dues-manager.js - 적토마 FC 월별 회비 관리 모듈
// 12개월 O/X 토글 버튼 매트릭스, 누적 수납률/금액 실시간 계산, 대시보드 통계 연동

import { dbService } from './database.js';

class DuesManager {
  constructor() {
    this.tableBody = document.getElementById('dues-table-body');
    this.yearSelectEl = document.getElementById('dues-year-select');
    
    this.players = [];
    this.duesData = {}; // 현재 선택된 연도의 회비 데이터: { playerId: { 1: bool, 2: bool, ... } }
    this.selectedYear = '2026';
    this.monthlyFee = 10000; // 월 회비 기준: 1만 원 (수정됨)
  }

  // 초기화 및 리스너 등록
  init() {
    this.selectedYear = this.yearSelectEl ? this.yearSelectEl.value : '2026';

    // 연도 필터 변경 이벤트 바인딩
    if (this.yearSelectEl) {
      this.yearSelectEl.addEventListener('change', async (e) => {
        this.selectedYear = e.target.value;
        await this.loadDues();
      });
    }
  }

  // 선수단 데이터 갱신 시 외부에서 호출됨
  async updatePlayersList(playersList) {
    this.players = playersList;
    await this.loadDues();
  }

  // 회비 데이터 로드 및 렌더링
  async loadDues() {
    this.duesData = await dbService.getDues(this.selectedYear);
    
    // 만약 플레이어 중 회비 데이터가 아예 누락된 멤버가 있다면 기본 구조 생성
    let updated = false;
    this.players.forEach(p => {
      if (!this.duesData[p.id]) {
        this.duesData[p.id] = {};
        for (let m = 1; m <= 12; m++) {
          this.duesData[p.id][m] = false;
        }
        updated = true;
      }
    });

    if (updated) {
      // 로컬 스토리지 등에 구조 즉시 세이브
      await dbService.syncDuesToFirebase({ [this.selectedYear]: this.duesData });
    }

    this.renderDuesMatrix();
    this.calculateFinanceStats();
  }

  // 12달 O/X 매트릭스 테이블 렌더링
  renderDuesMatrix() {
    if (!this.tableBody) return;

    if (this.players.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="14" style="text-align: center; padding: 32px; color: var(--text-muted);">
            등록된 선수가 없습니다. [선수 기록 관리] 탭에서 선수를 먼저 등록해주세요.
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = this.players.map(p => {
      const playerDues = this.duesData[p.id] || {};
      
      // 개별 선수의 1년 수납율 계산
      let paidCount = 0;
      for (let m = 1; m <= 12; m++) {
        if (playerDues[m]) paidCount++;
      }
      const playerDuesRate = Math.round((paidCount / 12) * 100);
      const isAllPaid = playerDuesRate === 100;

      // 연회비 납부 버튼 디자인 및 텍스트 동적 결정
      const annualBtnText = isAllPaid ? '연회비 취소' : '연회비 납부';
      const annualBtnStyle = isAllPaid
        ? 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444;'
        : 'background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: var(--primary);';

      // 1월부터 12월까지의 O/X 버튼 생성
      let monthsHtml = '';
      for (let m = 1; m <= 12; m++) {
        const isPaid = !!playerDues[m];
        monthsHtml += `
          <td class="month-td">
            <button class="dues-btn ${isPaid ? 'paid' : 'unpaid'}" 
                    data-player-id="${p.id}" 
                    data-month="${m}">
              ${isPaid ? 'O' : 'X'}
            </button>
          </td>
        `;
      }

      return `
        <tr data-player-id="${p.id}">
          <td style="padding: 12px 10px 12px 20px; font-weight: 700; color: var(--text-primary);">
            <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start;">
              <span>${p.name} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">#${p.backNumber}</span></span>
              <button class="annual-pay-btn" data-player-id="${p.id}" style="padding: 2px 6px; font-size: 0.65rem; font-weight:600; border-radius: 4px; ${annualBtnStyle} cursor: pointer; transition: all 0.2s;">
                ${annualBtnText}
              </button>
            </div>
          </td>
          ${monthsHtml}
          <!-- 개인 연간 납부율 -->
          <td style="text-align: center; font-weight: 700; color: ${playerDuesRate === 100 ? 'var(--primary)' : 'var(--text-secondary)'};">
            ${playerDuesRate}%
          </td>
        </tr>
      `;
    }).join('');

    // 납부 여부 O/X 버튼 클릭 이벤트 리스너 바인딩
    this.tableBody.querySelectorAll('.dues-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const button = e.target.closest('.dues-btn');
        const playerId = button.dataset.playerId;
        const month = parseInt(button.dataset.month);
        const currentPaid = button.classList.contains('paid');
        const nextPaid = !currentPaid;

        // 1. UI 즉시 반응형 토글
        if (nextPaid) {
          button.textContent = 'O';
          button.className = 'dues-btn paid';
        } else {
          button.textContent = 'X';
          button.className = 'dues-btn unpaid';
        }

        // 2. 캐시 데이터 업데이트
        if (!this.duesData[playerId]) this.duesData[playerId] = {};
        this.duesData[playerId][month] = nextPaid;

        // 3. 로컬/서버 동기화
        await dbService.saveDues(this.selectedYear, playerId, month, nextPaid);

        // 4. 재정 정보 및 통계 재연산
        this.calculateFinanceStats();
        
        // 개인 행 납부율 및 연회비 납부 상태 갱신을 위해 리로드
        this.loadDues();
      });
    });

    // 연회비 납부/취소 일괄 버튼 클릭 이벤트 리스너 바인딩
    this.tableBody.querySelectorAll('.annual-pay-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const button = e.target.closest('.annual-pay-btn');
        const playerId = button.dataset.playerId;
        
        // 이 선수의 현재 수납 상태 계산
        const playerDues = this.duesData[playerId] || {};
        let paidCount = 0;
        for (let m = 1; m <= 12; m++) {
          if (playerDues[m]) paidCount++;
        }
        
        // 이미 12달 완납 상태이면 '일괄 미납(false)'으로 취소, 아니면 '일괄 완납(true)' 처리
        const targetState = paidCount !== 12;

        if (!this.duesData[playerId]) this.duesData[playerId] = {};
        
        // 12달 전부 상태 업데이트 및 Firestore 동기화
        for (let m = 1; m <= 12; m++) {
          this.duesData[playerId][m] = targetState;
          await dbService.saveDues(this.selectedYear, playerId, m, targetState);
        }

        // 상태 갱신 및 재렌더링
        this.calculateFinanceStats();
        this.loadDues();
      });
    });
  }

  // 재정 통계 연산 및 대시보드 연동
  calculateFinanceStats() {
    const totalCollectedEl = document.getElementById('dues-total-collected');
    const expectedTotalEl = document.getElementById('dues-expected-total');
    const percentValueEl = document.getElementById('dues-percent-value');
    
    const dashboardDuesRateEl = document.getElementById('stat-dues-rate');

    if (this.players.length === 0) {
      if (totalCollectedEl) totalCollectedEl.textContent = '0원';
      if (expectedTotalEl) expectedTotalEl.textContent = '0원';
      if (percentValueEl) percentValueEl.textContent = '0%';
      if (dashboardDuesRateEl) dashboardDuesRateEl.textContent = '0%';
      return;
    }

    let totalMonthsPaid = 0;
    const totalPlayersCount = this.players.length;
    
    // 현재 시스템 날짜 기준 달(Month) 계산 (1~12)
    const currentDate = new Date();
    // 2026년 대시보드이므로 연도가 맞지 않을 경우 5월(현재 기준) 또는 실제 오늘 달
    const currentMonth = currentDate.getFullYear() === parseInt(this.selectedYear) 
      ? currentDate.getMonth() + 1 
      : 5; // 디폴트 5월 (2026-05)

    let currentMonthPaid = 0;

    // 수납 총액 연산
    for (const playerId in this.duesData) {
      // 등록된 플레이어만 합산에 포함 (삭제된 플레이어 방지)
      const isRegistered = this.players.some(p => p.id === playerId);
      if (!isRegistered) continue;

      const months = this.duesData[playerId];
      for (let m = 1; m <= 12; m++) {
        if (months[m]) {
          totalMonthsPaid++;
          if (m === currentMonth) {
            currentMonthPaid++;
          }
        }
      }
    }

    const totalCollectedAmount = totalMonthsPaid * this.monthlyFee;
    const totalExpectedAmount = totalPlayersCount * 12 * this.monthlyFee;
    const overallRate = totalExpectedAmount > 0 ? Math.round((totalCollectedAmount / totalExpectedAmount) * 100) : 0;
    
    // 이번 달 수납율 계산
    const currentMonthRate = totalPlayersCount > 0 ? Math.round((currentMonthPaid / totalPlayersCount) * 100) : 0;

    // 1. 회비 탭 통계 엘리먼트 갱신
    if (totalCollectedEl) totalCollectedEl.textContent = `${totalCollectedAmount.toLocaleString()}원`;
    if (expectedTotalEl) expectedTotalEl.textContent = `${totalExpectedAmount.toLocaleString()}원`;
    if (percentValueEl) percentValueEl.textContent = `${overallRate}%`;

    // 2. 대시보드 탭 수납율 통계 갱신
    if (dashboardDuesRateEl) {
      dashboardDuesRateEl.textContent = `${currentMonthRate}%`;
      // 서브 텍스트 보충 (예: '5월 수납현황' 등)
      const parentCard = dashboardDuesRateEl.closest('.stat-details');
      if (parentCard) {
        const subtext = parentCard.querySelector('p');
        if (subtext) subtext.textContent = `${currentMonth}월 회비 수납률`;
      }
    }
  }
}

export const duesManager = new DuesManager();
