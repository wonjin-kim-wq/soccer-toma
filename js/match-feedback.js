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
      const hasVideo = !!m.videoUrl;
      
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

    const hasVideo = !!match.videoUrl;

    if (!hasVideo) {
      // 비디오 주소가 없는 경우: 링크 등록 폼 노출
      this.videoCardEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span>${match.opponent}전 경기 피드백 영상 등록</span>
          </h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">
            이 경기의 유튜브 경기 풀영상, 하이라이트 혹은 녹화본 분석 링크를 등록해주세요. 팀원들과 영상을 재생하며 의견을 나눌 수 있습니다.
          </p>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <input type="url" id="match-video-url-input" class="form-control" placeholder="예: https://www.youtube.com/watch?v=..." style="flex: 1; min-width: 250px; font-size: 0.85rem; height: 38px;">
            <button id="btn-save-match-video" class="btn btn-primary" style="height: 38px; font-weight: 700; min-width:110px;">
              <i class="fa-solid fa-cloud-arrow-up"></i> 영상 링크 등록
            </button>
          </div>
        </div>
      `;

      // 링크 저장 클릭 바인딩
      const saveBtn = document.getElementById('btn-save-match-video');
      const urlInput = document.getElementById('match-video-url-input');

      if (saveBtn && urlInput) {
        saveBtn.addEventListener('click', async () => {
          const url = urlInput.value.trim();
          if (!url) {
            alert('유튜브 동영상 링크를 입력해주세요.');
            return;
          }
          await this.saveVideoUrl(match.id, url);
        });
      }
    } else {
      // 비디오 주소가 이미 등록된 경우: 유튜브 임베드 렌더링
      const embedUrl = this.parseYoutubeEmbedUrl(match.videoUrl);

      this.videoCardEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <h3 style="font-size: 1.2rem; font-weight: 800; color: #fff; margin-bottom: 0;">
              ⚽ ${match.opponent}전 분석 피드백
            </h3>
            <button id="btn-edit-match-video" class="btn btn-secondary" style="font-size: 0.75rem; padding: 6px 12px;" title="유튜브 영상 주소 변경">
              <i class="fa-solid fa-pen-to-square"></i> 영상 링크 변경
            </button>
          </div>
          
          ${embedUrl ? `
            <div class="video-responsive">
              <iframe src="${embedUrl}" 
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                      allowfullscreen></iframe>
            </div>
          ` : `
            <div style="background: rgba(239,68,68,0.08); border:1px dashed rgba(239,68,68,0.2); padding:20px; border-radius:10px; color:#ef4444; font-size:0.85rem; text-align:center;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem; margin-bottom:8px;"></i><br>
              유튜브 링크 주소 파싱 실패! 영상 링크를 올바른 유튜브 주소로 재생성해 주세요.
            </div>
          `}
        </div>
      `;

      // 영상 주소 변경 클릭 바인딩
      const editBtn = document.getElementById('btn-edit-match-video');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          // 비디오 주소를 빈 값으로 초기화하고 재렌더링
          match.videoUrl = '';
          this.renderVideoCard(match);
        });
      }
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
  async saveVideoUrl(matchId, url) {
    try {
      await dbService.saveMatchVideoUrl(matchId, url);
      alert('경기 분석 유튜브 영상이 정상적으로 연동되었습니다!');
      
      // 메모리 즉시 반영 및 디테일 새로 로드
      const match = this.matches.find(m => m.id === matchId);
      if (match) {
        match.videoUrl = url;
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
