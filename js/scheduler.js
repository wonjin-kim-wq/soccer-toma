// scheduler.js - 적토마 FC 경기 일정 달력 및 매치 스케줄러 관리 모듈
// 월별 그리드 연산 달력 렌더링, 일정 CRUD, 다가오는 경기 정렬 목록, 대시보드 D-Day 바인딩

import { dbService } from './database.js';

class SchedulerService {
  constructor() {
    this.daysGrid = document.getElementById('calendar-days-grid');
    this.monthYearText = document.getElementById('calendar-month-year');
    this.upcomingList = document.getElementById('upcoming-matches-list');
    
    this.modal = document.getElementById('modal-schedule');
    this.form = document.getElementById('schedule-form');
    this.modalTitle = document.getElementById('schedule-modal-title');
    
    // 현재 보고 있는 달력의 날짜 기준 (기본 오늘)
    this.currentDate = new Date();
    this.schedules = [];
    this.onScheduleUpdateCallback = null;
  }

  // 초기화 및 리스너 바인딩
  async init(onScheduleUpdate = null) {
    if (onScheduleUpdate) {
      this.onScheduleUpdateCallback = onScheduleUpdate;
    }

    // 버튼 방어 코드 바인딩
    const btnPrev = document.getElementById('btn-calendar-prev');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
      });
    }

    const btnNext = document.getElementById('btn-calendar-next');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
      });
    }

    // 신규 일정 등록 버튼
    const btnAdd = document.getElementById('btn-add-schedule');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        this.openAddModal();
      });
    }

    // 일정 저장 폼 제출
    if (this.form) {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleFormSubmit();
      });
    }

    // 초기 일정 로드 및 렌더링
    await this.loadSchedules();
  }

  // 데이터 로드
  async loadSchedules() {
    this.schedules = await dbService.getSchedules();
    this.render();
    
    if (this.onScheduleUpdateCallback) {
      this.onScheduleUpdateCallback(this.schedules);
    }
  }

  // 달력 및 예정 일정 목록 전체 통합 렌더링
  render() {
    this.renderCalendar();
    this.renderUpcomingMatches();
  }

  // 1. 월별 캘린더 연산 및 렌더링
  renderCalendar() {
    if (!this.daysGrid || !this.monthYearText) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth(); // 0 ~ 11

    // 헤더 텍스트 변경
    this.monthYearText.textContent = `${year}년 ${month + 1}월`;

    this.daysGrid.innerHTML = '';

    // 이번 달 첫째 날의 요일 (0: 일요일, 6: 토요일)
    const firstDayIndex = new Date(year, month, 1).getDay();
    // 이번 달 마지막 날짜 (예: 30일, 31일)
    const lastDate = new Date(year, month + 1, 0).getDate();
    // 지난달 마지막 날짜
    const prevLastDate = new Date(year, month, 0).getDate();

    const today = new Date();

    // 1) 지난달 날짜 패딩 (회색 투명 표시)
    for (let i = firstDayIndex; i > 0; i--) {
      const dayNum = prevLastDate - i + 1;
      const cell = this.createDayCellElement(dayNum, true, false, null, year, month - 1);
      this.daysGrid.appendChild(cell);
    }

    // 2) 이번 달 날짜 렌더링
    for (let d = 1; d <= lastDate; d++) {
      const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      
      // 요일 구하기 (클래스 부여 목적)
      const dayOfWeek = new Date(year, month, d).getDay();
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;

      // 해당 날짜에 경기 일정이 등록되어 있는지 필터링 (YYYY-MM-DD 포맷)
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayMatches = this.schedules.filter(s => s.date === dateStr);

      const cell = this.createDayCellElement(d, false, isToday, { isSunday, isSaturday }, year, month, dayMatches);
      this.daysGrid.appendChild(cell);
    }

    // 3) 다음달 날짜 패딩 (그리드 빈자리 채우기 - 총 42칸 완성형 달력 기준)
    const totalRendered = firstDayIndex + lastDate;
    const nextPadding = totalRendered % 7 === 0 ? 0 : 7 - (totalRendered % 7);
    for (let i = 1; i <= nextPadding; i++) {
      const cell = this.createDayCellElement(i, true, false, null, year, month + 1);
      this.daysGrid.appendChild(cell);
    }
  }

  // 달력 단일 날짜 칸 생성 헬퍼
  createDayCellElement(dayNum, isOtherMonth, isToday, weekdayInfo, year, monthIndex, dayMatches = []) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    if (isOtherMonth) cell.classList.add('other-month');
    if (isToday) cell.classList.add('today');

    if (weekdayInfo) {
      if (weekdayInfo.isSunday) cell.classList.add('sunday');
      if (weekdayInfo.isSaturday) cell.classList.add('saturday');
    }

    // 날짜 번호 표시
    const numSpan = document.createElement('span');
    numSpan.className = 'calendar-day-num';
    numSpan.textContent = dayNum;
    cell.appendChild(numSpan);

    // 일정 연동 배지 렌더링 (매치 등록 시)
    if (dayMatches.length > 0) {
      dayMatches.forEach(m => {
        const badge = document.createElement('div');
        badge.className = 'calendar-match-badge';
        badge.innerHTML = `<i class="fa-solid fa-futbol" style="font-size:0.6rem; margin-right:3px;"></i>${m.opponent}`;
        badge.title = `${m.opponent} 매치 (${m.time}) - ${m.location}`;
        cell.appendChild(badge);
      });
    }

    // 클릭 시 해당 날짜로 즉각 매치 일정 등록 폼 열기 (UX 극대화!)
    if (!isOtherMonth) {
      cell.addEventListener('click', (e) => {
        // 배지 내부 삭제 버튼 같은 하위 엘리먼트 클릭 시 전파 방지
        if (e.target.closest('.btn-delete-schedule')) return;
        
        const padMonth = String(monthIndex + 1).padStart(2, '0');
        const padDay = String(dayNum).padStart(2, '0');
        const clickDateStr = `${year}-${padMonth}-${padDay}`;
        
        this.openAddModal(clickDateStr);
      });
    }

    return cell;
  }

  // 2. 우측 다가오는 경기 스케줄 Timeline 목록 렌더링
  renderUpcomingMatches() {
    if (!this.upcomingList) return;

    const todayStr = new Date().toISOString().split('T')[0];
    
    // 오늘 포함 미래의 경기만 필터링 및 시간순 정렬
    const upcoming = this.schedules.filter(s => s.date >= todayStr);

    if (upcoming.length === 0) {
      this.upcomingList.innerHTML = `
        <div style="text-align: center; padding: 32px; color: var(--text-muted); font-size: 0.85rem;">
          다가오는 예정 경기가 없습니다. 일정을 새로 추가해 보세요!
        </div>
      `;
      return;
    }

    this.upcomingList.innerHTML = upcoming.map(s => {
      // 요일 구하기
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dateObj = new Date(s.date);
      const dayName = days[dateObj.getDay()];

      return `
        <div class="match-schedule-card" data-id="${s.id}">
          <button class="btn-delete-schedule" title="경기 일정 삭제"><i class="fa-solid fa-xmark"></i></button>
          
          <div class="match-header">
            <span class="match-date-badge">${s.date.replace(/-/g, '/')} (${dayName})</span>
            <span style="font-size:0.85rem; font-weight:700; color:var(--accent);"><i class="fa-regular fa-clock"></i> ${s.time}</span>
          </div>
          
          <div class="match-opponent">
            상대: ${s.opponent}
          </div>
          
          <div class="match-info-row" style="margin-top: 4px;">
            <i class="fa-solid fa-location-dot" style="color:var(--danger);"></i>
            <span>${s.location}</span>
          </div>
          
          ${s.description ? `
            <div style="font-size: 0.75rem; color: var(--text-muted); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; margin-top: 4px;">
              ${s.description}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // 일정 카드 삭제 이벤트 바인딩
    this.upcomingList.querySelectorAll('.btn-delete-schedule').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = e.target.closest('.match-schedule-card');
        const id = card.dataset.id;
        const opponent = card.querySelector('.match-opponent').textContent;

        if (confirm(`'${opponent}' 경기 일정을 정말 삭제하시겠습니까?`)) {
          await dbService.deleteSchedule(id);
          await this.loadSchedules();
        }
      });
    });
  }

  // 일정 추가 모달 열기
  openAddModal(defaultDateStr = null) {
    this.modalTitle.textContent = "신규 경기 일정 등록";
    this.form.reset();
    document.getElementById('schedule-id').value = '';
    
    // 날짜 자동 대입
    if (defaultDateStr) {
      document.getElementById('schedule-date').value = defaultDateStr;
    } else {
      document.getElementById('schedule-date').value = new Date().toISOString().split('T')[0];
    }
    
    document.getElementById('schedule-time').value = '10:00';
    this.modal.classList.add('active');
  }

  // 일정 저장 폼 완료 처리
  async handleFormSubmit() {
    const id = document.getElementById('schedule-id').value || 'sched_' + Date.now();
    const opponent = document.getElementById('schedule-opponent').value.trim();
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;
    const location = document.getElementById('schedule-location').value.trim();
    const description = document.getElementById('schedule-description').value.trim();

    const scheduleObj = { id, opponent, date, time, location, description };
    
    await dbService.saveSchedule(scheduleObj);
    this.modal.classList.remove('active');
    
    // 데이터 새로 불러와 갱신
    await this.loadSchedules();
  }
}

export const schedulerService = new SchedulerService();
