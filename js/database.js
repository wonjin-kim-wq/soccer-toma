// database.js - 적토마 FC 데이터베이스 관리 및 동기화 서비스
// Firebase 및 LocalStorage를 연동하는 하이브리드 어댑터 패턴

const STORAGE_KEYS = {
  PLAYERS: 'jeoktoma_players',
  DUES: 'jeoktoma_dues',
  TACTICS: 'jeoktoma_tactics',
  SCHEDULES: 'jeoktoma_schedules',
  FIREBASE_CONFIG: 'jeoktoma_firebase_config',
  GSHEET_URL: 'jeoktoma_gsheet_url',
  FEEDBACK: 'jeoktoma_feedback'
};

// 기본 내장 Firebase 설정 (모든 사용자가 설정을 입력하지 않고 즉시 동일한 DB를 연동 및 공유할 수 있도록 지원)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBRvkgY2NxNN3Saymcx3IrYxDTpxyvBkBs",
  authDomain: "jeoktoma-fc-73913.firebaseapp.com",
  projectId: "jeoktoma-fc-73913",
  storageBucket: "jeoktoma-fc-73913.firebasestorage.app",
  messagingSenderId: "648282695955",
  appId: "1:648282695955:web:c404edfeaf3679b8d352e6",
  measurementId: "G-HDMBZDTN8G"
};

// 기본 샘플 데이터 (선수단)
const DEFAULT_PLAYERS = [
  { id: 'p1', name: '손흥민', backNumber: '7', position: 'FW', goals: 12, assists: 6, matches: 15 },
  { id: 'p2', name: '이강인', backNumber: '10', position: 'MF', goals: 5, assists: 9, matches: 14 },
  { id: 'p3', name: '황희찬', backNumber: '11', position: 'FW', goals: 8, assists: 3, matches: 12 },
  { id: 'p4', name: '김민재', backNumber: '3', position: 'DF', goals: 1, assists: 1, matches: 15 },
  { id: 'p5', name: '설영우', backNumber: '22', position: 'DF', goals: 0, assists: 4, matches: 13 },
  { id: 'p6', name: '조현우', backNumber: '21', position: 'GK', goals: 0, assists: 0, matches: 15 }
];

// 기본 샘플 데이터 (회비)
const DEFAULT_DUES = {
  '2026': {
    'p1': { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false, 12: false },
    'p2': { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false, 12: false },
    'p3': { 1: true, 2: true, 3: true, 4: false, 5: false, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false, 12: false },
    'p4': { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false, 12: false },
    'p5': { 1: true, 2: true, 3: false, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false, 12: false },
    'p6': { 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false, 10: false, 11: false, 12: false }
  }
};

// 기본 샘플 데이터 (경기 일정 - 2026년 5월 28일 기준 근접한 매치들로 시뮬레이션)
const DEFAULT_SCHEDULES = [
  {
    id: 'sched_1',
    date: '2026-05-31', // 오늘(5월 28일)로부터 3일 뒤
    time: '14:00',
    opponent: '타이거 FC',
    location: '뚝섬 한강축구장 A코트',
    description: '2026 시즌 친선매치 (유니폼: 홈 에메랄드)'
  },
  {
    id: 'sched_2',
    date: '2026-06-07', // 10일 뒤
    time: '10:00',
    opponent: '블루 드래곤즈',
    location: '잠실 보조경기장',
    description: '구청장배 직장인 리그 3차전'
  },
  {
    id: 'sched_3',
    date: '2026-06-21',
    time: '09:00',
    opponent: '불사조 축구단',
    location: '목동 종합운동장 주경기장',
    description: '정기 교류 매치'
  }
];

class DatabaseService {
  constructor() {
    this.firebaseApp = null;
    this.firestore = null;
    this.isConnected = false;
    this.onStatusChangeCallback = null;
  }

  // 데이터베이스 초기화
  async init(onStatusChange = null) {
    if (onStatusChange) {
      this.onStatusChangeCallback = onStatusChange;
    }

    // 로컬 스토리지에 기본 데이터가 없으면 세팅
    if (!localStorage.getItem(STORAGE_KEYS.PLAYERS)) {
      localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(DEFAULT_PLAYERS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DUES)) {
      localStorage.setItem(STORAGE_KEYS.DUES, JSON.stringify(DEFAULT_DUES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TACTICS)) {
      localStorage.setItem(STORAGE_KEYS.TACTICS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SCHEDULES)) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(DEFAULT_SCHEDULES));
    }

    const config = this.getFirebaseConfig();
    if (config) {
      try {
        await this.initializeFirebase(config);
      } catch (error) {
        console.error('Firebase 초기화 실패, 로컬 모드로 동작합니다.', error);
        this.notifyStatus(false);
      }
    } else {
      this.notifyStatus(false);
    }
  }

  // Firebase 초기화 로직
  async initializeFirebase(config) {
    try {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
      const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

      this.firebaseApp = initializeApp(config);
      this.firestore = getFirestore(this.firebaseApp);
      this.isConnected = true;
      this.notifyStatus(true);
      console.log('Firebase Firestore 연결 성공!');
      return true;
    } catch (e) {
      this.isConnected = false;
      this.notifyStatus(false);
      throw e;
    }
  }

  // 상태 변화 알림
  notifyStatus(connected) {
    this.isConnected = connected;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(connected);
    }
  }

  // Firebase 설정 저장
  async saveFirebaseConfig(config) {
    if (!config || !config.apiKey || !config.projectId) {
      throw new Error('유효한 Firebase 설정 데이터가 아닙니다.');
    }
    localStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIG, JSON.stringify(config));
    
    await this.initializeFirebase(config);
    
    if (this.isConnected) {
      await this.syncLocalToFirebase();
    }
  }

  // Firebase 설정 지우기 (로컬 모드로 회귀)
  clearFirebaseConfig() {
    localStorage.removeItem(STORAGE_KEYS.FIREBASE_CONFIG);
    this.firebaseApp = null;
    this.firestore = null;
    this.isConnected = false;
    this.notifyStatus(false);
  }

  getFirebaseConfig() {
    const configStr = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
    if (configStr) {
      try {
        return JSON.parse(configStr);
      } catch (e) {
        console.error("Firebase config parsing error", e);
      }
    }
    // 저장된 수동 설정이 없는 경우, 기본 내장된 공용 Firebase 설정을 자동으로 불러옵니다.
    return DEFAULT_FIREBASE_CONFIG;
  }

  getLocalData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  saveLocalData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // 1. 선수단 관리
  async getPlayers() {
    if (this.isConnected) {
      try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const querySnapshot = await getDocs(collection(this.firestore, "players"));
        const players = [];
        querySnapshot.forEach((doc) => {
          players.push({ id: doc.id, ...doc.data() });
        });
        
        players.sort((a, b) => Number(a.backNumber || 99) - Number(b.backNumber || 99));
        this.saveLocalData(STORAGE_KEYS.PLAYERS, players);
        return players;
      } catch (error) {
        console.warn("Firestore에서 선수 데이터를 불러오지 못해 로컬 데이터를 반환합니다.", error);
      }
    }
    return this.getLocalData(STORAGE_KEYS.PLAYERS) || [];
  }

  async savePlayer(player) {
    const players = await this.getPlayers();
    const index = players.findIndex(p => p.id === player.id);
    if (index > -1) {
      players[index] = player;
    } else {
      players.push(player);
    }
    this.saveLocalData(STORAGE_KEYS.PLAYERS, players);

    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const { id, ...playerData } = player;
        await setDoc(doc(this.firestore, "players", id), playerData);
      } catch (error) {
        console.error("Firestore에 선수 저장 실패:", error);
      }
    }
    return player;
  }

  async deletePlayer(playerId) {
    let players = await this.getPlayers();
    players = players.filter(p => p.id !== playerId);
    this.saveLocalData(STORAGE_KEYS.PLAYERS, players);

    const dues = this.getLocalData(STORAGE_KEYS.DUES) || {};
    for (const year in dues) {
      if (dues[year][playerId]) {
        delete dues[year][playerId];
      }
    }
    this.saveLocalData(STORAGE_KEYS.DUES, dues);

    if (this.isConnected) {
      try {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await deleteDoc(doc(this.firestore, "players", playerId));
        await this.syncDuesToFirebase(dues);
      } catch (error) {
        console.error("Firestore에서 선수 삭제 실패:", error);
      }
    }
  }

  // 2. 회비 관리
  async getDues(year = '2026') {
    if (this.isConnected) {
      try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const docRef = doc(this.firestore, "dues", String(year));
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const duesData = docSnap.data();
          const allDues = this.getLocalData(STORAGE_KEYS.DUES) || {};
          allDues[year] = duesData;
          this.saveLocalData(STORAGE_KEYS.DUES, allDues);
          return duesData;
        } else {
          const localDues = this.getLocalData(STORAGE_KEYS.DUES) || {};
          const yearDues = localDues[year] || {};
          await this.syncDuesToFirebase(localDues);
          return yearDues;
        }
      } catch (error) {
        console.warn("Firestore에서 회비 데이터를 불러오지 못해 로컬 데이터를 반환합니다.", error);
      }
    }
    const localDues = this.getLocalData(STORAGE_KEYS.DUES) || {};
    return localDues[year] || {};
  }

  async saveDues(year, playerId, month, paid) {
    const allDues = this.getLocalData(STORAGE_KEYS.DUES) || {};
    if (!allDues[year]) allDues[year] = {};
    if (!allDues[year][playerId]) {
      allDues[year][playerId] = {};
      for (let m = 1; m <= 12; m++) {
        allDues[year][playerId][m] = false;
      }
    }
    
    allDues[year][playerId][month] = paid;
    this.saveLocalData(STORAGE_KEYS.DUES, allDues);

    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await setDoc(doc(this.firestore, "dues", String(year)), allDues[year]);
      } catch (error) {
        console.error("Firestore에 회비 저장 실패:", error);
      }
    }
  }

  async syncDuesToFirebase(allDues) {
    if (!this.isConnected) return;
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      for (const year in allDues) {
        await setDoc(doc(this.firestore, "dues", String(year)), allDues[year]);
      }
    } catch (e) {
      console.error("전체 회비 Firebase 동기화 실패:", e);
    }
  }

  // 3. 전술 관리 (애니메이션 프레임 호환 레이어 포함)
  async getTacticalPatterns() {
    let tactics = [];
    if (this.isConnected) {
      try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const querySnapshot = await getDocs(collection(this.firestore, "tactics"));
        querySnapshot.forEach((doc) => {
          tactics.push({ id: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.warn("Firestore에서 전술 데이터를 불러오지 못해 로컬 데이터를 반환합니다.", error);
        tactics = this.getLocalData(STORAGE_KEYS.TACTICS) || [];
      }
    } else {
      tactics = this.getLocalData(STORAGE_KEYS.TACTICS) || [];
    }

    // 마이그레이션 로직: 단일 포지션 방식의 전술 데이터를 프레임 다중 구조로 자동 업그레이드
    tactics.forEach(t => {
      if (!t.frames) {
        t.frames = [{
          positions: t.positions || { home: [], away: [], ball: {} },
          drawings: t.drawings || ''
        }];
        delete t.positions;
        delete t.drawings;
      }
    });

    tactics.sort((a, b) => b.createdAt - a.createdAt);
    this.saveLocalData(STORAGE_KEYS.TACTICS, tactics);
    return tactics;
  }

  async saveTacticalPattern(pattern) {
    const tactics = await this.getTacticalPatterns();
    const index = tactics.findIndex(t => t.id === pattern.id);
    if (index > -1) {
      tactics[index] = pattern;
    } else {
      tactics.push(pattern);
    }
    this.saveLocalData(STORAGE_KEYS.TACTICS, tactics);

    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const { id, ...patternData } = pattern;
        await setDoc(doc(this.firestore, "tactics", id), patternData);
      } catch (error) {
        console.error("Firestore에 전술 저장 실패:", error);
      }
    }
    return pattern;
  }

  async deleteTacticalPattern(patternId) {
    let tactics = await this.getTacticalPatterns();
    tactics = tactics.filter(t => t.id !== patternId);
    this.saveLocalData(STORAGE_KEYS.TACTICS, tactics);

    if (this.isConnected) {
      try {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await deleteDoc(doc(this.firestore, "tactics", patternId));
      } catch (error) {
        console.error("Firestore에서 전술 삭제 실패:", error);
      }
    }
  }

  // 4. 경기 일정 관리 (NEW)
  async getSchedules() {
    if (this.isConnected) {
      try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const querySnapshot = await getDocs(collection(this.firestore, "schedules"));
        const schedules = [];
        querySnapshot.forEach((doc) => {
          schedules.push({ id: doc.id, ...doc.data() });
        });
        
        schedules.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
        this.saveLocalData(STORAGE_KEYS.SCHEDULES, schedules);
        return schedules;
      } catch (error) {
        console.warn("Firestore에서 경기 일정을 불러오지 못해 로컬 데이터를 반환합니다.", error);
      }
    }
    const localShedules = this.getLocalData(STORAGE_KEYS.SCHEDULES) || [];
    localShedules.sort((a, b) => new Date(a.date + 'T' + (a.time || '00:00')) - new Date(b.date + 'T' + (b.time || '00:00')));
    return localShedules;
  }

  async saveSchedule(schedule) {
    const schedules = await this.getSchedules();
    const index = schedules.findIndex(s => s.id === schedule.id);
    if (index > -1) {
      schedules[index] = schedule;
    } else {
      schedules.push(schedule);
    }
    this.saveLocalData(STORAGE_KEYS.SCHEDULES, schedules);

    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const { id, ...scheduleData } = schedule;
        await setDoc(doc(this.firestore, "schedules", id), scheduleData);
      } catch (error) {
        console.error("Firestore에 경기 일정 저장 실패:", error);
      }
    }
    return schedule;
  }

  async deleteSchedule(scheduleId) {
    let schedules = await this.getSchedules();
    schedules = schedules.filter(s => s.id !== scheduleId);
    this.saveLocalData(STORAGE_KEYS.SCHEDULES, schedules);

    if (this.isConnected) {
      try {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await deleteDoc(doc(this.firestore, "schedules", scheduleId));
      } catch (error) {
        console.error("Firestore에서 경기 일정 삭제 실패:", error);
      }
    }
  }

  // 5. 로컬 데이터를 Firebase에 원클릭 업로드
  async syncLocalToFirebase() {
    if (!this.isConnected) return;
    console.log("로컬 데이터를 Firebase Firestore로 동기화 업로드 시작...");
    
    try {
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      
      // 1. 선수단 업로드
      const localPlayers = this.getLocalData(STORAGE_KEYS.PLAYERS) || [];
      for (const p of localPlayers) {
        const { id, ...playerData } = p;
        await setDoc(doc(this.firestore, "players", id), playerData);
      }
      
      // 2. 회비 업로드
      const localDues = this.getLocalData(STORAGE_KEYS.DUES) || {};
      await this.syncDuesToFirebase(localDues);

      // 3. 전술 업로드 (자동 프레임 구조화 보장)
      const localTactics = await this.getTacticalPatterns();
      for (const t of localTactics) {
        const { id, ...tacticData } = t;
        await setDoc(doc(this.firestore, "tactics", id), tacticData);
      }

      // 4. 경기 일정 업로드 (NEW)
      const localSchedules = this.getLocalData(STORAGE_KEYS.SCHEDULES) || [];
      for (const s of localSchedules) {
        const { id, ...scheduleData } = s;
        await setDoc(doc(this.firestore, "schedules", id), scheduleData);
      }

      // 5. 구글 시트 URL 업로드 [NEW]
      const localGSheetUrl = this.getLocalData(STORAGE_KEYS.GSHEET_URL);
      if (localGSheetUrl) {
        await setDoc(doc(this.firestore, "config", "google_sheets"), { url: localGSheetUrl, updatedAt: Date.now() });
      }

      // 6. 피드백 데이터 업로드 [NEW]
      const localFeedback = this.getLocalData(STORAGE_KEYS.FEEDBACK) || {};
      for (const playerId in localFeedback) {
        await setDoc(doc(this.firestore, "feedback", playerId), { comments: localFeedback[playerId] });
      }

      console.log("모든 로컬 데이터가 Firebase에 업로드 동기화되었습니다!");
    } catch (e) {
      console.error("로컬 -> Firebase 동기화 진행 중 오류 발생:", e);
    }
  }

  // 6. 구글 스프레드시트 연동 URL 관리 [NEW]
  async getGoogleSheetUrl() {
    if (this.isConnected) {
      try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const docRef = doc(this.firestore, "config", "google_sheets");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const urlData = docSnap.data();
          if (urlData && urlData.url) {
            this.saveLocalData(STORAGE_KEYS.GSHEET_URL, urlData.url);
            return urlData.url;
          }
        }
      } catch (error) {
        console.warn("Firestore에서 구글 시트 URL을 가져오지 못해 로컬 저장소를 반환합니다.", error);
      }
    }
    return this.getLocalData(STORAGE_KEYS.GSHEET_URL) || '';
  }

  async saveGoogleSheetUrl(url) {
    this.saveLocalData(STORAGE_KEYS.GSHEET_URL, url);
    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await setDoc(doc(this.firestore, "config", "google_sheets"), { url, updatedAt: Date.now() });
      } catch (error) {
        console.error("Firestore에 구글 시트 URL 저장 실패:", error);
      }
    }
    return url;
  }

  // 7. 개인 피드백 및 코멘트 관리 [NEW]
  async getFeedback(playerId) {
    if (this.isConnected) {
      try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const docRef = doc(this.firestore, "feedback", playerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const fbData = docSnap.data();
          const allFb = this.getLocalData(STORAGE_KEYS.FEEDBACK) || {};
          allFb[playerId] = fbData.comments || [];
          this.saveLocalData(STORAGE_KEYS.FEEDBACK, allFb);
          return fbData.comments || [];
        }
      } catch (error) {
        console.warn("Firestore에서 피드백 데이터를 불러오지 못해 로컬 저장소를 반환합니다.", error);
      }
    }
    const allFb = this.getLocalData(STORAGE_KEYS.FEEDBACK) || {};
    return allFb[playerId] || [];
  }

  async saveFeedbackComment(playerId, comment) {
    const allFb = this.getLocalData(STORAGE_KEYS.FEEDBACK) || {};
    if (!allFb[playerId]) allFb[playerId] = [];
    
    allFb[playerId].push(comment);
    this.saveLocalData(STORAGE_KEYS.FEEDBACK, allFb);

    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await setDoc(doc(this.firestore, "feedback", playerId), { comments: allFb[playerId] });
      } catch (error) {
        console.error("Firestore에 피드백 저장 실패:", error);
      }
    }
    return comment;
  }
}

export const dbService = new DatabaseService();
