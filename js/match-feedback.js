// match-feedback.js - 적토마 FC 경기 피드백 및 유튜브 토론장 코디네이터
// 과거 경기 목록 필터링, 유튜브 URL 임베드 파서, 피드백 코멘트 관리

import { dbService } from './database.js';

class MatchFeedbackManager {
  constructor() {
    this.matchListEl = document.getElementById('match-feedback-list');
    this.videoCardEl = document.getElementById('match-video-card');
    this.commentsCardEl = document.getElementById('match-comments-card');
    this.timelineEl = document.getElementById('match-feedback-timeline');
    this.commentForm = document.getElementById('match-feedback-comment-form');
    
    this.writerInput = document.getElementById('match-feedback-writer');
    this.contentInput = document.getElementById('match-feedback-content');

    this.matches = [];
    this.selectedMatchId = null;
    this.comments = [];
  }

  // 초기화 및 이벤트 등록
  init() {
    // 피드백 코멘트 제출 이벤트
    if (this.commentForm) {
      this.commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitComment();
      });
    }
  }

  // 외부(app.js)에서 일정이 갱신되면 호출됨
  async updateSchedulesList(schedules) {
    // 오늘 포함 과거의 경기 목록만 필터링 (최신 경기가 맨 위로 가도록 정렬)
    const todayStr = new Date().toISOString().split('T')[0];
    this.matches = schedules
      .filter(s => s.date <= todayStr)
      .sort((a, b) => new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00')));

    this.renderMatchesList();

    // 현재 선택된 경기가 리스트에 있다면 정보 로드
    if (this.selectedMatchId) {
      const exists = this.matches.some(m => m.id === this.selectedMatchId);
      if (exists) {
        await this.selectMatch(this.selectedMatchId);
      } else {
        this.resetDetailView();
      }
    }
  }

  // 좌측 과거 경기 리스트 렌더링
  renderMatchesList() {
    if (!this.matchListEl) return;

    if (this.matches.length === 0) {
      this.matchListEl.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
          아직 치른 경기가 없습니다. [경기 일정] 탭에서 지난 경기 일정을 추가해주세요!
        </div>
      `;
      return;
    }

    this.matchListEl.innerHTML = this.matches.map(m => {
      const isActive = m.id === this.selectedMatchId;
      const hasVideo = (m.videoUrls && m.videoUrls.length > 0) || !!m.videoUrl;
      
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dayName = days[new Date(m.date).getDay()];

      return `
        <div class="feedback-player-item ${isActive ? 'active' : ''}" data-match-id="${m.id}" style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 14px;">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted);">${m.date.replace(/-/g, '/')} (${dayName})</span>
            <span style="font-size: 0.7rem; color: ${hasVideo ? 'var(--primary)' : 'var(--text-muted)'}; background: ${hasVideo ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${hasVideo ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)'}; padding: 1px 6px; border-radius: 4px; font-weight:700;">
              ${hasVideo ? '<i class="fa-solid fa-circle-play"></i> 영상 연동됨' : '영상 미등록'}
            </span>
          </div>
          <div style="font-weight: 800; font-size: 0.95rem; color: ${isActive ? 'var(--primary)' : '#fff'};">
            상대: ${m.opponent}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-location-dot" style="color:var(--danger); font-size: 0.7rem;"></i> ${m.location}
          </div>
        </div>
      `;
    }).join('');

    // 경기 선택 클릭 이벤트 바인딩
    this.matchListEl.querySelectorAll('.feedback-player-item').forEach(item => {
      item.addEventListener('click', async () => {
        const matchId = item.dataset.matchId;
        await this.selectMatch(matchId);
      });
    });
  }

  // 특정 경기 선택
  async selectMatch(matchId) {
    this.selectedMatchId = matchId;
    this.isEditingVideoUrls = false;
    this.editingUrls = null;

    if (this.matchListEl) {
      this.matchListEl.querySelectorAll('.feedback-player-item').forEach(item => {
        if (item.dataset.matchId === matchId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    const match = this.matches.find(m => m.id === matchId);
    if (!match) return;

    // 1. 영상 재생 카드 렌더링
    this.renderVideoCard(match);

    // 2. 코멘트 목록 로드
    this.comments = await dbService.getMatchFeedback(matchId);
    this.renderComments();

    // 3. 댓글 입력 폼 표시
    if (this.commentsCardEl) {
      this.commentsCardEl.style.display = 'block';
    }
  }

  // 선택 해제
  resetDetailView() {
    this.selectedMatchId = null;
    if (this.videoCardEl) {
      this.videoCardEl.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-circle-play" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
          <p>왼쪽 목록에서 경기를 선택하시면 경기 피드백이 로드됩니다.</p>
        </div>
      `;
    }
    if (this.commentsCardEl) {
      this.commentsCardEl.style.display = 'none';
    }
  }

  // 우측 상단 유튜브 플레이어 카드 렌더링
  renderVideoCard(match) {
    if (!this.videoCardEl) return;

    // Get current URLs
    const urls = [];
    if (match.videoUrls && Array.isArray(match.videoUrls)) {
      urls.push(...match.videoUrls);
    } else if (match.videoUrl) {
      urls.push(match.videoUrl);
    }
    const cleanUrls = urls.filter(u => u.trim() !== '');

    // Is in editing mode?
    if (this.isEditingVideoUrls || cleanUrls.length === 0) {
      // Render editor form with multiple inputs
      const currentInputs = this.editingUrls || (cleanUrls.length > 0 ? [...cleanUrls] : ['']);
      this.editingUrls = currentInputs; // keep reference in memory
      
      let inputRowsHtml = currentInputs.map((val, idx) => {
        return `
          <div class="video-url-input-row" style="display: flex; gap: 8px; margin-bottom: 8px; width: 100%;">
            <input type="url" class="form-control match-video-url-input" value="${val}" placeholder="예: https://www.youtube.com/watch?v=..." style="flex: 1; font-size: 0.85rem; height: 38px;">
            ${currentInputs.length > 1 ? `
              <button class="btn btn-secondary btn-remove-url-row" data-index="${idx}" style="height: 38px; width: 38px; border-radius: 8px; color: var(--danger); padding: 0; display: flex; align-items: center; justify-content: center;" title="삭제">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        `;
      }).join('');

      this.videoCardEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span>${match.opponent}전 경기 피드백 영상 등록/편집</span>
          </h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 4px;">
            이 경기의 유튜브 경기 풀영상, 하이라이트 혹은 녹화본 분석 링크를 등록해주세요. <strong>플러스(+) 버튼을 눌러 영상 링크를 여러 개 연동할 수 있습니다.</strong>
          </p>
          <div id="video-url-inputs-container" style="width: 100%;">
            ${inputRowsHtml}
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; align-items: center;">
            <button id="btn-add-url-row" class="btn btn-secondary" style="height: 38px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-plus" style="color: var(--primary);"></i> 링크 추가
            </button>
            <div style="flex: 1;"></div>
            ${cleanUrls.length > 0 ? `
              <button id="btn-cancel-edit-video" class="btn btn-secondary" style="height: 38px; font-weight: 700;">
                취소
              </button>
            ` : ''}
            <button id="btn-save-match-videos" class="btn btn-primary" style="height: 38px; font-weight: 700; min-width: 110px;">
              <i class="fa-solid fa-cloud-arrow-up"></i> 저장 완료
            </button>
          </div>
        </div>
      `;

      // Event listener for adding input row
      document.getElementById('btn-add-url-row').addEventListener('click', () => {
        // read current input values to preserve them
        const inputs = document.querySelectorAll('.match-video-url-input');
        const vals = Array.from(inputs).map(inp => inp.value.trim());
        vals.push('');
        this.editingUrls = vals;
        this.renderVideoCard(match);
      });

      // Event listeners for removing row
      const removeBtns = this.videoCardEl.querySelectorAll('.btn-remove-url-row');
      removeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index);
          const inputs = document.querySelectorAll('.match-video-url-input');
          const vals = Array.from(inputs).map(inp => inp.value.trim());
          vals.splice(idx, 1);
          this.editingUrls = vals;
          this.renderVideoCard(match);
        });
      });

      // Cancel button
      const cancelBtn = document.getElementById('btn-cancel-edit-video');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.isEditingVideoUrls = false;
          this.editingUrls = null;
          this.renderVideoCard(match);
        });
      }

      // Save button
      document.getElementById('btn-save-match-videos').addEventListener('click', async () => {
        const inputs = document.querySelectorAll('.match-video-url-input');
        const vals = Array.from(inputs).map(inp => inp.value.trim()).filter(v => v !== '');
        
        if (vals.length === 0) {
          alert('최소 하나의 유튜브 동영상 링크를 입력하거나, 취소해 주세요.');
          return;
        }

        await this.saveVideoUrls(match.id, vals);
        this.isEditingVideoUrls = false;
        this.editingUrls = null;
      });

    } else {
      // Render players list stacked
      let playersHtml = cleanUrls.map((url, index) => {
        const embedUrl = this.parseYoutubeEmbedUrl(url);
        return `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-circle-play" style="color: var(--primary);"></i> 분석 영상 #${index + 1}
            </div>
            ${embedUrl ? `
              <div class="video-responsive" style="margin-bottom: 8px;">
                <iframe src="${embedUrl}" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        allowfullscreen></iframe>
              </div>
            ` : `
              <div style="background: rgba(239,68,68,0.08); border:1px dashed rgba(239,68,68,0.2); padding:20px; border-radius:10px; color:#ef4444; font-size:0.85rem; text-align:center;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:8px;"></i><br>
                유튜브 링크 주소 파싱 실패! 링크가 올바른 유튜브 주소인지 확인해주세요. (입력값: ${url})
              </div>
            `}
          </div>
        `;
      }).join('');

      this.videoCardEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <h3 style="font-size: 1.2rem; font-weight: 800; color: #fff; margin-bottom: 0;">
              ⚽ ${match.opponent}전 분석 피드백
            </h3>
            <button id="btn-edit-match-video" class="btn btn-secondary" style="font-size: 0.75rem; padding: 6px 12px;" title="유튜브 영상 주소 변경">
              <i class="fa-solid fa-pen-to-square"></i> 영상 링크 추가/변경
            </button>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${playersHtml}
          </div>
        </div>
      `;

      // Event listener for opening editor
      document.getElementById('btn-edit-match-video').addEventListener('click', () => {
        this.isEditingVideoUrls = true;
        this.editingUrls = [...cleanUrls];
        this.renderVideoCard(match);
      });
    }
  }

  // 유튜브 일반/모바일/쇼츠 주소를 Embed 주소로 치환
  parseYoutubeEmbedUrl(url) {
    if (!url) return '';
    let videoId = '';
    
    // 1. Shorts
    if (url.includes('/shorts/')) {
      videoId = url.split('/shorts/')[1].split('?')[0].split('&')[0];
    }
    // 2. 모바일/간편 공유 youtu.be
    else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0].split('&')[0];
    }
    // 3. m.youtube / 일반 watch?v=
    else if (url.includes('v=')) {
      videoId = url.split('v=')[1].split('&')[0];
    }
    // 4. 이미 embed 주소형식인 경우
    else if (url.includes('/embed/')) {
      return url;
    }
    
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return '';
  }

  // 비디오 링크 DB 저장 진행
  async saveVideoUrls(matchId, urls) {
    try {
      await dbService.saveMatchVideoUrls(matchId, urls);
      alert('경기 분석 유튜브 영상들이 정상적으로 연동되었습니다!');
      
      // 메모리 즉시 반영 및 디테일 새로 로드
      const match = this.matches.find(m => m.id === matchId);
      if (match) {
        match.videoUrls = urls;
        match.videoUrl = urls[0] || '';
        this.renderVideoCard(match);
        this.renderMatchesList();
      }
    } catch (e) {
      console.error(e);
      alert('영상 저장 중 오류가 발생했습니다: ' + e.message);
    }
  }

  // 코멘트 타임라인 목록 렌더링
  renderComments() {
    if (!this.timelineEl) return;

    if (this.comments.length === 0) {
      this.timelineEl.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 0.85rem; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <i class="fa-regular fa-comments" style="font-size: 2rem; opacity:0.4;"></i>
          아직 경기 피드백 의견이 없습니다.<br>영상을 보고 팀원들에게 전술적 코멘트를 남겨보세요!
        </div>
      `;
      return;
    }

    const sorted = [...this.comments].sort((a, b) => b.createdAt - a.createdAt);

    this.timelineEl.innerHTML = sorted.map(c => {
      const isAnonymous = !c.nickname || c.nickname === '익명';
      const initial = isAnonymous ? '익' : c.nickname.substring(0, 1);
      
      const timeStr = this.formatTimeAgo(c.createdAt);

      return `
        <div class="feedback-comment-bubble">
          <div class="feedback-comment-avatar ${isAnonymous ? 'anonymous' : ''}">
            ${initial}
          </div>
          <div class="feedback-comment-details">
            <div class="feedback-comment-meta">
              <span class="feedback-comment-writer">${c.nickname || '익명'}</span>
              <span class="feedback-comment-time">${timeStr}</span>
            </div>
            <div class="feedback-comment-text">${c.content}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 댓글 코멘트 제출
  async submitComment() {
    if (!this.selectedMatchId) return;

    const nickname = this.writerInput.value.trim() || '익명';
    const content = this.contentInput.value.trim();

    if (!content) return;

    const newComment = {
      id: 'mcomment_' + Date.now(),
      nickname,
      content,
      createdAt: Date.now()
    };

    try {
      await dbService.saveMatchFeedbackComment(this.selectedMatchId, newComment);
      
      this.comments.push(newComment);
      this.renderComments();

      this.contentInput.value = '';
      if (this.timelineEl) {
        this.timelineEl.scrollTop = 0;
      }
    } catch (e) {
      console.error(e);
      alert('피드백 제출 실패: ' + e.message);
    }
  }

  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
      return '방금 전';
    } else if (minutes < 60) {
      return `${minutes}분 전`;
    } else if (hours < 24) {
      return `${hours}시간 전`;
    } else if (days < 7) {
      return `${days}일 전`;
    } else {
      const date = new Date(timestamp);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    }
  }
}

export const matchFeedbackManager = new MatchFeedbackManager();
