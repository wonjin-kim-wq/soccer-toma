// tactical-board.js - 적토마 FC 인터랙티브 전술판 모듈
// 모바일 터치 드래그 지원, 캔버스 그리기(펜/지우개), 포메이션 자동 배치, 전술 스냅샷 저장 연동

import { dbService } from './database.js';

class TacticalBoard {
  constructor() {
    this.pitch = document.getElementById('soccer-pitch');
    this.canvas = document.getElementById('drawing-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.isDrawing = false;
    this.currentTool = 'pen'; // 'pen', 'eraser'
    this.currentColor = '#FFFFFF';
    this.penWidth = 3;
    this.eraserWidth = 20;
    
    this.draggedElement = null;
    this.offsetX = 0;
    this.offsetY = 0;
    
    this.homePlayers = [];
    this.awayPlayers = [];
    this.ball = null;

    // 포메이션 좌표 사전 (percentage: [left%, top%])
    this.formations = {
      '4-4-2': {
        home: [
          [4, 50],   // H1 (GK)
          [20, 15],  // H2 (LB)
          [20, 38],  // H3 (LCB)
          [20, 62],  // H4 (RCB)
          [20, 85],  // H5 (RB)
          [42, 15],  // H6 (LM)
          [40, 38],  // H7 (LCM)
          [40, 62],  // H8 (RCM)
          [42, 85],  // H9 (RM)
          [68, 33],  // H10 (LS)
          [68, 67]   // H11 (RS)
        ]
      },
      '4-3-3': {
        home: [
          [4, 50],   // H1 (GK)
          [20, 15],  // H2 (LB)
          [20, 38],  // H3 (LCB)
          [20, 62],  // H4 (RCB)
          [20, 85],  // H5 (RB)
          [38, 30],  // H6 (LCM)
          [36, 50],  // H7 (CM)
          [38, 70],  // H8 (RCM)
          [68, 20],  // H9 (LW)
          [72, 50],  // H10 (ST)
          [68, 80]   // H11 (RW)
        ]
      },
      '3-5-2': {
        home: [
          [4, 50],   // H1 (GK)
          [18, 25],  // H2 (LCB)
          [18, 50],  // H3 (CB)
          [18, 75],  // H4 (RCB)
          [38, 12],  // H5 (LWB)
          [36, 35],  // H6 (LCM)
          [35, 50],  // H7 (DM)
          [36, 65],  // H8 (RCM)
          [38, 88],  // H9 (RWB)
          [68, 35],  // H10 (LS)
          [68, 65]   // H11 (RS)
        ]
      },
      '4-2-3-1': {
        home: [
          [4, 50],   // H1 (GK)
          [20, 15],  // H2 (LB)
          [20, 38],  // H3 (LCB)
          [20, 62],  // H4 (RCB)
          [20, 85],  // H5 (RB)
          [36, 35],  // H6 (LDM)
          [36, 65],  // H7 (RDM)
          [52, 20],  // H8 (LAM)
          [55, 50],  // H9 (CAM)
          [52, 80],  // H10 (RAM)
          [72, 50]   // H11 (ST)
        ]
      }
    };
  }

  // 초기화 및 이벤트 리스너 등록
  init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.createPlayers();
    this.setupDrawingEvents();
    this.setupDragEvents();
    this.loadSavedTacticsList();
  }

  // 캔버스 크기 경기장에 일치시키기
  resizeCanvas() {
    const rect = this.pitch.getBoundingClientRect();
    
    // 임시로 드로잉 내용 백업
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, 0, 0);

    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // 리사이즈 후 드로잉 복구
    this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, rect.width, rect.height);
    
    // 캔버스 기본 지연 컨텍스트 설정 리셋 방지
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  // 선수단 노드 생성 (홈 11명, 원정 11명, 공 1개)
  createPlayers() {
    // 기존 동적 플레이어 노드 전체 제거
    const existing = this.pitch.querySelectorAll('.pitch-player');
    existing.forEach(e => e.remove());

    this.homePlayers = [];
    this.awayPlayers = [];

    // 1. 홈팀 생성 (파란색 노드, H1 ~ H11)
    for (let i = 1; i <= 11; i++) {
      const p = this.renderPlayerNode(`H${i}`, 'home-player', `홈 ${i}`);
      // 대기 포지션 (아래쪽 벤치 배치)
      p.style.left = `${5 + (i - 1) * 7.5}%`;
      p.style.top = '93%';
      this.homePlayers.push(p);
    }

    // 2. 원정팀 생성 (빨간색 노드, A1 ~ A11)
    for (let i = 1; i <= 11; i++) {
      const p = this.renderPlayerNode(`A${i}`, 'away-player', `원정 ${i}`);
      // 대기 포지션 (위쪽 벤치 배치)
      p.style.left = `${5 + (i - 1) * 7.5}%`;
      p.style.top = '1.5%';
      this.awayPlayers.push(p);
    }

    // 3. 축구공 생성
    this.ball = this.renderPlayerNode('', 'ball', '공');
    this.ball.style.left = '50%';
    this.ball.style.top = '50%';
  }

  // 돔 노드 생성 헬퍼
  renderPlayerNode(numberText, className, labelText) {
    const node = document.createElement('div');
    node.className = `pitch-player ${className}`;
    node.textContent = numberText;
    
    const label = document.createElement('div');
    label.className = 'pitch-player-label';
    label.textContent = labelText;
    node.appendChild(label);
    
    this.pitch.appendChild(node);
    return node;
  }

  // 드래그 앤 드롭 로직 (터치 스크린 호환)
  setupDragEvents() {
    const startDrag = (e) => {
      const target = e.target.closest('.pitch-player');
      if (!target) return;
      
      this.draggedElement = target;
      this.draggedElement.style.zIndex = 100;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const rect = this.draggedElement.getBoundingClientRect();
      this.offsetX = clientX - rect.left - rect.width / 2;
      this.offsetY = clientY - rect.top - rect.height / 2;
      
      e.preventDefault();
    };

    const moveDrag = (e) => {
      if (!this.draggedElement) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const pitchRect = this.pitch.getBoundingClientRect();
      
      let x = clientX - pitchRect.left - this.offsetX;
      let y = clientY - pitchRect.top - this.offsetY;

      // 퍼센티지 변환
      let percentX = (x / pitchRect.width) * 100;
      let percentY = (y / pitchRect.height) * 100;

      // 바운더리 체크 (0% ~ 97% 내에서 드래그제한)
      percentX = Math.max(0.5, Math.min(97.5, percentX));
      percentY = Math.max(0.5, Math.min(96.5, percentY));

      this.draggedElement.style.left = `${percentX}%`;
      this.draggedElement.style.top = `${percentY}%`;
    };

    const endDrag = () => {
      if (this.draggedElement) {
        // z-index 원복 (공은 12, 일반 플레이어는 10)
        this.draggedElement.style.zIndex = this.draggedElement.classList.contains('ball') ? 12 : 10;
        this.draggedElement = null;
      }
    };

    // 마우스 이벤트
    this.pitch.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);

    // 터치 이벤트 (모바일 완벽 지원)
    this.pitch.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag);
  }

  // 포메이션 불러와서 선수 자동 배치
  applyFormation(formationKey) {
    if (formationKey === 'reset') {
      this.createPlayers();
      return;
    }

    const formation = this.formations[formationKey];
    if (!formation) return;

    // 홈팀 배치
    formation.home.forEach((pos, index) => {
      if (this.homePlayers[index]) {
        this.homePlayers[index].style.left = `${pos[0]}%`;
        this.homePlayers[index].style.top = `${pos[1]}%`;
      }
    });

    // 원정팀은 데칼코마니(반대칭)로 자동 배치하여 수비 진영 구축
    const getAwayMirrorCoords = (pos) => {
      return [100 - pos[0], 100 - pos[1]];
    };

    formation.home.forEach((pos, index) => {
      if (this.awayPlayers[index]) {
        const mirrored = getAwayMirrorCoords(pos);
        // 원정 골키퍼는 우측 끝에 배치
        if (index === 0) {
          this.awayPlayers[index].style.left = '95%';
          this.awayPlayers[index].style.top = '50%';
        } else {
          this.awayPlayers[index].style.left = `${mirrored[0]}%`;
          this.awayPlayers[index].style.top = `${mirrored[1]}%`;
        }
      }
    });

    // 공은 하프라인 중앙에 배치
    if (this.ball) {
      this.ball.style.left = '50%';
      this.ball.style.top = '50%';
    }
  }

  // 캔버스 그리기 기능 설정
  setupDrawingEvents() {
    const getCoordinates = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const startDraw = (e) => {
      // 드래그 가능한 플레이어 위를 누른 경우는 드로잉 패스
      if (e.target.closest('.pitch-player')) return;

      this.isDrawing = true;
      const coords = getCoordinates(e);
      this.ctx.beginPath();
      this.ctx.moveTo(coords.x, coords.y);
      
      e.preventDefault();
    };

    const draw = (e) => {
      if (!this.isDrawing) return;
      const coords = getCoordinates(e);

      if (this.currentTool === 'pen') {
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.penWidth;
        this.ctx.globalCompositeOperation = 'source-over';
      } else {
        // 지우개 모드
        this.ctx.lineWidth = this.eraserWidth;
        this.ctx.globalCompositeOperation = 'destination-out';
      }

      this.ctx.lineTo(coords.x, coords.y);
      this.ctx.stroke();
      
      e.preventDefault();
    };

    const stopDraw = () => {
      this.isDrawing = false;
    };

    // 마우스 그리기
    this.canvas.addEventListener('mousedown', startDraw);
    this.canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    // 터치 그리기
    this.canvas.addEventListener('touchstart', startDraw, { passive: false });
    this.canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);

    // 드로잉 도구 변환 제어
    const toolBtns = document.querySelectorAll('.draw-btn[data-tool]');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
      });
    });

    // 드로잉 색상 선택기 제어
    const colorBtns = document.querySelectorAll('.draw-btn[data-color]');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentColor = btn.dataset.color;
        
        // 색상 선택 시 펜 모드로 자동 변환
        const penBtn = document.querySelector('.draw-btn[data-tool="pen"]');
        if (penBtn) penBtn.click();
      });
    });

    // 드로잉 전체 지우기
    document.getElementById('btn-clear-drawings').addEventListener('click', () => {
      this.clearCanvas();
    });
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // 현재 전술 상태를 데이터 객체로 직렬화
  getTacticState(name) {
    const serializePlayerPositions = (players) => {
      return players.map(p => ({
        left: p.style.left,
        top: p.style.top
      }));
    };

    return {
      id: 'tactic_' + Date.now(),
      name: name,
      positions: {
        home: serializePlayerPositions(this.homePlayers),
        away: serializePlayerPositions(this.awayPlayers),
        ball: { left: this.ball.style.left, top: this.ball.style.top }
      },
      // 캔버스 드로잉을 Base64 데이터 이미지로 저장
      drawings: this.canvas.toDataURL(),
      createdAt: Date.now()
    };
  }

  // 직렬화된 전술 상태 불러오기
  loadTacticState(tactic) {
    this.clearCanvas();
    
    // 1. 선수단 위치 대입
    tactic.positions.home.forEach((pos, index) => {
      if (this.homePlayers[index]) {
        this.homePlayers[index].style.left = pos.left;
        this.homePlayers[index].style.top = pos.top;
      }
    });

    tactic.positions.away.forEach((pos, index) => {
      if (this.awayPlayers[index]) {
        this.awayPlayers[index].style.left = pos.left;
        this.awayPlayers[index].style.top = pos.top;
      }
    });

    if (this.ball && tactic.positions.ball) {
      this.ball.style.left = tactic.positions.ball.left;
      this.ball.style.top = tactic.positions.ball.top;
    }

    // 2. 드로잉 복원
    if (tactic.drawings) {
      const img = new Image();
      img.onload = () => {
        // 이미지를 캔버스 크기에 맞춰 렌더링
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      };
      img.src = tactic.drawings;
    }
  }

  // 전술 저장 리스트 로드 및 화면 갱신
  async loadSavedTacticsList() {
    const tactics = await dbService.getTacticalPatterns();
    const saveList = document.getElementById('tactic-saved-list');
    const dashboardList = document.getElementById('dashboard-recent-tactics');
    
    const renderHtml = (tlist) => {
      if (tlist.length === 0) {
        return `<li class="text-muted" style="text-align:center; padding:12px; font-size:0.8rem;">저장된 전술 패턴이 없습니다.</li>`;
      }
      return tlist.map(t => `
        <li class="tactic-save-item" data-id="${t.id}">
          <span class="load-tactic-btn" style="flex:1;">${t.name}</span>
          <button class="delete-btn" title="삭제"><i class="fa-solid fa-trash"></i></button>
        </li>
      `).join('');
    };

    if (saveList) {
      saveList.innerHTML = renderHtml(tactics);
      
      // 전술 로드 버튼 바인딩
      saveList.querySelectorAll('.load-tactic-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const item = e.target.closest('.tactic-save-item');
          const t = tactics.find(tac => tac.id === item.dataset.id);
          if (t) {
            this.loadTacticState(t);
            alert(`'${t.name}' 전술을 불러왔습니다!`);
          }
        });
      });

      // 전술 삭제 버튼 바인딩
      saveList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const item = e.target.closest('.tactic-save-item');
          const name = item.querySelector('.load-tactic-btn').textContent;
          if (confirm(`'${name}' 전술을 삭제하시겠습니까?`)) {
            await dbService.deleteTacticalPattern(item.dataset.id);
            this.loadSavedTacticsList();
          }
        });
      });
    }

    // 대시보드 리스트도 함께 갱신
    if (dashboardList) {
      if (tactics.length === 0) {
        dashboardList.innerHTML = `<li style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">저장된 전술 패턴이 없습니다.</li>`;
      } else {
        dashboardList.innerHTML = tactics.slice(0, 5).map(t => `
          <li class="tactic-save-item" data-id="${t.id}">
            <span class="goto-tactics-tab" style="font-weight:600; cursor:pointer;"><i class="fa-solid fa-chalkboard-user" style="margin-right:6px; color:var(--primary);"></i> ${t.name}</span>
            <small style="color:var(--text-muted); font-size:0.75rem;">${new Date(t.createdAt).toLocaleDateString()}</small>
          </li>
        `).join('');

        dashboardList.querySelectorAll('.goto-tactics-tab').forEach(btn => {
          btn.addEventListener('click', (e) => {
            // 전술판 탭으로 이동하고 해당 전술 장전
            const menuTactics = document.querySelector('[data-target="view-tactics"]');
            if (menuTactics) {
              menuTactics.click();
              const item = e.target.closest('.tactic-save-item');
              const t = tactics.find(tac => tac.id === item.dataset.id);
              if (t) {
                // 약간의 탭 전환 애니메이션 이후에 그려지도록 타이밍 보장
                setTimeout(() => {
                  this.loadTacticState(t);
                }, 200);
              }
            }
          });
        });
      }
    }
  }

  // 전술 신규 저장 수행
  async saveTactic(name) {
    const tacticState = this.getTacticState(name);
    await dbService.saveTacticalPattern(tacticState);
    await this.loadSavedTacticsList();
  }
}

export const tacticalBoard = new TacticalBoard();
