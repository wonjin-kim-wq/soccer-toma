// database.js - 적토마 FC 데이터베이스 관리 및 동기화 서비스
// Firebase 및 LocalStorage를 연동하는 하이브리드 어댑터 패턴

const STORAGE_KEYS = {
  PLAYERS: 'jeoktoma_players',
  DUES: 'jeoktoma_dues',
  TACTICS: 'jeoktoma_tactics',
  FIREBASE_CONFIG: 'jeoktoma_firebase_config'
};

// 기본 샘플 데이터 (앱 최초 실행 시 시각적 완성도를 높이기 위해 제공)
const DEFAULT_PLAYERS = [
  { id: 'p1', name: '손흥민', backNumber: '7', position: 'FW', goals: 12, assists: 6, matches: 15 },
  { id: 'p2', name: '이강인', backNumber: '10', position: 'MF', goals: 5, assists: 9, matches: 14 },
  { id: 'p3', name: '황희찬', backNumber: '11', position: 'FW', goals: 8, assists: 3, matches: 12 },
  { id: 'p4', name: '김민재', backNumber: '3', position: 'DF', goals: 1, assists: 1, matches: 15 },
  { id: 'p5', name: '설영우', backNumber: '22', position: 'DF', goals: 0, assists: 4, matches: 13 },
  { id: 'p6', name: '조현우', backNumber: '21', position: 'GK', goals: 0, assists: 0, matches: 15 }
];

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
      // ES 모듈을 사용하여 브라우저에서 동적으로 임포트
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
    
    // 재초기화 시도
    await this.initializeFirebase(config);
    
    // 연결이 성공하면 로컬 데이터를 클라우드에 마이그레이션(업로드) 처리
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
    return configStr ? JSON.parse(configStr) : null;
  }

  // LocalStorage 데이터 가져오기 (폴백용)
  getLocalData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  // LocalStorage 데이터 저장
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
        
        // 정렬: 배번 또는 포지션에 맞춰 정렬 (기본은 아이디순)
        players.sort((a, b) => Number(a.backNumber || 99) - Number(b.backNumber || 99));

        // 로컬 캐시 갱신
        this.saveLocalData(STORAGE_KEYS.PLAYERS, players);
        return players;
      } catch (error) {
        console.warn("Firestore에서 선수 데이터를 불러오지 못해 로컬 데이터를 반환합니다.", error);
      }
    }
    return this.getLocalData(STORAGE_KEYS.PLAYERS) || [];
  }

  async savePlayer(player) {
    // 로컬 데이터 선반영
    const players = await this.getPlayers();
    const index = players.findIndex(p => p.id === player.id);
    if (index > -1) {
      players[index] = player;
    } else {
      players.push(player);
    }
    this.saveLocalData(STORAGE_KEYS.PLAYERS, players);

    // Firebase 동기화
    if (this.isConnected) {
      try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        // Firebase에 저장 시 id를 문서 ID로 사용하고, 문서 내용에는 id를 제외하고 저장
        const { id, ...playerData } = player;
        await setDoc(doc(this.firestore, "players", id), playerData);
      } catch (error) {
        console.error("Firestore에 선수 저장 실패:", error);
      }
    }
    return player;
  }

  async deletePlayer(playerId) {
    // 로컬 데이터 선반영
    let players = await this.getPlayers();
    players = players.filter(p => p.id !== playerId);
    this.saveLocalData(STORAGE_KEYS.PLAYERS, players);

    // 회비 정보에서도 해당 선수 삭제
    const dues = this.getLocalData(STORAGE_KEYS.DUES) || {};
    for (const year in dues) {
      if (dues[year][playerId]) {
        delete dues[year][playerId];
      }
    }
    this.saveLocalData(STORAGE_KEYS.DUES, dues);

    // Firebase 동기화
    if (this.isConnected) {
      try {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await deleteDoc(doc(this.firestore, "players", playerId));
        
        // Firebase 회비 정보에서도 연동하여 지우거나 비활성화
        // (단순화를 위해 플레이어 삭제 시 Firestore 회비 도큐먼트의 해당 필드 정리 가능)
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
          // 해당 연도 문서가 없으면 로컬 데이터 반환 및 생성 시도
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
        // Firestore의 dues 컬렉션에 연도별 문서로 저장
        await setDoc(doc(this.firestore, "dues", String(year)), allDues[year]);
      } catch (error) {
        console.error("Firestore에 회비 저장 실패:", error);
      }
    }
  }

  // 회비 대용량 동기화 Helper
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

  // 3. 전술 관리
  async getTacticalPatterns() {
    if (this.isConnected) {
      try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const querySnapshot = await getDocs(collection(this.firestore, "tactics"));
        const tactics = [];
        querySnapshot.forEach((doc) => {
          tactics.push({ id: doc.id, ...doc.data() });
        });
        
        tactics.sort((a, b) => b.createdAt - a.createdAt);
        this.saveLocalData(STORAGE_KEYS.TACTICS, tactics);
        return tactics;
      } catch (error) {
        console.warn("Firestore에서 전술 데이터를 불러오지 못해 로컬 데이터를 반환합니다.", error);
      }
    }
    return this.getLocalData(STORAGE_KEYS.TACTICS) || [];
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

  // 4. 로컬 데이터를 Firebase에 원클릭 업로드
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

      // 3. 전술 업로드
      const localTactics = this.getLocalData(STORAGE_KEYS.TACTICS) || [];
      for (const t of localTactics) {
        const { id, ...tacticData } = t;
        await setDoc(doc(this.firestore, "tactics", id), tacticData);
      }

      console.log("모든 로컬 데이터가 Firebase에 업로드 동기화되었습니다!");
    } catch (e) {
      console.error("로컬 -> Firebase 동기화 진행 중 오류 발생:", e);
    }
  }
}

export const dbService = new DatabaseService();
