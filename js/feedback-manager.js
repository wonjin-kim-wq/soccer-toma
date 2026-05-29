// feedback-manager.js - 적토마 FC 개인 피드백 및 코멘트 모듈
// 선수단 개별 코멘트 등록/조회, 실시간 검색, 타임라인 및 그라데이션 프로필 렌더러

import { dbService } from './database.js';

class FeedbackManager {
  constructor() {
    this.playerListEl = document.getElementById('feedback-player-list');
    this.playerSearchInput = document.getElementById('feedback-player-search');
    this.playerHeaderCard = document.getElementById('feedback-player-header-card');
    this.commentsCard = document.getElementById('feedback-comments-card');
    this.timelineEl = document.getElementById('feedback-timeline');
    this.commentForm = document.getElementById('feedback-comment-form');
    
    this.writerInput = document.getElementById('feedback-writer');
    this.contentInput = document.getElementById('feedback-content');

    // 최신 코멘트 히스토리 위젯 엘리먼트 바인딩 [NEW]
    this.historyCardEl = document.getElementById('feedback-history-card');
    this.historyListEl = document.getElementById('feedback-history-list');

    this.players = [];
    this.selectedPlayerId = null;
    this.comments = [];
  }

  // 초기화 및 리스너 등록
  init() {
    // 1. 선수 검색 필터 이벤트
    if (this.playerSearchInput) {
      this.playerSearchInput.addEventListener('input', (e) => {
        this.renderPlayersList(e.target.value.trim());
      });
    }

    // 2. 피드백 코멘트 등록 이벤트
    if (this.commentForm) {
      this.commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitComment();
      });
    }

    // 3. 좋아요 및 싫어요 클릭 이벤트 위임 [NEW]
    if (this.timelineEl) {
      this.timelineEl.addEventListener('click', async (e) => {
        const likeBtn = e.target.closest('.like-btn');
        const dislikeBtn = e.target.closest('.dislike-btn');
        if (likeBtn) {
          e.stopPropagation();
          const { playerId, commentId } = likeBtn.dataset;
          await this.handleLikeDislike(playerId, commentId, 'likes');
        } else if (dislikeBtn) {
          e.stopPropagation();
          const { playerId, commentId } = dislikeBtn.dataset;
          await this.handleLikeDislike(playerId, commentId, 'dislikes');
        }
      });
    }

    if (this.historyListEl) {
      this.historyListEl.addEventListener('click', async (e) => {
        const likeBtn = e.target.closest('.like-btn');
        const dislikeBtn = e.target.closest('.dislike-btn');
        if (likeBtn) {
          e.stopPropagation();
          const { playerId, commentId } = likeBtn.dataset;
          await this.handleLikeDislike(playerId, commentId, 'likes');
        } else if (dislikeBtn) {
          e.stopPropagation();
          const { playerId, commentId } = dislikeBtn.dataset;
          await this.handleLikeDislike(playerId, commentId, 'dislikes');
        }
      });
    }
  }

  // 외부(app.js)에서 최신 선수 목록을 갱신해줄 때 호출
  async updatePlayersList(playersList) {
    this.players = playersList;
    this.renderPlayersList();
    
    // 만약 현재 선택된 선수가 등록되어 있다면 헤더 및 코멘트 갱신
    if (this.selectedPlayerId) {
      const exists = this.players.some(p => p.id === this.selectedPlayerId);
      if (exists) {
        await this.selectPlayer(this.selectedPlayerId);
      } else {
        this.resetDetailView();
      }
    }
  }

  // 좌측 선수 카드 리스트 렌더링
  renderPlayersList(searchTerm = '') {
    if (!this.playerListEl) return;

    let filtered = this.players;
    if (searchTerm) {
      filtered = this.players.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (filtered.length === 0) {
      this.playerListEl.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
          검색된 선수가 없습니다.
        </div>
      `;
      return;
    }

    this.playerListEl.innerHTML = filtered.map(p => {
      const isActive = p.id === this.selectedPlayerId;
      
      let posClass = '';
      switch(p.position) {
        case 'FW': posClass = 'position-fw'; break;
        case 'MF': posClass = 'position-mf'; break;
        case 'DF': posClass = 'position-df'; break;
        case 'GK': posClass = 'position-gk'; break;
      }

      return `
        <div class="feedback-player-item ${isActive ? 'active' : ''}" data-player-id="${p.id}">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, #3B82F6 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1);">
              ${p.name.charAt(0)}
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span class="player-name">${p.name}</span>
              <span style="font-size: 0.7rem; color: var(--text-muted);">등번호 #${p.backNumber}</span>
            </div>
          </div>
          <span class="player-position-badge ${posClass}" style="font-size: 0.65rem; padding: 1px 6px;">
            ${p.position}
          </span>
        </div>
      `;
    }).join('');

    // 개별 항목 클릭 이벤트 바인딩
    this.playerListEl.querySelectorAll('.feedback-player-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const playerId = item.dataset.playerId;
        await this.selectPlayer(playerId);
      });
    });
  }

  // 특정 선수 선택 처리 및 우측 영역 로드
  async selectPlayer(playerId) {
    this.selectedPlayerId = playerId;
    
    // 좌측 활성 탭 하이라이트 즉시 보정
    if (this.playerListEl) {
      this.playerListEl.querySelectorAll('.feedback-player-item').forEach(item => {
        if (item.dataset.playerId === playerId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    // 1. 프로필 요약 카드 렌더링
    this.renderPlayerHeader(player);

    // 2. 피드백 코멘트 데이터 가져오기 및 렌더링
    this.comments = await dbService.getFeedback(playerId);
    this.renderComments();

    // 3. 댓글 입력 상자 노출
    if (this.commentsCard) {
      this.commentsCard.style.display = 'block';
    }

    // 4. 히스토리 위젯 숨기기 [NEW]
    if (this.historyCardEl) {
      this.historyCardEl.style.display = 'none';
    }
  }

  // 선택 해제 시 디폴트 상태 복구
  resetDetailView() {
    this.selectedPlayerId = null;
    if (this.playerHeaderCard) {
      this.playerHeaderCard.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-user-pen" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
          <p>왼쪽 목록에서 선수를 선택하시면 개인 피드백이 로드됩니다.</p>
        </div>
      `;
    }
    if (this.commentsCard) {
      this.commentsCard.style.display = 'none';
    }
    // 좌측 활성 탭 하이라이트 해제 [NEW]
    if (this.playerListEl) {
      this.playerListEl.querySelectorAll('.feedback-player-item').forEach(item => {
        item.classList.remove('active');
      });
    }
    // 히스토리 위젯 노출 및 최신 데이터 동기화 로드 [NEW]
    if (this.historyCardEl) {
      this.historyCardEl.style.display = 'block';
      this.loadAllCommentsHistory();
    }
  }

  // 우측 상단 선수 프로필 요약 카드 정보 출력
  renderPlayerHeader(player) {
    if (!this.playerHeaderCard) return;

    let posText = '';
    let posColor = '';
    switch(player.position) {
      case 'FW': posText = '공격수 (FW)'; posColor = '#ef4444'; break;
      case 'MF': posText = '미드필더 (MF)'; posColor = '#f59e0b'; break;
      case 'DF': posText = '수비수 (DF)'; posColor = '#3b82f6'; break;
      case 'GK': posText = '골키퍼 (GK)'; posColor = '#10b981'; break;
    }

    this.playerHeaderCard.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 18px;">
          <div style="width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.4rem; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
            ${player.name.charAt(0)}
          </div>
          <div>
            <h3 style="font-size: 1.3rem; font-weight: 800; color: #fff; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
              <span>${player.name}</span>
              <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">#${player.backNumber}</span>
            </h3>
            <p style="font-size: 0.8rem; color: ${posColor}; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${posColor};"></span>
              ${posText}
            </p>
          </div>
        </div>
        
        <!-- 시즌 스탯 간략 박스 -->
        <div style="display: flex; gap: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 10px;">
          <div style="text-align: center; min-width: 50px; border-right: 1px solid var(--border-color); padding-right: 12px;">
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 2px;">출전 경기</div>
            <div style="font-size: 1rem; font-weight: 800; color: #fff;">${player.matches || 0}</div>
          </div>
          <div style="text-align: center; min-width: 40px; border-right: 1px solid var(--border-color); padding-right: 12px; padding-left: 4px;">
            <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 2px;">득점</div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--accent);">${player.goals || 0}</div>
          </div>
          <div style="text-align: center; min-width: 40px; padding-left: 4px;">
            <div style="font-size: 0.7rem; color: var(--info); margin-bottom: 2px;">도움</div>
            <div style="font-size: 1rem; font-weight: 800; color: var(--info);">${player.assists || 0}</div>
          </div>
        </div>
      </div>
    `;
  }

  // 타임라인 내에 댓글 리스트 출력
  renderComments() {
    if (!this.timelineEl) return;

    if (this.comments.length === 0) {
      this.timelineEl.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 0.85rem; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <i class="fa-regular fa-comment-dots" style="font-size: 2rem; opacity:0.4;"></i>
          아직 작성된 피드백 코멘트가 없습니다.<br>첫 번째 따뜻한 응원의 한마디를 남겨보세요!
        </div>
      `;
      return;
    }

    // 작성 시간 기준 내림차순 정렬 (최신 댓글이 맨 위로)
    const sorted = [...this.comments].sort((a, b) => b.createdAt - a.createdAt);

    this.timelineEl.innerHTML = sorted.map(c => {
      const isAnonymous = !c.nickname || c.nickname === '익명';
      const initial = isAnonymous ? '익' : c.nickname.substring(0, 1);
      
      const timeStr = this.formatTimeAgo(c.createdAt);
      const likes = c.likes || 0;
      const dislikes = c.dislikes || 0;

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
            
            <!-- 좋아요 및 싫어요 버튼 [NEW] -->
            <div class="feedback-actions" style="display: flex; gap: 12px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 8px;">
              <button class="action-btn like-btn" data-player-id="${this.selectedPlayerId}" data-comment-id="${c.id}" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; transition: all 0.2s;">
                <i class="fa-solid fa-thumbs-up" style="color: var(--primary);"></i> 
                <span>좋아요</span> 
                <strong class="like-count" style="color: var(--primary);">${likes}</strong>
              </button>
              <button class="action-btn dislike-btn" data-player-id="${this.selectedPlayerId}" data-comment-id="${c.id}" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; transition: all 0.2s;">
                <i class="fa-solid fa-thumbs-down" style="color: var(--danger);"></i> 
                <span>싫어요</span> 
                <strong class="dislike-count" style="color: var(--danger);">${dislikes}</strong>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 닉네임 익명 여부 및 유효성 검사 후 등록 처리
  async submitComment() {
    if (!this.selectedPlayerId) return;

    const nickname = this.writerInput.value.trim() || '익명';
    const content = this.contentInput.value.trim();

    if (!content) return;

    const newComment = {
      id: 'comment_' + Date.now(),
      nickname,
      content,
      createdAt: Date.now(),
      likes: 0,
      dislikes: 0
    };

    try {
      // 1. DB 저장
      await dbService.saveFeedbackComment(this.selectedPlayerId, newComment);
      
      // 2. 메모리 캐시 반영 및 UI 갱신
      this.comments.push(newComment);
      this.renderComments();

      // 3. 입력 폼 초기화
      this.contentInput.value = '';
      
      // 스크롤을 타임라인 상단으로 올리기 (최신글이 맨 위에 오므로)
      if (this.timelineEl) {
        this.timelineEl.scrollTop = 0;
      }
      
    } catch (e) {
      console.error(e);
      alert('피드백 저장 중 오류가 발생했습니다: ' + e.message);
    }
  }

  // 경과된 시간 문자열 포맷팅
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
      // 7일 이상 경과 시 정상 날짜 출력
      const date = new Date(timestamp);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    }
  }

  // 오늘 날짜인지 판별 헬퍼 [NEW]
  isToday(timestamp) {
    const commentDate = new Date(timestamp);
    const today = new Date();
    return commentDate.getFullYear() === today.getFullYear() &&
           commentDate.getMonth() === today.getMonth() &&
           commentDate.getDate() === today.getDate();
  }

  // 좋아요 및 싫어요 클릭 처리 핸들러 [NEW]
  async handleLikeDislike(playerId, commentId, type) {
    try {
      await dbService.updateFeedbackCommentLike(playerId, commentId, type);
      
      if (this.selectedPlayerId === playerId) {
        // 상세 타임라인 리로드
        this.comments = await dbService.getFeedback(playerId);
        this.renderComments();
      } else {
        // 전체 히스토리 리로드
        await this.loadAllCommentsHistory();
      }
    } catch (e) {
      console.error("반응 처리 실패:", e);
    }
  }

  // 전체 선수단의 최신 코멘트 히스토리 가져오기 및 렌더링 [NEW]
  async loadAllCommentsHistory() {
    if (!this.historyListEl) return;

    this.historyListEl.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.8rem; margin-bottom: 12px; color: var(--primary);"></i>
        <p>최신 피드백 코멘트 히스토리를 불러오는 중입니다...</p>
      </div>
    `;

    try {
      // 모든 선수들의 피드백 데이터를 비동기 병렬로 가져옵니다.
      const commentsPromises = this.players.map(async (player) => {
        const playerComments = await dbService.getFeedback(player.id);
        return playerComments.map(c => ({
          ...c,
          playerId: player.id,
          playerName: player.name,
          playerPosition: player.position
        }));
      });

      const allCommentsNested = await Promise.all(commentsPromises);
      const allComments = allCommentsNested.flat();

      // 최신순 정렬 (createdAt 기준 내림차순)
      allComments.sort((a, b) => b.createdAt - a.createdAt);

      if (allComments.length === 0) {
        this.historyListEl.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 0.85rem; display:flex; flex-direction:column; align-items:center; gap:8px;">
            <i class="fa-regular fa-comment-dots" style="font-size: 2rem; opacity:0.4;"></i>
            아직 작성된 피드백 코멘트가 없습니다.<br>선수단에게 첫 번째 따뜻한 응원을 남겨보세요!
          </div>
        `;
        return;
      }

      // [NEW] 당일에 가장 많은 좋아요를 얻은 베스트 피드백 추출 (최소 1개 이상 좋아요)
      const todayComments = allComments.filter(c => this.isToday(c.createdAt) && (c.likes || 0) > 0);
      let bestComment = null;
      if (todayComments.length > 0) {
        todayComments.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        bestComment = todayComments[0];
      }

      // 상위 10개만 슬라이스하여 표시 (베스트 코멘트가 있어도 전체 최신 이력 10개 표시)
      const latestComments = allComments.slice(0, 10);

      let historyHtml = '';

      // 오늘의 베스트 코멘트 카드 추가 [NEW]
      if (bestComment) {
        const isAnonymous = !bestComment.nickname || bestComment.nickname === '익명';
        const initial = isAnonymous ? '익' : bestComment.nickname.substring(0, 1);
        const timeStr = this.formatTimeAgo(bestComment.createdAt);
        let posText = '';
        switch(bestComment.playerPosition) {
          case 'FW': posText = 'FW'; break;
          case 'MF': posText = 'MF'; break;
          case 'DF': posText = 'DF'; break;
          case 'GK': posText = 'GK'; break;
        }

        historyHtml += `
          <div class="feedback-comment-bubble history-item" data-player-id="${bestComment.playerId}" style="cursor: pointer; display: flex; gap: 12px; padding: 16px; border: 2px solid var(--accent); background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%); border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.15); position: relative;">
            <div style="position: absolute; top: -12px; right: 16px; background: var(--accent); color: #000; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 20px; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(245,158,11,0.3);">
              <i class="fa-solid fa-crown"></i> 오늘의 베스트 피드백
            </div>
            <div class="feedback-comment-avatar" style="background: linear-gradient(135deg, var(--accent) 0%, #D97706 100%); flex-shrink: 0;">
              ${initial}
            </div>
            <div class="feedback-comment-details" style="flex: 1;">
              <div class="feedback-comment-meta" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 4px;">
                <span class="feedback-comment-writer" style="font-weight: 800; color: #fff;">
                  ${bestComment.nickname || '익명'} 
                  <span style="color: var(--accent); font-weight: 800; margin-left: 4px; padding: 2px 6px; background: rgba(245, 158, 11, 0.1); border-radius: 4px; font-size: 0.7rem;">
                    ➡️ ${bestComment.playerName} (${posText})
                  </span>
                </span>
                <span class="feedback-comment-time" style="color: var(--text-muted);">${timeStr}</span>
              </div>
              <div class="feedback-comment-text" style="font-size: 0.85rem; color: #fff; line-height: 1.5; white-space: pre-wrap; font-weight: 500;">${bestComment.content}</div>
              
              <!-- 좋아요 및 싫어요 버튼 [NEW] -->
              <div class="feedback-actions" style="display: flex; gap: 12px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                <button class="action-btn like-btn" data-player-id="${bestComment.playerId}" data-comment-id="${bestComment.id}" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.15); color: #fff; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; transition: all 0.2s;">
                  <i class="fa-solid fa-thumbs-up" style="color: var(--primary);"></i> 
                  <span>좋아요</span> 
                  <strong class="like-count" style="color: var(--primary);">${bestComment.likes || 0}</strong>
                </button>
                <button class="action-btn dislike-btn" data-player-id="${bestComment.playerId}" data-comment-id="${bestComment.id}" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.15); color: #fff; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; transition: all 0.2s;">
                  <i class="fa-solid fa-thumbs-down" style="color: var(--danger);"></i> 
                  <span>싫어요</span> 
                  <strong class="dislike-count" style="color: var(--danger);">${bestComment.dislikes || 0}</strong>
                </button>
              </div>
            </div>
          </div>
        `;
      }

      // 일반 최신 히스토리 목록 렌더링
      const latestHtml = latestComments.map(c => {
        const isAnonymous = !c.nickname || c.nickname === '익명';
        const initial = isAnonymous ? '익' : c.nickname.substring(0, 1);
        const timeStr = this.formatTimeAgo(c.createdAt);

        let posText = '';
        switch(c.playerPosition) {
          case 'FW': posText = 'FW'; break;
          case 'MF': posText = 'MF'; break;
          case 'DF': posText = 'DF'; break;
          case 'GK': posText = 'GK'; break;
        }

        return `
          <div class="feedback-comment-bubble history-item" data-player-id="${c.playerId}" style="cursor: pointer; display: flex; gap: 12px; padding: 14px 16px; transition: all 0.2s;">
            <div class="feedback-comment-avatar ${isAnonymous ? 'anonymous' : ''}" style="flex-shrink: 0;">
              ${initial}
            </div>
            <div class="feedback-comment-details" style="flex: 1;">
              <div class="feedback-comment-meta" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 4px;">
                <span class="feedback-comment-writer" style="font-weight: 800; color: var(--text-primary);">
                  ${c.nickname || '익명'} 
                  <span style="color: var(--primary); font-weight: 800; margin-left: 4px; padding: 2px 6px; background: rgba(16, 185, 129, 0.08); border-radius: 4px; font-size: 0.7rem;">
                    ➡️ ${c.playerName} (${posText})
                  </span>
                </span>
                <span class="feedback-comment-time" style="color: var(--text-muted);">${timeStr}</span>
              </div>
              <div class="feedback-comment-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap; margin-bottom: 8px;">${c.content}</div>
              
              <!-- 좋아요 및 싫어요 버튼 [NEW] -->
              <div class="feedback-actions" style="display: flex; gap: 12px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 6px;">
                <button class="action-btn like-btn" data-player-id="${c.playerId}" data-comment-id="${c.id}" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; transition: all 0.2s;">
                  <i class="fa-solid fa-thumbs-up" style="color: var(--primary);"></i> 
                  <span>좋아요</span> 
                  <strong class="like-count" style="color: var(--primary);">${c.likes || 0}</strong>
                </button>
                <button class="action-btn dislike-btn" data-player-id="${c.playerId}" data-comment-id="${c.id}" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; transition: all 0.2s;">
                  <i class="fa-solid fa-thumbs-down" style="color: var(--danger);"></i> 
                  <span>싫어요</span> 
                  <strong class="dislike-count" style="color: var(--danger);">${c.dislikes || 0}</strong>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      this.historyListEl.innerHTML = historyHtml + latestHtml;

      // 히스토리 항목 클릭 시 해당 선수 상세 뷰로 이동
      this.historyListEl.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          // [NEW] 만약 좋아요/싫어요 버튼이나 반응 영역 내부를 클릭했다면 디테일 뷰로 이동하지 않음
          if (e.target.closest('.action-btn')) return;

          const playerId = item.dataset.playerId;
          await this.selectPlayer(playerId);
        });
      });

    } catch (e) {
      console.error("최신 코멘트 히스토리 로드 오류:", e);
      this.historyListEl.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--danger); font-size: 0.85rem;">
          코멘트 히스토리를 로드하지 못했습니다: ${e.message}
        </div>
      `;
    }
  }
}

export const feedbackManager = new FeedbackManager();
