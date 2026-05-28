// tactical-board.js - 적토마 FC 인터랙티브 전술판 모듈
// 모바일 터치 드래그 지원, 캔버스 그리기(펜/지우개), 포메이션 자동 배치
// [고도화]: 프레임 기반 멀티스텝 타임라인 관리, CSS Transition 스무스 애니메이션 재생 엔진 탑재

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

    // [고도화]: 애니메이션 프레임 데이터 구조
    // frames: [ { positions: { home: [], away: [], ball: {} }, drawings: 'dataURL' } ]
    this.frames = [];
    this.activeFrameIndex = 0;
    this.animationTimer = null;
    this.isPlaying = false;
    this.frameDuration = 1000; // 프레임 간 전환 속도 (1초)

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
          [52, 20],  // H8 (RAM)
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
    this.setupAnimationEvents(); // 애니메이션 스케줄링 바인딩
    this.loadSavedTacticsList();

    // 초기 1프레임 셋 초기 구성
    this.resetFrames();
  }

  // 타임라인 리셋
  resetFrames() {
    this.frames = [{
      positions: this.serializeCurrentPlayerPositions(),
      drawings: ''
    }];
    this.activeFrameIndex = 0;
    this.updateTimelineIndicator();
  }

  // 캔버스 크기 경기장에 일치시키기
  resizeCanvas() {
    const rect = this.pitch.getBoundingClientRect();
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, 0, 0);

    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, rect.width, rect.height);
    
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  // 선수단 노드 생성 (홈 11명, 원정 11명, 공 1개)
  createPlayers() {
    const existing = this.pitch.querySelectorAll('.pitch-player');
    existing.forEach(e => e.remove());

    this.homePlayers = [];
    this.awayPlayers = [];

    // 1. 홈팀 생성
    for (let i = 1; i <= 11; i++) {
      const p = this.renderPlayerNode(`H${i}`, 'home-player', `홈 ${i}`);
      p.style.left = `${5 + (i - 1) * 7.5}%`;
      p.style.top = '93%';
      this.homePlayers.push(p);
    }

    // 2. 원정팀 생성
    for (let i = 1; i <= 11; i++) {
      const p = this.renderPlayerNode(`A${i}`, 'away-player', `원정 ${i}`);
      p.style.left = `${5 + (i - 1) * 7.5}%`;
      p.style.top = '1.5%';
      this.awayPlayers.push(p);
    }

    // 3. 축구공 생성
    this.ball = this.renderPlayerNode('', 'ball', '공');
    this.ball.style.left = '50%';
    this.ball.style.top = '50%';
  }

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

  // 드래그 앤 드롭 로직 (마우스 & 터치 연동)
  setupDragEvents() {
    const startDrag = (e) => {
      // 재생 중에는 드래그 차단
      if (this.isPlaying) return;

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

      let percentX = (x / pitchRect.width) * 100;
      let percentY = (y / pitchRect.height) * 100;

      percentX = Math.max(0.5, Math.min(97.5, percentX));
      percentY = Math.max(0.5, Math.min(96.5, percentY));

      this.draggedElement.style.left = `${percentX}%`;
      this.draggedElement.style.top = `${percentY}%`;
    };

    const endDrag = () => {
      if (this.draggedElement) {
        this.draggedElement.style.zIndex = this.draggedElement.classList.contains('ball') ? 12 : 10;
        this.draggedElement = null;

        // 드래그 종료 후 현재 프레임의 위치 데이터를 자동 저장 캐시
        this.saveCurrentStateToActiveFrame();
      }
    };

    this.pitch.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);

    this.pitch.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag);
  }

  // 포메이션 배치 로직
  applyFormation(formationKey) {
    if (formationKey === 'reset') {
      this.createPlayers();
      this.saveCurrentStateToActiveFrame();
      return;
    }

    const formation = this.formations[formationKey];
    if (!formation) return;

    // 홈팀
    formation.home.forEach((pos, index) => {
      if (this.homePlayers[index]) {
        this.homePlayers[index].style.left = `${pos[0]}%`;
        this.homePlayers[index].style.top = `${pos[1]}%`;
      }
    });

    // 원정팀 (수비 미러 대칭 배치)
    const getAwayMirrorCoords = (pos) => {
      return [100 - pos[0], 100 - pos[1]];
    };

    formation.home.forEach((pos, index) => {
      if (this.awayPlayers[index]) {
        const mirrored = getAwayMirrorCoords(pos);
        if (index === 0) {
          this.awayPlayers[index].style.left = '95%';
          this.awayPlayers[index].style.top = '50%';
        } else {
          this.awayPlayers[index].style.left = `${mirrored[0]}%`;
          this.awayPlayers[index].style.top = `${mirrored[1]}%`;
        }
      }
    });

    if (this.ball) {
      this.ball.style.left = '50%';
      this.ball.style.top = '50%';
    }

    // 포메이션 저장 후 현재 프레임에 기록 저장
    this.saveCurrentStateToActiveFrame();
  }

  // 캔버스 자유 드로잉 로직
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
      if (e.target.closest('.pitch-player') || this.isPlaying) return;

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
        this.ctx.lineWidth = this.eraserWidth;
        this.ctx.globalCompositeOperation = 'destination-out';
      }

      this.ctx.lineTo(coords.x, coords.y);
      this.ctx.stroke();
      
      e.preventDefault();
    };

    const stopDraw = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        // 드로잉 종료 시 현재 프레임 데이터에 드로잉 Base64 기록 저장
        this.saveCurrentStateToActiveFrame();
      }
    };

    this.canvas.addEventListener('mousedown', startDraw);
    this.canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    this.canvas.addEventListener('touchstart', startDraw, { passive: false });
    this.canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);

    // 색상/도구 변경
    const toolBtns = document.querySelectorAll('.draw-btn[data-tool]');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTool = btn.dataset.tool;
      });
    });

    const colorBtns = document.querySelectorAll('.draw-btn[data-color]');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentColor = btn.dataset.color;
        
        const penBtn = document.querySelector('.draw-btn[data-tool="pen"]');
        if (penBtn) penBtn.click();
      });
    });

    document.getElementById('btn-clear-drawings').addEventListener('click', () => {
      this.clearCanvas();
      this.saveCurrentStateToActiveFrame();
    });
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ==========================================
  // [고도화]: 애니메이션 및 타임라인 프레임 엔진 구현
  // ==========================================

  setupAnimationEvents() {
    // 1. 타임라인 이전/다음 스텝 전환 버튼 방어 바인딩
    const btnPrevFrame = document.getElementById('btn-anim-prev-frame');
    if (btnPrevFrame) {
      btnPrevFrame.addEventListener('click', () => {
        if (this.isPlaying) return;
        if (this.activeFrameIndex > 0) {
          this.saveCurrentStateToActiveFrame(); // 현재 위치 임시저장
          this.activeFrameIndex--;
          this.loadFrameState(this.activeFrameIndex);
          this.updateTimelineIndicator();
        }
      });
    }

    const btnNextFrame = document.getElementById('btn-anim-next-frame');
    if (btnNextFrame) {
      btnNextFrame.addEventListener('click', () => {
        if (this.isPlaying) return;
        if (this.activeFrameIndex < this.frames.length - 1) {
          this.saveCurrentStateToActiveFrame();
          this.activeFrameIndex++;
          this.loadFrameState(this.activeFrameIndex);
          this.updateTimelineIndicator();
        }
      });
    }

    // 2. 프레임 추가/삭제 버튼 방어 바인딩
    const btnAddFrame = document.getElementById('btn-anim-add-frame');
    if (btnAddFrame) {
      btnAddFrame.addEventListener('click', () => {
        if (this.isPlaying) return;
        this.saveCurrentStateToActiveFrame();
        
        // 현재 프레임의 선수 좌표를 바탕으로 새로운 복제 프레임 추가
        const newFrame = {
          positions: JSON.parse(JSON.stringify(this.frames[this.activeFrameIndex].positions)),
          drawings: '' // 드로잉 펜 선은 신규 프레임에서는 깔끔하게 시작
        };

        this.frames.splice(this.activeFrameIndex + 1, 0, newFrame);
        this.activeFrameIndex++;
        this.loadFrameState(this.activeFrameIndex);
        this.updateTimelineIndicator();
      });
    }

    const btnDeleteFrame = document.getElementById('btn-anim-delete-frame');
    if (btnDeleteFrame) {
      btnDeleteFrame.addEventListener('click', () => {
        if (this.isPlaying) return;
        if (this.frames.length <= 1) {
          alert('최소 1개의 전술 스텝이 필요합니다.');
          return;
        }

        if (confirm('현재 스텝을 삭제하시겠습니까?')) {
          this.frames.splice(this.activeFrameIndex, 1);
          this.activeFrameIndex = Math.max(0, this.activeFrameIndex - 1);
          this.loadFrameState(this.activeFrameIndex);
          this.updateTimelineIndicator();
        }
      });
    }

    // 3. 재생 / 정지 / 일시정지 컨트롤 방어 바인딩
    const btnPlay = document.getElementById('btn-anim-play');
    const btnPause = document.getElementById('btn-anim-pause');
    const btnStop = document.getElementById('btn-anim-stop');

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        this.playAnimation();
      });
    }

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.pauseAnimation();
      });
    }

    if (btnStop) {
      btnStop.addEventListener('click', () => {
        this.stopAnimation();
      });
    }
  }

  // 타임라인 인디케이터 라벨 업데이트 (예: '스텝 2 / 4')
  updateTimelineIndicator() {
    const indicator = document.getElementById('anim-frame-indicator');
    if (indicator) {
      indicator.textContent = `스텝 ${this.activeFrameIndex + 1} / ${this.frames.length}`;
    }
  }

  // 플레이어 포지션 직렬화
  serializeCurrentPlayerPositions() {
    const serializePositions = (players) => {
      return players.map(p => ({
        left: p.style.left,
        top: p.style.top
      }));
    };

    return {
      home: serializePositions(this.homePlayers),
      away: serializePositions(this.awayPlayers),
      ball: { left: this.ball.style.left, top: this.ball.style.top }
    };
  }

  // 현재 판 배치를 activeFrameIndex 인덱스 프레임 객체에 임시 저장
  saveCurrentStateToActiveFrame() {
    if (this.isPlaying) return; // 애니메이션 구동 중에는 수동 세이브 차단
    
    this.frames[this.activeFrameIndex] = {
      positions: this.serializeCurrentPlayerPositions(),
      drawings: this.canvas.toDataURL()
    };
  }

  // 특정 프레임의 데이터를 불러와 전술판에 렌더링
  loadFrameState(index, useTransition = false) {
    const frame = this.frames[index];
    if (!frame) return;

    const players = this.pitch.querySelectorAll('.pitch-player');

    // 재생 중에만 부드러운 트랜지션 클래스 주입 (드래그 시 렉 현상 방지용 최적화)
    if (useTransition) {
      players.forEach(p => p.classList.add('animating'));
    } else {
      players.forEach(p => p.classList.remove('animating'));
    }

    // 1. 선수들 포지션 배치
    frame.positions.home.forEach((pos, idx) => {
      if (this.homePlayers[idx]) {
        this.homePlayers[idx].style.left = pos.left;
        this.homePlayers[idx].style.top = pos.top;
      }
    });

    frame.positions.away.forEach((pos, idx) => {
      if (this.awayPlayers[idx]) {
        this.awayPlayers[idx].style.left = pos.left;
        this.awayPlayers[idx].style.top = pos.top;
      }
    });

    if (this.ball && frame.positions.ball) {
      this.ball.style.left = frame.positions.ball.left;
      this.ball.style.top = frame.positions.ball.top;
    }

    // 2. 드로잉 복원
    this.clearCanvas();
    if (frame.drawings && frame.drawings !== 'data:,') {
      const img = new Image();
      img.onload = () => {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      };
      img.src = frame.drawings;
    }
  }

  // 애니메이션 구동 엔진 (재생)
  playAnimation() {
    if (this.isPlaying) return;
    this.saveCurrentStateToActiveFrame(); // 재생 전 현재 프레임 자동 캐싱
    
    this.isPlaying = true;
    
    // 재생 버튼 토글 UI
    document.getElementById('btn-anim-play').style.display = 'none';
    document.getElementById('btn-anim-pause').style.display = 'inline-flex';

    // 전술판 위의 선수단 노드 전체에 스무스 트랜지션 모드(.animating) 강제 주입
    const players = this.pitch.querySelectorAll('.pitch-player');
    players.forEach(p => p.classList.add('animating'));

    // 만약 마지막 프레임에서 재생을 누르면 처음부터 다시 재생
    if (this.activeFrameIndex >= this.frames.length - 1) {
      this.activeFrameIndex = 0;
      this.loadFrameState(0, false); // 첫 스텝은 순간이동 배치
      this.updateTimelineIndicator();
    }

    const animateNextFrame = () => {
      if (!this.isPlaying) return;

      if (this.activeFrameIndex < this.frames.length - 1) {
        this.activeFrameIndex++;
        this.loadFrameState(this.activeFrameIndex, true); // 좌표 변환하며 smooth transition 작동!
        this.updateTimelineIndicator();

        // 지정 초(800ms) 뒤 다음 프레임 스케줄링 호출
        this.animationTimer = setTimeout(animateNextFrame, this.frameDuration);
      } else {
        // 끝까지 도달하면 자동 정지
        this.pauseAnimation();
        // 재생 완료 알림 피드백 애니메이션 종료
        setTimeout(() => {
          players.forEach(p => p.classList.remove('animating'));
        }, 800);
      }
    };

    // 지연 시간 후 재생 사이클 진입
    this.animationTimer = setTimeout(animateNextFrame, 400);
  }

  // 일시 정지
  pauseAnimation() {
    this.isPlaying = false;
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }

    document.getElementById('btn-anim-play').style.display = 'inline-flex';
    document.getElementById('btn-anim-pause').style.display = 'none';

    // 트랜지션 스타일 즉각 제거 (다시 드래그 가능 모드 복구)
    const players = this.pitch.querySelectorAll('.pitch-player');
    players.forEach(p => p.classList.remove('animating'));
  }

  // 재생 처음으로 초기화
  stopAnimation() {
    this.pauseAnimation();
    this.activeFrameIndex = 0;
    this.loadFrameState(0, false);
    this.updateTimelineIndicator();
  }

  // ==========================================
  // [고도화]: 데이터 직렬화 및 패턴 저장/불러오기 연동
  // ==========================================

  // 현재 프레임셋 전체 구조 직렬화
  getTacticState(name) {
    this.saveCurrentStateToActiveFrame(); // 현재 작업 중이던 최종 스텝 임시 세이브 반영
    
    return {
      id: 'tactic_' + Date.now(),
      name: name,
      // 멀티 프레임 데이터 전체 저장!
      frames: JSON.parse(JSON.stringify(this.frames)),
      createdAt: Date.now()
    };
  }

  // 전술 데이터 불러와 경기장 구성
  loadTacticState(tactic) {
    this.stopAnimation();

    if (tactic.frames && tactic.frames.length > 0) {
      // 프레임 데이터 장전
      this.frames = JSON.parse(JSON.stringify(tactic.frames));
    } else {
      // 혹시 구버전 데이터가 있다면 자동 마이그레이션 적용
      this.frames = [{
        positions: tactic.positions,
        drawings: tactic.drawings || ''
      }];
    }

    this.activeFrameIndex = 0;
    this.loadFrameState(0, false);
    this.updateTimelineIndicator();
  }

  // 전술 리스트 다시 로딩
  async loadSavedTacticsList() {
    const tactics = await dbService.getTacticalPatterns();
    const saveList = document.getElementById('tactic-saved-list');
    const dashboardList = document.getElementById('dashboard-recent-tactics');
    
    const renderHtml = (tlist) => {
      if (tlist.length === 0) {
        return `<li class="text-muted" style="text-align:center; padding:12px; font-size:0.8rem;">저장된 전술 패턴이 없습니다.</li>`;
      }
      return tlist.map(t => {
        const stepCount = t.frames ? t.frames.length : 1;
        return `
          <li class="tactic-save-item" data-id="${t.id}">
            <span class="load-tactic-btn" style="flex:1; cursor:pointer;">
              ${t.name} <small style="color:var(--primary); font-weight:700; margin-left:4px;">(${stepCount}스텝)</small>
            </span>
            <button class="delete-btn" title="삭제"><i class="fa-solid fa-trash"></i></button>
          </li>
        `;
      }).join('');
    };

    if (saveList) {
      saveList.innerHTML = renderHtml(tactics);
      
      saveList.querySelectorAll('.load-tactic-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const item = e.target.closest('.tactic-save-item');
          const t = tactics.find(tac => tac.id === item.dataset.id);
          if (t) {
            this.loadTacticState(t);
            alert(`'${t.name}' 전술 애니메이션을 불러왔습니다! 하단 재생 버튼을 눌러보세요.`);
          }
        });
      });

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

    if (dashboardList) {
      if (tactics.length === 0) {
        dashboardList.innerHTML = `<li style="text-align:center; padding:16px; color:var(--text-muted); font-size:0.85rem;">저장된 전술 패턴이 없습니다.</li>`;
      } else {
        dashboardList.innerHTML = tactics.slice(0, 5).map(t => {
          const stepCount = t.frames ? t.frames.length : 1;
          return `
            <li class="tactic-save-item" data-id="${t.id}">
              <span class="goto-tactics-tab" style="font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-chalkboard-user" style="margin-right:6px; color:var(--primary);"></i> ${t.name} 
                <small style="color:var(--accent); font-weight:700;">(${stepCount}스텝)</small>
              </span>
              <small style="color:var(--text-muted); font-size:0.75rem;">${new Date(t.createdAt).toLocaleDateString()}</small>
            </li>
          `;
        }).join('');

        dashboardList.querySelectorAll('.goto-tactics-tab').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const menuTactics = document.querySelector('[data-target="view-tactics"]');
            if (menuTactics) {
              menuTactics.click();
              const item = e.target.closest('.tactic-save-item');
              const t = tactics.find(tac => tac.id === item.dataset.id);
              if (t) {
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

  // 전술 영구 세이브
  async saveTactic(name) {
    const tacticState = this.getTacticState(name);
    await dbService.saveTacticalPattern(tacticState);
    await this.loadSavedTacticsList();
  }
}

export const tacticalBoard = new TacticalBoard();
