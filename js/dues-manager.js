// dues-manager.js - 적토마 FC 월별 회비 관리 모듈
// 12개월 O/X 토글 버튼 매트릭스, 누적 수납률/금액 실시간 계산, 대시보드 통계 연동

import { dbService } from './database.js';

class DuesManager {
  constructor() {
    this.tableBody = document.getElementById('dues-table-body');
    this.yearSelectEl = document.getElementById('dues-year-select');
    
    // Google Sheets 연동 UI 요소 [NEW]
    this.gsheetUrlInput = document.getElementById('dues-gsheet-url');
    this.btnSaveGsheet = document.getElementById('btn-save-gsheet-url');
    this.btnSyncGsheet = document.getElementById('btn-sync-gsheet');
    this.btnGsheetHelp = document.getElementById('btn-gsheet-help');
    this.syncIcon = document.getElementById('sync-icon');
    
    this.modalSheetSync = document.getElementById('modal-sheet-sync');
    this.modalGsheetHelp = document.getElementById('modal-gsheet-help');
    this.sheetPreviewTbody = document.getElementById('sheet-preview-tbody');
    this.sheetSyncWarning = document.getElementById('sheet-sync-warning');
    this.btnConfirmSheetSync = document.getElementById('btn-confirm-sheet-sync');

    this.players = [];
    this.duesData = {}; // 현재 선택된 연도의 회비 데이터: { playerId: { 1: bool, 2: bool, ... } }
    this.selectedYear = '2026';
    this.monthlyFee = 10000; // 월 회비 기준: 1만 원 (수정됨)
    this.parsedSyncData = null; // 동기화 전 분석된 임시 데이터 저장 [NEW]
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

    // Google Sheets 연동 초기화 및 이벤트 등록 [NEW]
    this.loadGoogleSheetUrl();

    if (this.btnSaveGsheet) {
      this.btnSaveGsheet.addEventListener('click', async () => {
        const url = this.gsheetUrlInput.value.trim();
        await dbService.saveGoogleSheetUrl(url);
        alert('구글 스프레드시트 URL이 성공적으로 저장되었습니다!');
      });
    }

    if (this.btnGsheetHelp && this.modalGsheetHelp) {
      this.btnGsheetHelp.addEventListener('click', () => {
        this.modalGsheetHelp.classList.add('active');
      });
    }

    if (this.btnSyncGsheet) {
      this.btnSyncGsheet.addEventListener('click', async () => {
        await this.syncGoogleSheet();
      });
    }

    if (this.btnConfirmSheetSync) {
      this.btnConfirmSheetSync.addEventListener('click', async () => {
        await this.applySyncData();
      });
    }
  }

  // 저장된 구글 시트 URL 로드
  async loadGoogleSheetUrl() {
    if (this.gsheetUrlInput) {
      const url = await dbService.getGoogleSheetUrl();
      this.gsheetUrlInput.value = url || '';
    }
  }

  // CSV 파서 (따옴표 및 쉼표 내장 텍스트 완벽 지원)
  parseCSV(text) {
    const lines = [];
    let row = [""];
    let insideQuote = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip next quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push("");
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    return lines.map(line => line.map(cell => cell.trim()));
  }

  // 구글 스프레드시트 가져오기 및 파싱 프로세스
  async syncGoogleSheet() {
    const url = this.gsheetUrlInput ? this.gsheetUrlInput.value.trim() : '';
    if (!url) {
      alert('구글 스프레드시트 웹에 게시(CSV) URL을 먼저 입력해 주세요.');
      return;
    }

    if (!url.includes('/pub?') || !url.includes('output=csv')) {
      alert('올바른 "웹에 게시" CSV 주소가 아닌 것 같습니다. [연동 도움말(?)] 버튼을 클릭해 생성 방법을 확인해보세요!');
      return;
    }

    // 로딩 스피너 작동
    if (this.syncIcon) this.syncIcon.classList.add('spin-animation');
    if (this.btnSyncGsheet) {
      this.btnSyncGsheet.disabled = true;
      this.btnSyncGsheet.innerHTML = '<i class="fa-solid fa-rotate spin-animation"></i> 가져오는 중...';
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('시트 데이터를 가져오지 못했습니다. URL이 올바르고 웹에 게시(CSV)되어 있는지 확인해주세요.');
      }

      const csvText = await response.text();
      const csvData = this.parseCSV(csvText);

      if (csvData.length < 2) {
        throw new Error('스프레드시트에 파싱 가능한 데이터 행이 없습니다.');
      }

      // 분석 엔진 구동
      this.analyzeSyncData(csvData);
      
    } catch (error) {
      console.error(error);
      alert('동기화 실패: ' + error.message);
    } finally {
      // 로딩 원복
      if (this.syncIcon) this.syncIcon.classList.remove('spin-animation');
      if (this.btnSyncGsheet) {
        this.btnSyncGsheet.disabled = false;
        this.btnSyncGsheet.innerHTML = '<i class="fa-solid fa-rotate"></i> 실시간 시트 동기화';
      }
    }
  }

  // 스프레드시트 데이터 분석 및 기존 선수단 매칭 연산
  analyzeSyncData(csvData) {
    const headers = csvData[0];
    let nameColIndex = 0;
    const monthCols = {};

    const yearShort = this.selectedYear.substring(2); // e.g. "2026" -> "26"
    const yearFull = this.selectedYear; // "2026"

    headers.forEach((header, index) => {
      const trimmed = header.replace(/\s+/g, '');
      if (trimmed.includes('이름') || trimmed.includes('선수명') || trimmed.includes('성명') || trimmed.includes('Player') || trimmed.includes('Name')) {
        nameColIndex = index;
      }
      
      // 1. "26.3." 또는 "2026.3." 또는 "25.12." 형태의 날짜 매칭
      // 정규식 설명: (연도) . (월) .?
      const dotDateMatch = trimmed.match(/^(\d+)\.(\d+)\.?$/);
      if (dotDateMatch) {
        const yearPart = dotDateMatch[1];
        const monthPart = parseInt(dotDateMatch[2]);
        
        // 현재 로드하려는 연도의 회비 데이터만 매칭
        if (yearPart === yearShort || yearPart === yearFull) {
          if (monthPart >= 1 && monthPart <= 12) {
            monthCols[monthPart] = index;
          }
        }
      } else {
        // 2. 일반 "1월" 또는 "1" 형태 매칭 (연도 접두사가 없는 경우)
        const monthMatch = trimmed.match(/^(\d+)(월)?$/);
        if (monthMatch) {
          const monthNum = parseInt(monthMatch[1]);
          if (monthNum >= 1 && monthNum <= 12) {
            monthCols[monthNum] = index;
          }
        }
      }
    });

    // 만약 월 열이 자동으로 감지되지 않았다면 기본값으로 이름 다음 12개 열을 매핑
    if (Object.keys(monthCols).length === 0) {
      for (let m = 1; m <= 12; m++) {
        const colIdx = nameColIndex + m;
        if (colIdx < headers.length) {
          monthCols[m] = colIdx;
        }
      }
    }

    const matchedResults = [];
    const unmatchedNames = [];

    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      if (row.length === 0 || !row[nameColIndex]) continue;

      const sheetPlayerName = row[nameColIndex].trim();
      if (!sheetPlayerName) continue;

      const matchedPlayer = this.players.find(p => p.name === sheetPlayerName);

      const parsedDues = {};
      let sheetPaidCount = 0;

      for (let m = 1; m <= 12; m++) {
        const colIdx = monthCols[m];
        if (colIdx !== undefined && colIdx < row.length) {
          const val = row[colIdx].trim().toUpperCase();
          // 완납 조건: 'O', '연회비' 포함 단어, '완납', '납부', 'V', 'TRUE', '1', 'OK'
          const isPaid = val === 'O' || 
                         val.includes('연회비') || 
                         val === '완납' || 
                         val === '납부' || 
                         val === 'V' || 
                         val === 'TRUE' || 
                         val === '1' || 
                         val === 'OK';
          parsedDues[m] = isPaid;
          if (isPaid) sheetPaidCount++;
        } else {
          parsedDues[m] = false;
        }
      }

      if (matchedPlayer) {
        const existingPlayerDues = this.duesData[matchedPlayer.id] || {};
        let existingPaidCount = 0;
        for (let m = 1; m <= 12; m++) {
          if (existingPlayerDues[m]) existingPaidCount++;
        }

        matchedResults.push({
          playerId: matchedPlayer.id,
          playerName: matchedPlayer.name,
          backNumber: matchedPlayer.backNumber,
          matched: true,
          existingPaidCount,
          sheetPaidCount,
          parsedDues
        });
      } else {
        unmatchedNames.push(sheetPlayerName);
        matchedResults.push({
          playerName: sheetPlayerName,
          matched: false,
          sheetPaidCount,
          parsedDues
        });
      }
    }

    this.parsedSyncData = {
      matchedResults,
      unmatchedNames
    };

    this.renderSyncPreview();
  }

  // 동기화 미리보기 모달 테이블 렌더링
  renderSyncPreview() {
    if (!this.sheetPreviewTbody) return;

    const { matchedResults, unmatchedNames } = this.parsedSyncData;

    if (matchedResults.length === 0) {
      this.sheetPreviewTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
            시트에서 파싱된 선수 데이터가 없습니다.
          </td>
        </tr>
      `;
      if (this.sheetSyncWarning) this.sheetSyncWarning.style.display = 'none';
      return;
    }

    this.sheetPreviewTbody.innerHTML = matchedResults.map(res => {
      if (res.matched) {
        const diff = res.sheetPaidCount - res.existingPaidCount;
        let changeHtml = '';
        if (diff > 0) {
          changeHtml = `<span class="change-increment"><i class="fa-solid fa-arrow-trend-up"></i> +${diff}달 추가</span>`;
        } else if (diff < 0) {
          changeHtml = `<span class="change-decrement"><i class="fa-solid fa-arrow-trend-down"></i> ${diff}달 취소</span>`;
        } else {
          changeHtml = `<span class="change-no">변동 없음</span>`;
        }

        return `
          <tr>
            <td style="padding: 12px 14px; font-weight: 700; color: var(--text-primary);">
              ${res.playerName} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight:500;">#${res.backNumber}</span>
            </td>
            <td style="text-align: center; padding: 12px 8px;">
              <span class="badge-match-success"><i class="fa-solid fa-circle-check"></i> 매칭 성공</span>
            </td>
            <td style="text-align: center; padding: 12px 8px; font-weight: 600; color: var(--text-secondary);">${res.existingPaidCount}달</td>
            <td style="text-align: center; padding: 12px 8px; font-weight: 700; color: var(--primary);">${res.sheetPaidCount}달</td>
            <td style="text-align: center; padding: 12px 8px;">${changeHtml}</td>
          </tr>
        `;
      } else {
        return `
          <tr class="unmatched-row">
            <td style="padding: 12px 14px; font-weight: 700; color: var(--danger);">
              ${res.playerName}
            </td>
            <td style="text-align: center; padding: 12px 8px;">
              <span class="badge-match-fail"><i class="fa-solid fa-triangle-exclamation"></i> 선수 미등록</span>
            </td>
            <td style="text-align: center; padding: 12px 8px; color: var(--text-muted);">-</td>
            <td style="text-align: center; padding: 12px 8px; font-weight: 700; color: var(--danger);">${res.sheetPaidCount}달</td>
            <td style="text-align: center; padding: 12px 8px; color: var(--danger); font-size: 0.75rem; font-weight:600;">동기화 제외 (선수 등록 필요)</td>
          </tr>
        `;
      }
    }).join('');

    if (this.sheetSyncWarning) {
      if (unmatchedNames.length > 0) {
        this.sheetSyncWarning.style.display = 'block';
        this.sheetSyncWarning.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation"></i> <strong>선수 매칭 실패 알림:</strong> 구글 시트에 기재된 <strong>[${unmatchedNames.join(', ')}]</strong> 선수는 현재 등록되어 있지 않습니다. 이 선수들의 회비는 제외되며, 반영하시려면 [선수 기록 관리] 탭에서 이름을 등록하고 재동기화해 주세요.
        `;
      } else {
        this.sheetSyncWarning.style.display = 'none';
      }
    }

    if (this.modalSheetSync) {
      this.modalSheetSync.classList.add('active');
    }
  }

  // 최종 파싱된 회비 데이터를 DB에 동기화 반영
  async applySyncData() {
    if (!this.parsedSyncData || !this.parsedSyncData.matchedResults) return;

    const matchedOnly = this.parsedSyncData.matchedResults.filter(r => r.matched);
    
    if (matchedOnly.length === 0) {
      alert('동기화할 유효한 선수 매치 데이터가 없습니다.');
      return;
    }

    try {
      if (this.btnConfirmSheetSync) {
        this.btnConfirmSheetSync.disabled = true;
        this.btnConfirmSheetSync.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 저장하는 중...';
      }

      for (const res of matchedOnly) {
        const playerId = res.playerId;
        this.duesData[playerId] = res.parsedDues;

        for (let m = 1; m <= 12; m++) {
          const isPaid = res.parsedDues[m];
          await dbService.saveDues(this.selectedYear, playerId, m, isPaid);
        }
      }

      if (this.modalSheetSync) this.modalSheetSync.classList.remove('active');
      this.parsedSyncData = null;

      this.renderDuesMatrix();
      this.calculateFinanceStats();

      alert('구글 스프레드시트 회비 연동이 성공적으로 반영되었습니다!');
      
    } catch (e) {
      console.error(e);
      alert('적용 중 오류가 발생했습니다: ' + e.message);
    } finally {
      if (this.btnConfirmSheetSync) {
        this.btnConfirmSheetSync.disabled = false;
        this.btnConfirmSheetSync.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 최종 동기화 반영';
      }
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
