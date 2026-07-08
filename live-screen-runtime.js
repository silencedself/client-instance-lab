const WAMP_EVENT_NAME = "OnJsonApiEvent";

let initialized = false;
let disposed = false;
let contextRef = null;
let nativeFetch = null;
let NativeXHR = null;
let NativeWebSocket = null;
let activeScenario = null;
let lastAttempt = null;
let observerDisposers = [];
let holdRefreshTimer = null;
let holdNavigationInFlight = false;

const sockets = new Set();

const PLACEHOLDER_TAG = "BR1";
const HOLD_REFRESH_MS = 1200;
const PRACTICALLY_INFINITE_MS = 2147483647;
const FAR_FUTURE_EPOCH_MS = Date.UTC(2099, 0, 1);

const CHAMPION_SELECT_ROSTER = {
  ally: [
    { cellId: 0, championId: 134, displayName: "Lume", skinId: 134007, skinName: "Syndra", spell1Id: 4, spell2Id: 32 },
    { cellId: 1, championId: 893, displayName: "Nova", skinId: 893001, skinName: "Aurora", spell1Id: 4, spell2Id: 32 },
    { cellId: 2, championId: 96, displayName: "Brisa", skinId: 96019, skinName: "Kog'Maw", spell1Id: 4, spell2Id: 32 },
    { cellId: 3, championId: 121, displayName: "Atlas", skinId: 121003, skinName: "Kha'Zix", spell1Id: 4, spell2Id: 32 },
    { cellId: 4, championId: 35, displayName: "Orion", skinId: 35064, skinName: "Shaco", spell1Id: 4, spell2Id: 32 },
  ],
  enemy: [
    { cellId: 5, championId: 804, displayName: "Cipher", skinId: 804000, skinName: "K'Sante", spell1Id: 4, spell2Id: 32 },
    { cellId: 6, championId: 92, displayName: "Vega", skinId: 92000, skinName: "Riven", spell1Id: 4, spell2Id: 32 },
    { cellId: 7, championId: 28, displayName: "Mira", skinId: 28000, skinName: "Evelynn", spell1Id: 4, spell2Id: 32 },
    { cellId: 8, championId: 498, displayName: "Sol", skinId: 498000, skinName: "Xayah", spell1Id: 4, spell2Id: 32 },
    { cellId: 9, championId: 59, displayName: "Vale", skinId: 59000, skinName: "Jarvan IV", spell1Id: 4, spell2Id: 32 },
  ],
};

const HONOR_VOTE_ROSTER = {
  allies: [
    { cellId: 11, championId: 893, displayName: "Lume", skinId: 893000, skinName: "Aurora", spell1Id: 4, spell2Id: 32 },
    { cellId: 12, championId: 35, displayName: "Orion", skinId: 35000, skinName: "Shaco", spell1Id: 4, spell2Id: 32 },
    { cellId: 13, championId: 800, displayName: "Vesper", skinId: 800000, skinName: "Mel", spell1Id: 4, spell2Id: 32 },
    { cellId: 14, championId: 96, displayName: "Brisa", skinId: 96019, skinName: "Kog'Maw", spell1Id: 4, spell2Id: 32 },
  ],
  opponents: [
    { cellId: 15, championId: 79, displayName: "Barril", skinId: 79000, skinName: "Gragas", spell1Id: 4, spell2Id: 32 },
    { cellId: 16, championId: 72, displayName: "Casco", skinId: 72004, skinName: "Skarner", spell1Id: 4, spell2Id: 32 },
    { cellId: 17, championId: 21, displayName: "Rubi", skinId: 21040, skinName: "Miss Fortune", spell1Id: 4, spell2Id: 32 },
    { cellId: 18, championId: 161, displayName: "Iris", skinId: 161002, skinName: "Vel'Koz", spell1Id: 4, spell2Id: 32 },
    { cellId: 19, championId: 235, displayName: "Nebula", skinId: 235001, skinName: "Senna", spell1Id: 4, spell2Id: 32 },
  ],
};

const PLAYER_NAMES = [...CHAMPION_SELECT_ROSTER.ally, ...CHAMPION_SELECT_ROSTER.enemy].map((player) => player.displayName);
const PLAYER_TAGS = Array.from({ length: 10 }, () => PLACEHOLDER_TAG);
const CHAMPION_IDS = [...CHAMPION_SELECT_ROSTER.ally, ...CHAMPION_SELECT_ROSTER.enemy].map((player) => player.championId);

const ARAM_BENCH_CHAMPIONS = [134, 893, 96, 121, 35, 804, 92, 28, 498, 59];
const DEFAULT_LOCAL_PLAYER_CELL_ID = 1;

const AURORA_SKINS = [
  {
    championId: 893,
    childSkins: [],
    chromaPreviewPath: "",
    disabled: false,
    emblems: [],
    groupSplash: "",
    id: 893000,
    isBase: true,
    isChampionUnlocked: true,
    name: "Aurora",
    ownership: { owned: true },
    productType: "",
    rarityGemPath: "",
    skinAugments: {},
    splashPath: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Base/Images/Aurora_splash_tile_0.jpg",
    splashVideoPath: "",
    stillObtainable: true,
    tilePath: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Base/Images/Aurora_splash_tile_0.jpg",
    unlocked: true,
  },
  {
    championId: 893,
    childSkins: [],
    chromaPreviewPath: "",
    disabled: false,
    emblems: [],
    groupSplash: "",
    id: 893001,
    isBase: false,
    isChampionUnlocked: true,
    name: "Aurora",
    ownership: { owned: true },
    productType: "",
    rarityGemPath: "",
    skinAugments: {},
    splashPath: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Skin01/Images/Aurora_splash_tile_1.jpg",
    splashVideoPath: "",
    stillObtainable: true,
    tilePath: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Skin01/Images/Aurora_splash_tile_1.jpg",
    unlocked: true,
  },
];

const SCENARIOS = {
  "aram-mayhem-champ-select": {
    label: "Selecao de Campeoes ARAM Mayhem",
    phase: "ChampSelect",
    routeNames: ["champ-select", "ChampSelect", "aram", "aram-mayhem"],
    targetSelectors: [
      '[data-screen-name="rcp-fe-lol-champ-select"]',
      ".rcp-fe-lol-champ-select",
      ".champ-select-application",
      ".champion-select",
      ".champ-select",
    ],
    plugins: ["rcp-fe-lol-champ-select", "rcp-fe-lol-navigation"],
    queue: {
      category: "PvP",
      description: "ARAM Mayhem instance lab",
      gameMode: "ARAM",
      id: 450,
      isRanked: false,
      mapId: 12,
      name: "ARAM Mayhem",
      type: "ARAM_UNRANKED_5x5",
    },
    champSelect: {
      benchEnabled: true,
      benchChampions: ARAM_BENCH_CHAMPIONS,
      localChampionId: 893,
      localPlayerCellId: DEFAULT_LOCAL_PLAYER_CELL_ID,
      pickableChampionIds: ARAM_BENCH_CHAMPIONS,
      timerPhase: "FINALIZATION",
    },
  },
  "match-found": {
    label: "Partida Encontrada",
    phase: "ReadyCheck",
    routeNames: ["ready-check", "match-found", "matchmaking"],
    targetSelectors: [
      ".ready-check",
      ".ready-check-root",
      ".matchmaking-ready-check",
      ".ready-check-accept-button",
      ".ready-check-timer",
    ],
    targetTexts: ["Partida encontrada", "Match Found", "Aceitar", "Accept"],
    plugins: ["rcp-fe-lol-matchmaking", "rcp-fe-lol-navigation"],
    readyCheck: true,
    queue: {
      category: "PvP",
      description: "ARAM Mayhem queue",
      gameMode: "ARAM",
      id: 450,
      isRanked: false,
      mapId: 12,
      name: "ARAM Mayhem",
      type: "ARAM_UNRANKED_5x5",
    },
  },
  "in-game": {
    label: "Client durante Partida",
    phase: "InProgress",
    routeNames: ["in-progress", "game-in-progress", "lock-and-load"],
    targetSelectors: [
      '[data-screen-name="rcp-fe-lol-game-in-progress"]',
      ".rcp-fe-lol-game-in-progress",
      ".game-in-progress-container",
      ".reconnect-container",
    ],
    targetTexts: ["Partida em andamento", "Game in progress", "In Progress"],
    plugins: ["rcp-fe-lol-navigation", "rcp-fe-lol-lock-and-load"],
    queue: {
      category: "PvP",
      description: "ARAM Mayhem queue",
      gameMode: "ARAM",
      id: 450,
      isRanked: false,
      mapId: 12,
      name: "ARAM Mayhem",
      type: "ARAM_UNRANKED_5x5",
    },
  },
  "pre-end": {
    label: "Pre-End-of-Game",
    phase: "PreEndOfGame",
    routeNames: ["pre-end", "pre-end-of-game", "postgame"],
    targetSelectors: [
      '[data-screen-name="rcp-fe-lol-pre-end-of-game"]',
      ".rcp-fe-lol-pre-end-of-game",
    ],
    plugins: ["rcp-fe-lol-navigation", "rcp-fe-lol-postgame"],
  },
  "waiting-stats": {
    label: "Waiting for Stats",
    phase: "WaitingForStats",
    routeNames: ["waiting-for-stats", "postgame", "stats"],
    targetSelectors: [
      '[data-screen-name="rcp-fe-lol-waiting-for-stats"]',
      ".rcp-fe-lol-waiting-for-stats",
    ],
    targetTexts: ["Waiting for Stats"],
    plugins: ["rcp-fe-lol-navigation", "rcp-fe-lol-postgame"],
  },
  postgame: {
    label: "Pos-Partida",
    phase: "EndOfGame",
    routeNames: ["postgame", "end-of-game", "scoreboard"],
    targetSelectors: [
      '[data-screen-name="rcp-fe-lol-postgame"]',
      ".postgame-root-component",
      ".postgame-background-image",
      ".postgame-scoreboard",
    ],
    plugins: ["rcp-fe-lol-postgame", "rcp-fe-lol-navigation"],
    queue: {
      category: "PvP",
      description: "ARAM Mayhem result",
      gameMode: "ARAM",
      id: 450,
      isRanked: false,
      mapId: 12,
      name: "ARAM Mayhem",
      type: "ARAM_UNRANKED_5x5",
    },
  },
  "honor-vote": {
    label: "Honrar Jogadores",
    phase: "PreEndOfGame",
    routeNames: ["honor", "honor-vote", "pre-end-of-game", "postgame"],
    targetSelectors: [
      ".honor-vote-ceremony",
      ".vote-ceremony-player-container",
      ".vote-ceremony-submit-button",
      ".vote-ceremony-timer",
      ".honor-v2-ballot",
      ".honor-ballot",
      ".honor-vote",
      ".honor-voting",
      ".postgame-honor",
    ],
    targetTexts: ["Honrar", "Honor", "GG <3", "Tiltproof"],
    plugins: ["rcp-fe-lol-postgame", "rcp-fe-lol-navigation"],
    honorVote: true,
  },
  honor: {
    label: "Honra Recebida",
    phase: "EndOfGame",
    routeNames: ["honor", "postgame", "end-of-game"],
    targetSelectors: [
      ".honor-v3-postgame-notification-container",
      ".honor-v3-postgame-notification-contents",
      ".postgame-scoreboard-progression-honor-notification-component",
    ],
    targetTexts: ["Honra", "Honor", "Most Honored"],
    plugins: ["rcp-fe-lol-postgame", "rcp-fe-lol-navigation"],
    honorReceived: true,
  },
  "honor-upgrade": {
    label: "Honor Upgrade",
    phase: "EndOfGame",
    routeNames: ["honor", "level-change", "postgame"],
    targetSelectors: [
      ".honor-level-change",
      ".honor-level-up",
      ".honor-upgrade",
      ".honor-level-modal",
    ],
    targetTexts: ["Honor Level", "Honra", "Checkpoint", "Level Up"],
    plugins: ["rcp-fe-lol-postgame", "rcp-fe-lol-navigation"],
    honorLevelChange: true,
  },
  reconnect: {
    label: "Reconnect",
    phase: "Reconnect",
    routeNames: ["reconnect", "lock-and-load"],
    targetSelectors: [
      '[data-screen-name="rcp-fe-lol-reconnect"]',
      ".rcp-fe-lol-reconnect",
      ".reconnect-container",
    ],
    targetTexts: ["Reconectar", "Reconnect"],
    plugins: ["rcp-fe-lol-navigation", "rcp-fe-lol-lock-and-load"],
  },
};

const DEBUG_URIS = [
  "/lol-gameflow/v1/gameflow-phase",
  "/lol-gameflow/v1/session",
  "/lol-matchmaking/v1/search",
  "/lol-matchmaking/v1/ready-check",
  "/lol-champ-select/v1/session",
  "/lol-end-of-game/v1/eog-stats-block",
  "/lol-honor-v2/v1/ballot",
  "/lol-honor-v2/v1/recognition",
  "/lol-honor-v2/v1/level-change",
];

export function setLiveScreenContext(context) {
  if (!context) return;
  contextRef = context;
  attachDebugObservers();
}

export function initLiveScreenRuntime(context) {
  setLiveScreenContext(context || contextRef);

  if (initialized || typeof window === "undefined") return;
  initialized = true;
  disposed = false;

  clearRuntimeArtifacts();
  patchFetch();
  patchXhr();
  patchWebSocket();

  window.__ClientInstanceLabRuntime = {
    clear: clearLiveScreen,
    diagnostic: getDiagnostics,
    emit: emitActiveScenario,
    getState: () => ({
      activeScenario: activeScenario?.id || null,
      lastAttempt,
      sockets: sockets.size,
    }),
    open: openLiveScreen,
  };
}

export function disposeLiveScreenRuntime() {
  disposed = true;
  stopScenarioHold();
  activeScenario = null;
  lastAttempt = null;
  detachDebugObservers();
  restorePatchedGlobals();
  clearRuntimeArtifacts();
  delete window.__ClientInstanceLabRuntime;
}

export async function openLiveScreen(id) {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    return { ok: false, id, message: "Unknown scenario" };
  }

  stopScenarioHold();
  activeScenario = {
    ...scenario,
    id,
    openedAt: Date.now(),
  };

  const emitted = emitScenarioBundle(activeScenario);
  const rcpAttempt = await attemptRcpActivation(activeScenario);
  startScenarioHold();

  lastAttempt = {
    id,
    label: scenario.label,
    emitted,
    rcpAttempt,
    sockets: sockets.size,
    targetFound: findScenarioTarget(activeScenario),
    time: new Date().toISOString(),
  };

  setTimeout(() => {
    if (!activeScenario || activeScenario.id !== id) return;
    lastAttempt = {
      ...lastAttempt,
      targetFoundAfterDelay: findScenarioTarget(activeScenario),
    };
  }, 1200);

  return {
    ok: true,
    message: `${scenario.label} mock enabled`,
    ...lastAttempt,
  };
}

export async function clearLiveScreen() {
  const previousScenario = activeScenario;
  stopScenarioHold();
  activeScenario = null;

  const events = [];
  const realPhase = await nativeJson("/lol-gameflow/v1/gameflow-phase", "None");
  const realSession = await nativeJson("/lol-gameflow/v1/session", null);
  const realLevelChange = await nativeJson("/lol-honor-v2/v1/level-change", null);
  const realBallot = await nativeJson("/lol-honor-v2/v1/ballot", null);
  const realRecognition = await nativeJson("/lol-honor-v2/v1/recognition", []);
  const realLateRecognition = await nativeJson("/lol-honor-v2/v1/late-recognition", []);
  const realRewardGranted = await nativeJson("/lol-honor-v2/v1/reward-granted", null);
  const realMutualHonor = await nativeJson("/lol-honor-v2/v1/mutual-honor", null);

  events.push(emitJsonApi("/lol-gameflow/v1/gameflow-phase", realPhase, "Update"));
  events.push(emitJsonApi("/lol-gameflow/v1/session", realSession, realSession ? "Update" : "Delete"));
  events.push(emitJsonApi("/lol-matchmaking/v1/ready-check", null, "Delete"));
  events.push(emitJsonApi("/lol-matchmaking/v1/search", null, "Delete"));
  events.push(emitJsonApi("/lol-champ-select/v1/session", null, "Delete"));
  events.push(emitJsonApi("/lol-end-of-game/v1/eog-stats-block", null, "Delete"));
  events.push(emitJsonApi("/lol-end-of-game/v1/gameclient-eog-stats-block", null, "Delete"));
  events.push(emitJsonApi("/lol-honor-v2/v1/ballot", realBallot, realBallot ? "Update" : "Delete"));
  events.push(emitJsonApi("/lol-honor-v2/v1/recognition", realRecognition, Array.isArray(realRecognition) ? "Update" : "Delete"));
  events.push(emitJsonApi("/lol-honor-v2/v1/late-recognition", realLateRecognition, Array.isArray(realLateRecognition) ? "Update" : "Delete"));
  events.push(emitJsonApi("/lol-honor-v2/v1/reward-granted", realRewardGranted, realRewardGranted ? "Update" : "Delete"));
  events.push(emitJsonApi("/lol-honor-v2/v1/mutual-honor", realMutualHonor, realMutualHonor ? "Update" : "Delete"));
  events.push(emitJsonApi("/lol-honor-v2/v1/level-change", realLevelChange, realLevelChange ? "Update" : "Delete"));

  lastAttempt = {
    id: null,
    label: "Cleared",
    previousScenario: previousScenario?.id || null,
    emitted: events,
    sockets: sockets.size,
    time: new Date().toISOString(),
  };

  return {
    ok: true,
    message: "Live screen mock cleared",
    emitted: events,
    phase: realPhase,
  };
}

export function getDiagnostics() {
  const rcp = getRcp();
  const navigation = rcp?.get?.("rcp-fe-lol-navigation");

  const diagnostics = {
    activeScenario: activeScenario?.id || null,
    hasContext: Boolean(contextRef),
    hasRcp: Boolean(rcp),
    rcpKeys: describeObject(rcp),
    navigationKeys: describeObject(navigation),
    sockets: sockets.size,
    lastAttempt,
    globals: {
      hasPengu: Boolean(window.Pengu),
      hasDataStore: Boolean(window.DataStore),
      hasToast: Boolean(window.Toast),
      hasCommandBar: Boolean(window.CommandBar),
    },
  };

  try {
    console.log("[client-instance-lab] diagnostics", JSON.stringify(diagnostics));
  } catch (_) {
    console.log("[client-instance-lab] diagnostics", diagnostics);
  }
  return diagnostics;
}

function patchFetch() {
  if (!window.fetch || nativeFetch) return;

  nativeFetch = window.fetch.bind(window);
  window.fetch = function clientInstanceLabFetch(input, init = {}) {
    const method = getRequestMethod(input, init);
    const path = getRequestPath(input);
    const mock = getMockResponse(path, method);

    if (mock) {
      return Promise.resolve(toFetchResponse(mock));
    }

    return nativeFetch(input, init);
  };
}

function patchXhr() {
  if (!window.XMLHttpRequest || NativeXHR) return;

  NativeXHR = window.XMLHttpRequest;

  function ClientInstanceLabXHR() {
    const xhr = new NativeXHR();
    let method = "GET";
    let url = "";

    const nativeOpen = xhr.open;
    xhr.open = function patchedOpen(nextMethod, nextUrl) {
      method = String(nextMethod || "GET").toUpperCase();
      url = nextUrl;
      return nativeOpen.apply(xhr, arguments);
    };

    const nativeSend = xhr.send;
    xhr.send = function patchedSend() {
      const mock = getMockResponse(getRequestPath(url), method);
      if (!mock) {
        return nativeSend.apply(xhr, arguments);
      }

      deliverMockXhr(xhr, mock);
      return undefined;
    };

    return xhr;
  }

  ClientInstanceLabXHR.prototype = NativeXHR.prototype;
  window.XMLHttpRequest = ClientInstanceLabXHR;
}

function patchWebSocket() {
  if (!window.WebSocket || NativeWebSocket) return;

  NativeWebSocket = window.WebSocket;

  function ClientInstanceLabWebSocket() {
    const socket = new NativeWebSocket(...arguments);
    sockets.add(socket);

    socket.addEventListener("close", () => sockets.delete(socket));
    socket.addEventListener("error", () => {
      if (socket.readyState === socket.CLOSED) {
        sockets.delete(socket);
      }
    });

    return socket;
  }

  Object.setPrototypeOf(ClientInstanceLabWebSocket, NativeWebSocket);
  ClientInstanceLabWebSocket.prototype = NativeWebSocket.prototype;
  window.WebSocket = ClientInstanceLabWebSocket;
}

function getMockResponse(path, method) {
  if (!activeScenario) return null;

  const normalized = normalizePath(path);
  if (method !== "GET") {
    return getMutationMockResponse(normalized, method);
  }

  const scenario = activeScenario;
  const phase = scenario.phase;

  if (normalized === "/lol-gameflow/v1/gameflow-phase") {
    return jsonMock(phase);
  }

  if (normalized === "/lol-gameflow/v1/session") {
    return jsonMock(makeGameflowSession(scenario));
  }

  if (normalized === "/lol-gameflow/v1/availability") {
    return jsonMock({ isAvailable: true, state: "Available" });
  }

  if (normalized === "/lol-gameflow/v1/spectate") {
    return jsonMock({});
  }

  if (normalized === "/lol-gameflow/v1/gameflow-monitor") {
    return jsonMock(makeGameflowMonitor(scenario));
  }

  if (normalized === "/lol-matchmaking/v1/ready-check") {
    return scenario.readyCheck ? jsonMock(makeReadyCheck()) : null;
  }

  if (normalized === "/lol-matchmaking/v1/notifications") {
    return jsonMock([]);
  }

  if (normalized === "/lol-matchmaking/v1/search" || normalized === "/lol-lobby/v2/lobby/matchmaking/search") {
    return scenario.readyCheck ? jsonMock(makeMatchmakingSearch()) : jsonMock(null, 404);
  }

  if (normalized === "/lol-champ-select/v1/session") {
    return scenario.phase === "ChampSelect" ? jsonMock(makeChampSelectSession(scenario)) : jsonMock(null, 404);
  }

  if (normalized === "/lol-champ-select/v1/session/timer") {
    return scenario.phase === "ChampSelect" ? jsonMock(makeChampSelectSession(scenario).timer) : jsonMock(null, 404);
  }

  if (normalized === "/lol-champ-select/v1/current-champion") {
    return scenario.phase === "ChampSelect" ? jsonMock(scenario.champSelect?.localChampionId || 103) : jsonMock(0);
  }

  if (normalized === "/lol-champ-select/v1/pickable-champion-ids" || normalized === "/lol-champ-select/v1/pickable-champions") {
    return scenario.phase === "ChampSelect" ? jsonMock(CHAMPION_IDS) : jsonMock([]);
  }

  if (normalized === "/lol-champ-select/v1/bannable-champion-ids") {
    return scenario.phase === "ChampSelect" ? jsonMock(CHAMPION_IDS) : jsonMock([]);
  }

  if (normalized === "/lol-champ-select/v1/disabled-champion-ids") {
    return jsonMock([]);
  }

  if (normalized === "/lol-champ-select/v1/team-boost") {
    return jsonMock(null);
  }

  if (normalized === "/lol-champ-select/v1/skin-selector-info") {
    return scenario.phase === "ChampSelect" ? jsonMock(makeSkinSelectorInfo()) : jsonMock(null, 404);
  }

  if (normalized === "/lol-champ-select/v1/skin-carousel-skins") {
    return scenario.phase === "ChampSelect" ? jsonMock(makeSkinCarouselSkins()) : jsonMock([]);
  }

  if (normalized === "/lol-inventory/v1/champSelectInventory") {
    return scenario.phase === "ChampSelect" ? jsonMock(makeChampSelectInventory()) : jsonMock([]);
  }

  if (/^\/lol-champ-select\/v1\/summoners\/\d+$/.test(normalized)) {
    const cellId = Number(normalized.split("/").pop()) || 0;
    return scenario.phase === "ChampSelect" ? jsonMock(makeChampSelectSummoner(cellId)) : jsonMock(null, 404);
  }

  if (normalized === "/lol-end-of-game/v1/eog-stats-block" || normalized === "/lol-end-of-game/v1/gameclient-eog-stats-block") {
    if (!["EndOfGame", "WaitingForStats", "PreEndOfGame"].includes(phase)) {
      return jsonMock(null, 404);
    }

    return normalized.endsWith("/gameclient-eog-stats-block")
      ? jsonMock(makeGameClientEogStatsBlock())
      : jsonMock(makeEogStatsBlock());
  }

  if (normalized === "/lol-end-of-game/v1/champion-mastery-updates") {
    return jsonMock([]);
  }

  if (normalized === "/lol-honor-v2/v1/team-choices") {
    return scenario.honorVote ? jsonMock(makeHonorTeamChoices()) : jsonMock([]);
  }

  if (normalized === "/lol-honor-v2/v1/vote-completion") {
    return scenario.honorVote ? jsonMock(makeHonorVoteCompletion(scenario)) : jsonMock({ completed: true, voted: false, timeUntilVoteEnds: 0 });
  }

  if (normalized === "/lol-honor-v2/v1/latest-eligible-game") {
    return scenario.honorVote || scenario.honorReceived || scenario.honorLevelChange
      ? jsonMock({ gameId: 123456789, queueId: 450 })
      : jsonMock({ gameId: 0, queueId: 0 });
  }

  if (normalized.startsWith("/lol-honor-v2/v1/")) {
    return jsonMock(makeHonorResponse(normalized, scenario));
  }

  return null;
}

function getMutationMockResponse(path, method) {
  if (
    path === "/lol-matchmaking/v1/ready-check/accept" ||
    path === "/lol-matchmaking/v1/ready-check/decline"
  ) {
    return jsonMock({ success: true, mocked: true, method, path });
  }

  if (
    path === "/lol-honor-v2/v1/honor-player" ||
    path === "/lol-honor/v1/honor"
  ) {
    return jsonMock({ success: true, mocked: true, method, path, gameId: 123456789 });
  }

  if (
    path === "/lol-honor-v2/v1/ballot/refresh" ||
    path.endsWith("/level-change/ack") ||
    path.endsWith("/late-recognition/ack") ||
    path.endsWith("/reward-granted/ack") ||
    path.endsWith("/mutual-honor/ack")
  ) {
    return jsonMock(null, 204);
  }

  if (
    path.startsWith("/lol-champ-select/v1/session/actions/") ||
    path === "/lol-champ-select/v1/session/my-selection" ||
    path.endsWith("/reroll") ||
    path.includes("/trades")
  ) {
    return jsonMock({
      success: true,
      mocked: true,
      method,
      path,
      session: makeChampSelectSession(activeScenario),
    });
  }

  return null;
}

function emitActiveScenario() {
  if (!activeScenario) {
    return { emitted: [], activeScenario: null };
  }

  return {
    emitted: emitScenarioBundle(activeScenario),
    activeScenario: activeScenario.id,
  };
}

function emitScenarioBundle(scenario) {
  const events = [];

  events.push(emitJsonApi("/lol-gameflow/v1/gameflow-phase", scenario.phase, "Update"));
  events.push(emitJsonApi("/lol-gameflow/v1/session", makeGameflowSession(scenario), "Update"));
  events.push(emitJsonApi("/lol-gameflow/v1/availability", { isAvailable: true, state: "Available" }, "Update"));
  events.push(emitJsonApi("/lol-gameflow/v1/gameflow-monitor", makeGameflowMonitor(scenario), "Update"));

  if (scenario.readyCheck) {
    events.push(emitJsonApi("/lol-matchmaking/v1/search", makeMatchmakingSearch(), "Update"));
    events.push(emitJsonApi("/lol-matchmaking/v1/ready-check", makeReadyCheck(), "Update"));
    events.push(emitJsonApi("/lol-matchmaking/v1/notifications", [], "Update"));
  }

  if (scenario.phase === "ChampSelect") {
    events.push(emitJsonApi("/lol-champ-select/v1/session", makeChampSelectSession(scenario), "Update"));
    events.push(emitJsonApi("/lol-champ-select/v1/pickable-champion-ids", CHAMPION_IDS, "Update"));
    events.push(emitJsonApi("/lol-champ-select/v1/bannable-champion-ids", CHAMPION_IDS, "Update"));
  }

  if (["EndOfGame", "WaitingForStats", "PreEndOfGame"].includes(scenario.phase)) {
    events.push(emitJsonApi("/lol-end-of-game/v1/eog-stats-block", makeEogStatsBlock(), "Update"));
    events.push(emitJsonApi("/lol-end-of-game/v1/gameclient-eog-stats-block", makeGameClientEogStatsBlock(), "Update"));
  }

  if (scenario.honorVote) {
    events.push(emitJsonApi("/lol-honor-v2/v1/config", makeHonorResponse("/lol-honor-v2/v1/config", scenario), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/latest-eligible-game", { gameId: 123456789, queueId: 450 }, "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/team-choices", makeHonorTeamChoices(), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/ballot", makeHonorResponse("/lol-honor-v2/v1/ballot", scenario), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/vote-completion", makeHonorVoteCompletion(scenario), "Update"));
  }

  if (scenario.honorReceived) {
    events.push(emitJsonApi("/lol-honor-v2/v1/recognition", makeHonorRecognition(), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/late-recognition", makeHonorRecognition({ late: true }), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/reward-granted", makeHonorRewardGranted(), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/mutual-honor", makeMutualHonor(), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/profile", makeHonorProfile(), "Update"));
  }

  if (scenario.honorLevelChange) {
    events.push(emitJsonApi("/lol-honor-v2/v1/level-change", makeHonorLevelChange(), "Update"));
    events.push(emitJsonApi("/lol-honor-v2/v1/profile", makeHonorProfile(), "Update"));
  }

  return events;
}

function emitJsonApi(uri, data, eventType = "Update") {
  const detail = { uri, eventType, data };
  const payload = JSON.stringify([8, WAMP_EVENT_NAME, detail]);
  let delivered = 0;

  sockets.forEach((socket) => {
    if (!socket || socket.readyState !== socket.OPEN) return;

    const event = new MessageEvent("message", { data: payload });
    try {
      socket.dispatchEvent(event);
      if (typeof socket.onmessage === "function") {
        socket.onmessage(event);
      }
      delivered += 1;
    } catch (error) {
      console.warn("[client-instance-lab] socket publish failed", error);
    }
  });

  publishToDispatcher(uri, data);
  dispatchDomApiEvent(detail);

  return { uri, eventType, delivered };
}

function publishToDispatcher(uri, data) {
  const dispatcher = contextRef?.socket?._dispatcher;
  if (!dispatcher || typeof dispatcher.publish !== "function") return;

  try {
    dispatcher.publish(uri, {
      data,
      eventType: "Update",
      uri,
    });
  } catch (error) {
    console.warn("[client-instance-lab] dispatcher publish failed", error);
  }
}

function dispatchDomApiEvent(detail) {
  for (const target of [window, document]) {
    for (const name of [WAMP_EVENT_NAME, "ClientInstanceLabJsonApiEvent", "ShadowRootCSSMockJsonApiEvent"]) {
      try {
        target.dispatchEvent(new CustomEvent(name, { detail }));
      } catch (_) {}
    }
  }
}

async function attemptRcpActivation(scenario) {
  const rcp = getRcp();
  const result = {
    hasRcp: Boolean(rcp),
    apiKeys: {},
    calls: [],
  };

  if (!rcp) return result;
  if (typeof rcp.whenReady !== "function") {
    result.calls.push({
      fn: "rcp.whenReady",
      ok: false,
      error: "rcp.whenReady is not available",
    });
    return result;
  }

  const pluginNames = [...new Set(["rcp-fe-lol-navigation", ...scenario.plugins])];
  const apis = {};

  for (const name of pluginNames) {
    try {
      apis[name] = await Promise.race([
        rcp.whenReady(name),
        wait(1500).then(() => null),
      ]);
      result.apiKeys[name] = describeObject(apis[name]);
    } catch (error) {
      result.apiKeys[name] = [`error: ${error?.message || error}`];
    }
  }

  const navigation = apis["rcp-fe-lol-navigation"];
  const likelyNames = [
    ...(scenario.routeNames || []),
    scenario.id,
    scenario.phase,
    `rcp-fe-lol-${scenario.id}`,
    scenario.label,
  ];

  for (const target of [navigation, ...Object.values(apis)]) {
    if (!target) continue;
    for (const fn of [
      "navigate",
      "navigateTo",
      "show",
      "showItem",
      "showScreen",
      "open",
      "openScreen",
      "activate",
      "activateItem",
      "setActive",
      "setActiveItem",
      "displayScreen",
      "switchTo",
    ]) {
      if (typeof target[fn] !== "function") continue;

      for (const value of likelyNames) {
        result.calls.push(await tryCall(target, fn, [value]));
      }
    }
  }

  return result;
}

async function tryCall(target, fn, args) {
  try {
    const result = target[fn](...args);
    if (result && typeof result.then === "function") {
      await result;
    }
    return { fn, args, ok: true };
  } catch (error) {
    return { fn, args, ok: false, error: error?.message || String(error) };
  }
}

function getRcp() {
  return contextRef?.rcp || window.rcp || window.Pengu?.rcp || null;
}

function findScenarioTarget(scenario) {
  for (const selector of scenario?.targetSelectors || []) {
    try {
      const element = document.querySelector(selector);
      if (element) return selector;
    } catch (_) {}
  }

  const text = document.body?.innerText || "";
  for (const targetText of scenario?.targetTexts || []) {
    if (text.includes(targetText)) {
      return `text:${targetText}`;
    }
  }

  return null;
}

function clearRuntimeArtifacts() {
  delete window.__ClientInstanceLabRuntime;
}

function startScenarioHold() {
  stopScenarioHold();

  holdRefreshTimer = setInterval(() => {
    if (!activeScenario || disposed) return;
    if (findScenarioTarget(activeScenario)) return;
    if (holdNavigationInFlight) return;

    holdNavigationInFlight = true;
    Promise.resolve()
      .then(() => emitScenarioBundle(activeScenario))
      .then(() => attemptRcpActivation(activeScenario))
      .catch((error) => {
        console.warn("[client-instance-lab] hold activation failed", error);
      })
      .finally(() => {
        holdNavigationInFlight = false;
      });
  }, HOLD_REFRESH_MS);
}

function stopScenarioHold() {
  if (holdRefreshTimer) {
    clearInterval(holdRefreshTimer);
    holdRefreshTimer = null;
  }
  holdNavigationInFlight = false;
}

function attachDebugObservers() {
  if (!contextRef?.socket?.observe || observerDisposers.length > 0) return;

  observerDisposers = DEBUG_URIS.map((uri) => {
    try {
      const subscription = contextRef.socket.observe(uri, (payload) => {
        try {
          console.info("[client-instance-lab] observed", uri, JSON.stringify(payload));
        } catch (_) {
          console.info("[client-instance-lab] observed", uri, payload);
        }
      });
      return () => subscription?.disconnect?.();
    } catch (error) {
      console.warn("[client-instance-lab] observe failed", uri, error);
      return null;
    }
  }).filter(Boolean);
}

function detachDebugObservers() {
  observerDisposers.forEach((dispose) => {
    try {
      dispose();
    } catch (_) {}
  });
  observerDisposers = [];
}

function restorePatchedGlobals() {
  if (nativeFetch && window.fetch !== nativeFetch) {
    window.fetch = nativeFetch;
  }

  if (NativeXHR && window.XMLHttpRequest !== NativeXHR) {
    window.XMLHttpRequest = NativeXHR;
  }

  if (NativeWebSocket && window.WebSocket !== NativeWebSocket) {
    window.WebSocket = NativeWebSocket;
  }
}

function getRequestMethod(input, init) {
  return String(init?.method || input?.method || "GET").toUpperCase();
}

function getRequestPath(input) {
  if (!input) return "";
  const raw = typeof input === "string" ? input : input.url || String(input);
  return normalizePath(raw);
}

function normalizePath(raw) {
  try {
    return new URL(raw, window.location.origin).pathname;
  } catch (_) {
    return String(raw).split("?")[0];
  }
}

function jsonMock(body, status = 200) {
  return {
    body,
    status,
    text: status === 204 || typeof body === "undefined" ? "" : JSON.stringify(body),
  };
}

function toFetchResponse(mock) {
  return new Response(mock.status === 204 ? null : mock.text, {
    status: mock.status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function deliverMockXhr(xhr, mock) {
  setTimeout(() => {
    defineReadonly(xhr, "readyState", 4);
    defineReadonly(xhr, "status", mock.status);
    defineReadonly(xhr, "statusText", mock.status === 200 ? "OK" : "Mock");
    defineReadonly(xhr, "response", mock.text);
    defineReadonly(xhr, "responseText", mock.text);

    fireXhrEvent(xhr, "readystatechange");
    fireXhrEvent(xhr, "load");
    fireXhrEvent(xhr, "loadend");
  }, 0);
}

function defineReadonly(target, prop, value) {
  try {
    Object.defineProperty(target, prop, {
      configurable: true,
      value,
    });
  } catch (_) {}
}

function fireXhrEvent(xhr, name) {
  const event = new Event(name);
  if (typeof xhr[`on${name}`] === "function") {
    try {
      xhr[`on${name}`](event);
    } catch (error) {
      console.warn("[client-instance-lab] XHR mock handler failed", error);
    }
  }

  try {
    xhr.dispatchEvent(event);
  } catch (_) {}
}

function makeGameflowMonitor(scenario) {
  const inGame = scenario.phase === "InProgress";
  return {
    gameClient: {
      observerServerIp: "127.0.0.1",
      observerServerPort: 0,
      running: inGame,
      visible: inGame,
    },
    gameRunning: inGame,
  };
}

function makeGameflowSession(scenario) {
  const queue = scenario.queue || {
    category: "PvP",
    description: "Client Instance Lab queue",
    gameMode: "ARAM",
    id: 450,
    isRanked: false,
    mapId: 12,
    name: "ARAM",
    type: "ARAM_UNRANKED_5x5",
  };

  return {
    gameClient: {
      observerServerIp: "127.0.0.1",
      observerServerPort: 0,
      running: scenario.phase === "InProgress",
      serverIp: "127.0.0.1",
      serverPort: 0,
      visible: scenario.phase === "InProgress",
    },
    gameData: {
      gameId: 123456789,
      gameName: "Client Instance Lab",
      isCustomGame: false,
      password: "",
      playerChampionSelections: makePlayerChampionSelections(scenario),
      queue,
      spectatorsAllowed: false,
      teamOne: makeGameflowTeam(100, true),
      teamTwo: makeGameflowTeam(200, false),
    },
    gameDodge: {
      dodgeIds: [],
      phase: "None",
      state: "Invalid",
    },
    map: {
      assets: {},
      categorizedContentBundles: {},
      description: "Howling Abyss",
      gameMode: "ARAM",
      gameModeName: "ARAM",
      id: 12,
      isRGM: false,
      mapStringId: "HA",
      name: "Howling Abyss",
      perPositionDisallowedSummonerSpells: {},
      perPositionRequiredSummonerSpells: {},
      platformId: "BR1",
    },
    phase: scenario.phase,
  };
}

function makeReadyCheck() {
  return {
    declinerIds: [],
    dodgeWarning: "None",
    playerResponse: "None",
    state: "InProgress",
    suppressUx: false,
    timer: PRACTICALLY_INFINITE_MS,
  };
}

function makeMatchmakingSearch() {
  return {
    errors: [],
    estimatedQueueTime: PRACTICALLY_INFINITE_MS,
    isCurrentlyInQueue: true,
    lowPriorityData: null,
    queueId: 450,
    readyCheck: makeReadyCheck(),
    searchState: "Found",
    timeInQueue: PRACTICALLY_INFINITE_MS,
  };
}

function makeChampSelectSession(scenario) {
  const champSelect = scenario.champSelect || {};
  const localPlayerCellId = champSelect.localPlayerCellId ?? DEFAULT_LOCAL_PLAYER_CELL_ID;
  const localChampionId = champSelect.localChampionId || 893;
  const pickableChampionIds = champSelect.pickableChampionIds || CHAMPION_IDS;
  const benchChampions = champSelect.benchChampions || ARAM_BENCH_CHAMPIONS;
  const timerPhase = champSelect.timerPhase || "FINALIZATION";
  const finalizationPhase = timerPhase === "FINALIZATION";
  const myTeam = CHAMPION_SELECT_ROSTER.ally.map((player) => makeChampSelectPlayer(player.cellId, true, player.championId));
  const theirTeam = CHAMPION_SELECT_ROSTER.enemy.map((player) => makeChampSelectPlayer(player.cellId, false, player.championId));

  return {
    actions: [
      myTeam.map((player, index) => ({
        actorCellId: player.cellId,
        championId: player.championId,
        completed: finalizationPhase || player.cellId !== localPlayerCellId,
        id: index + 1,
        isAllyAction: true,
        isInProgress: !finalizationPhase && player.cellId === localPlayerCellId,
        type: "pick",
      })),
    ],
    allowBattleBoost: false,
    allowDuplicatePicks: false,
    allowLockedEvents: false,
    allowPlayerPickSameChampion: false,
    allowRerolling: true,
    allowSkinSelection: true,
    allowSubsetChampionPicks: true,
    bans: {
      myTeamBans: [],
      numBans: 0,
      theirTeamBans: [],
    },
    benchChampions: benchChampions.map((championId, index) => ({
      championId,
      isPriority: index < 2,
    })),
    benchEnabled: Boolean(champSelect.benchEnabled),
    boostableSkinCount: 0,
    chatDetails: {
      chatRoomName: "client-instance-lab",
      chatRoomPassword: "",
    },
    counter: 1,
    disallowBanningTeammateHoveredChampions: false,
    gameId: 123456789,
    hasSimultaneousBans: false,
    hasSimultaneousPicks: true,
    id: "aram-mayhem-lab-session",
    isCustomGame: false,
    isLegacyChampSelect: false,
    isSpectating: false,
    localPlayerCellId,
    lockedEventIndex: -1,
    myTeam,
    positionSwaps: [],
    queueId: 450,
    rerollsRemaining: 2,
    showQuitButton: true,
    skipChampionSelect: false,
    theirTeam,
    timer: {
      adjustedTimeLeftInPhase: PRACTICALLY_INFINITE_MS,
      internalNowInEpochMs: FAR_FUTURE_EPOCH_MS,
      isInfinite: true,
      phase: timerPhase,
      totalTimeInPhase: PRACTICALLY_INFINITE_MS,
    },
    trades: [],
    pickOrderSwaps: [],
  };
}

function makeChampSelectPlayer(cellId, ally, championId) {
  const player = findRosterPlayer(cellId, championId);
  return {
    assignedPosition: "",
    cellId,
    championId: player?.championId || championId || 0,
    championPickIntent: player?.championId || championId || 0,
    gameName: player?.displayName || `Player ${cellId + 1}`,
    isHumanoid: true,
    nameVisibilityType: "VISIBLE",
    obfuscatedPuuid: "",
    obfuscatedSummonerId: 0,
    puuid: `client-instance-lab-${cellId}`,
    selectedSkinId: player?.skinId || (championId ? championId * 1000 : 0),
    spell1Id: player?.spell1Id || 4,
    spell2Id: player?.spell2Id || 32,
    summonerId: 9000000 + cellId,
    tagLine: PLACEHOLDER_TAG,
    team: ally ? 1 : 2,
  };
}

function makeChampSelectSummoner(cellId) {
  const ally = cellId < 5;
  const localPlayerCellId = activeScenario?.champSelect?.localPlayerCellId ?? DEFAULT_LOCAL_PLAYER_CELL_ID;
  const timerPhase = activeScenario?.champSelect?.timerPhase || "FINALIZATION";
  const isActingNow = timerPhase !== "FINALIZATION" && cellId === localPlayerCellId;
  const player = findRosterPlayer(cellId);
  return {
    actingBackgroundAnimationState: "idle",
    activeActionType: isActingNow ? "pick" : "",
    areSummonerActionsComplete: timerPhase === "FINALIZATION" || cellId !== localPlayerCellId,
    assignedPosition: "",
    banIntentChampionId: 0,
    cellId,
    championIconStyle: "display:none",
    championId: player?.championId || 0,
    championName: player?.skinName || "",
    currentChampionVotePercentInteger: 0,
    gameName: player?.displayName || PLAYER_NAMES[cellId] || `Player ${cellId + 1}`,
    displayName: player?.displayName || PLAYER_NAMES[cellId] || `Player ${cellId + 1}`,
    internalName: `summoner-${cellId}`,
    isActingNow,
    isAutofilled: false,
    isDonePicking: timerPhase === "FINALIZATION" || cellId !== localPlayerCellId,
    isHumanoid: true,
    isOnPlayersTeam: ally,
    isPickIntenting: false,
    isPlaceholder: false,
    isSelf: cellId === localPlayerCellId,
    nameVisibilityType: "VISIBLE",
    obfuscatedPuuid: "",
    obfuscatedSummonerId: 0,
    pickSnipedClass: "",
    positionSwapId: 0,
    puuid: `client-instance-lab-${cellId}`,
    shouldShowActingBar: isActingNow,
    shouldShowBanIntentIcon: false,
    shouldShowExpanded: true,
    shouldShowRingAnimations: true,
    shouldShowSelectedSkin: true,
    shouldShowSpells: true,
    showMuted: false,
    showPositionSwaps: false,
    showSwaps: false,
    showTrades: false,
    skinId: player?.skinId || 0,
    skinSplashPath: getChampionSplashPath(player),
    slotId: cellId,
    spell1IconPath: "",
    spell2IconPath: "",
    statusMessageKey: "",
    summonerId: 9000000 + cellId,
    swapId: 0,
    tagLine: PLACEHOLDER_TAG,
    tradeId: 0,
  };
}

function makeSkinSelectorInfo() {
  return {
    championName: "Aurora",
    isSkinGrantedFromBoost: false,
    selectedChampionId: 893,
    selectedSkinId: 893001,
    showSkinSelector: true,
    skinSelectionDisabled: false,
  };
}

function makeSkinCarouselSkins() {
  return AURORA_SKINS;
}

function makeChampSelectInventory() {
  return CHAMPION_IDS.map((championId) => ({
    activeBoosts: [],
    championId,
    freeToPlayReward: false,
    id: championId,
    inventoryType: "CHAMPION",
    itemId: championId,
    owned: true,
    percentComplete: 100,
    quantity: 1,
  }));
}

function makeEogStatsBlock() {
  const teams = makeEndOfGameTeams();

  return {
    accountId: 205312809,
    basePoints: 0,
    battleBoostIpEarned: 0,
    boostIpEarned: 0,
    boostXpEarned: 0,
    causedEarlySurrender: false,
    currentLevel: 500,
    customMinutesLeftToday: 0,
    difficulty: "NONE",
    earlySurrenderAccomplice: false,
    endOfGameTimestamp: Date.now(),
    experienceEarned: 960,
    experienceTotal: 12800,
    firstWinBonus: 0,
    gameEndedInEarlySurrender: false,
    gameId: 123456789,
    gameLength: 1421,
    gameMode: "ARAM",
    gameMutators: [],
    gameType: "MATCHED_GAME",
    globalBoostXpEarned: 0,
    honorStats: {
      honorCategory: "HEART",
      honorVotesReceived: 9,
      mostHonored: true,
      totalHonorCount: 9,
      wasHonored: true,
      wasMostHonored: true,
    },
    honorVotesReceived: 9,
    ipEarned: 0,
    ipTotal: 0,
    imbalancedTeamsNoPoints: false,
    invalid: false,
    leveledUp: false,
    localPlayer: {
      botPlayer: false,
      championId: 893,
      championName: "Aurora",
      championSquarePortraitPath: "/lol-game-data/assets/v1/champion-icons/893.png",
      detectedTeamPosition: "",
      gameId: 123456789,
      isLocalPlayer: true,
      items: [6655, 3020, 3165, 3089, 4645, 3157],
      leaver: false,
      leaves: 0,
      level: 18,
      losses: 0,
      profileIconId: 29,
      puuid: "client-instance-lab-1",
      riotIdGameName: "Nova",
      riotIdTagLine: PLACEHOLDER_TAG,
      selectedPosition: "",
      skinEmblemPaths: [],
      skinSplashPath: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Skin01/Images/Aurora_splash_centered_1.jpg",
      skinTilePath: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Skin01/Images/Aurora_splash_tile_1.jpg",
      spell1Id: 4,
      spell2Id: 32,
      stats: {
        ASSISTS: 18,
        CHAMPIONS_KILLED: 11,
        GOLD_EARNED: 15120,
        NUM_DEATHS: 4,
        WIN: 1,
      },
      summonerId: 9000001,
      summonerName: "Nova",
      teamId: 100,
      wins: 1,
    },
    loyaltyBoostXpEarned: 0,
    missionsXpEarned: 0,
    missionsXp: 0,
    myTeamStatus: "HONORABLE",
    newSpells: [],
    nextLevelXp: 12800,
    preLevelUpExperienceTotal: 11840,
    preLevelUpNextLevelXp: 12800,
    previousLevel: 500,
    previousXpTotal: 11840,
    queueType: "ARAM_UNRANKED_5x5",
    ranked: false,
    reportGameId: 123456789,
    rerollData: {
      pointChangeFromChampionsOwned: 220,
      pointChangeFromGameplay: 180,
      pointsUntilNextReroll: 90,
      pointsUsed: 250,
      previousPoints: 310,
      rerollCount: 2,
      totalPoints: 470,
    },
    rpEarned: 0,
    skinIndex: 0,
    summonerId: 9000001,
    teamBoost: {
      availableSkins: [],
      ipReward: 0,
      ipRewardForPurchaser: 0,
      price: 95,
      skinUnlockMode: "NONE",
      summonerName: "",
      unlocked: false,
    },
    teamEarlySurrendered: false,
    teams,
    timeUntilNextFirstWinBonus: 0,
    xbgpBoostXpEarned: 0,
  };
}

function makeGameClientEogStatsBlock() {
  return {
    gameId: 123456789,
    gameMode: "ARAM",
    isRanked: false,
    queueId: 450,
    queueType: "ARAM_UNRANKED_5x5",
    statsBlock: makeEogStatsBlock(),
  };
}

function makeHonorResponse(path, scenario = activeScenario) {
  if (path.endsWith("/recipients")) {
    return makeHonorRecipients();
  }

  if (path.endsWith("/ballot")) {
    return {
      eligibleAllies: makeHonorRecipients(),
      eligibleOpponents: makeHonorOpponentRecipients(),
      gameId: 123456789,
      honoredPlayers: [],
      isEnabled: true,
      state: scenario?.honorVote ? "VOTING" : "COMPLETE",
      timeUntilVoteEnds: scenario?.honorVote ? PRACTICALLY_INFINITE_MS : 0,
      votePool: {
        fromGamePlayed: 1,
        fromHighHonor: 0,
        fromRecentHonors: 0,
        fromRollover: 0,
        votes: 2,
      },
    };
  }

  if (path.endsWith("/config")) {
    return {
      enabled: true,
      secondsToVote: Math.floor(PRACTICALLY_INFINITE_MS / 1000),
    };
  }

  if (path.endsWith("/recognition") || path.endsWith("/late-recognition")) {
    return scenario?.honorReceived ? makeHonorRecognition({ late: path.endsWith("/late-recognition") }) : [];
  }

  if (path.endsWith("/reward-granted")) {
    return scenario?.honorReceived ? makeHonorRewardGranted() : {
      dynamicHonorMessage: { messageId: "", value: -1 },
      quantity: -1,
      rewardType: "",
    };
  }

  if (path.endsWith("/mutual-honor")) {
    return scenario?.honorReceived ? makeMutualHonor() : null;
  }

  if (path.endsWith("/profile")) {
    return makeHonorProfile();
  }

  if (path.endsWith("/level-change")) {
    return scenario?.honorLevelChange ? makeHonorLevelChange() : {
      actionType: "",
      currentState: { checkpoint: -1, level: -1, rewardsLocked: false },
      dynamicHonorMessage: { messageId: "", value: -1 },
      previousState: { checkpoint: -1, level: -1, rewardsLocked: false },
      reward: { quantity: -1, rewardType: "" },
    };
  }

  return null;
}

function makeHonorRecipients() {
  return HONOR_VOTE_ROSTER.allies.map((player) => ({
    championName: player.skinName,
    eligible: true,
    gameName: player.displayName,
    honorTypes: ["HEART", "COOL", "GG"],
    puuid: `client-instance-lab-honor-${player.cellId}`,
    summonerId: 9000000 + player.cellId,
    tagLine: PLACEHOLDER_TAG,
  }));
}

function makeHonorOpponentRecipients() {
  return HONOR_VOTE_ROSTER.opponents.map((player) => ({
    championName: player.skinName,
    eligible: true,
    gameName: player.displayName,
    honorTypes: ["HEART", "COOL", "GG"],
    puuid: `client-instance-lab-honor-${player.cellId}`,
    summonerId: 9000000 + player.cellId,
    tagLine: PLACEHOLDER_TAG,
  }));
}

function makeHonorTeamChoices() {
  return [
    { honorType: "HEART", id: "HEART", localizedName: "GG <3", name: "GG <3" },
    { honorType: "COOL", id: "COOL", localizedName: "Tiltproof", name: "Tiltproof" },
    { honorType: "GG", id: "GG", localizedName: "Great Shotcalling", name: "Great Shotcalling" },
  ];
}

function makeHonorVoteCompletion(scenario = activeScenario) {
  return {
    completed: !scenario?.honorVote,
    fullTeamVote: false,
    gameId: 123456789,
    timeUntilVoteEnds: scenario?.honorVote ? PRACTICALLY_INFINITE_MS : 0,
    voted: !scenario?.honorVote,
  };
}

function makeHonorRecognition(options = {}) {
  const history = makeHonorRecognitionHistory();
  return {
    eligibleForHonor: true,
    gameId: 123456789,
    honorCategory: "HEART",
    honorType: "HEART",
    honorVotes: 9,
    honorVotesReceived: 9,
    honoredByAllPlayers: true,
    honoredByPremade: false,
    late: Boolean(options.late),
    mostHonored: true,
    recognitionType: "MOST_HONORED",
    senderPuuids: history.map((item) => item.puuid),
    senders: history,
    totalHonorCount: 9,
    voteCount: 9,
    wasHonored: true,
    wasMostHonored: true,
  };
}

function makeHonorRecognitionHistory() {
  const recognitionRoster = [
    ...HONOR_VOTE_ROSTER.allies,
    ...HONOR_VOTE_ROSTER.opponents,
  ];

  return recognitionRoster.map((player, index) => ({
    championName: player.skinName,
    gameId: 123456789,
    gameName: player.displayName,
    honorCategory: ["HEART", "COOL", "GG"][index % 3],
    honorType: ["HEART", "COOL", "GG"][index % 3],
    puuid: `client-instance-lab-recognition-${player.cellId}`,
    summonerId: 9000000 + player.cellId,
    tagLine: PLACEHOLDER_TAG,
  }));
}

function makeHonorRewardGranted() {
  return {
    dynamicHonorMessage: {
      messageId: "most-honored",
      value: 9,
    },
    quantity: 1,
    rewardGranted: true,
    rewardType: "MOST_HONORED",
  };
}

function makeMutualHonor() {
  return {
    gameId: 123456789,
    honorType: "HEART",
    mutualHonorRecipients: makeHonorRecognitionHistory().slice(0, 4),
    totalHonorCount: 9,
  };
}

function makeHonorProfile() {
  return {
    checkpoint: 3,
    honorLevel: 5,
    lockedUntilDateMillis: 0,
  };
}

function makeHonorLevelChange() {
  return {
    actionType: "LEVEL_UP",
    currentState: {
      checkpoint: 0,
      level: 5,
      newExp: 4820,
      rewardsLocked: false,
    },
    dynamicHonorMessage: {
      messageId: "honor-level-up",
      value: 1,
    },
    previousState: {
      checkpoint: 2,
      level: 4,
      newExp: 4310,
      rewardsLocked: false,
    },
    reward: {
      quantity: 1,
      rewardType: "KEY_FRAGMENT",
    },
  };
}

function findRosterPlayer(cellId, championId) {
  const roster = [...CHAMPION_SELECT_ROSTER.ally, ...CHAMPION_SELECT_ROSTER.enemy];
  return roster.find((player) => player.cellId === cellId)
    || roster.find((player) => player.championId === championId)
    || null;
}

function makeEndOfGameTeams() {
  const useHonorVoteRoster = Boolean(activeScenario?.honorVote);
  const allyRoster = useHonorVoteRoster ? HONOR_VOTE_ROSTER.allies : CHAMPION_SELECT_ROSTER.ally;
  const enemyRoster = useHonorVoteRoster ? HONOR_VOTE_ROSTER.opponents : CHAMPION_SELECT_ROSTER.enemy;

  return [
    {
      fullId: "team-one",
      isBottomTeam: true,
      isPlayerTeam: true,
      isWinningTeam: true,
      memberStatusString: "HONORABLE",
      name: "BLUE",
      players: allyRoster.map((player, index) => makeEndOfGamePlayer(player, 100, !useHonorVoteRoster && index === DEFAULT_LOCAL_PLAYER_CELL_ID)),
      stats: {
        ASSISTS: 54,
        CHAMPIONS_KILLED: 48,
        NUM_DEATHS: 29,
      },
      tag: "ALLY",
      teamId: 100,
    },
    {
      fullId: "team-two",
      isBottomTeam: false,
      isPlayerTeam: false,
      isWinningTeam: false,
      memberStatusString: "OPPONENT",
      name: "RED",
      players: enemyRoster.map((player) => makeEndOfGamePlayer(player, 200, false)),
      stats: {
        ASSISTS: 37,
        CHAMPIONS_KILLED: 31,
        NUM_DEATHS: 48,
      },
      tag: "ENEMY",
      teamId: 200,
    },
  ];
}

function makeEndOfGamePlayer(player, teamId, isLocalPlayer) {
  return {
    botPlayer: false,
    championId: player.championId,
    championName: player.skinName,
    championSquarePortraitPath: `/lol-game-data/assets/v1/champion-icons/${player.championId}.png`,
    detectedTeamPosition: "",
    gameId: 123456789,
    isLocalPlayer,
    items: isLocalPlayer ? [6655, 3020, 3165, 3089, 4645, 3157] : [3153, 3111, 3053, 6694, 6695, 3071],
    leaver: false,
    leaves: 0,
    level: 18,
    losses: teamId === 100 ? 0 : 1,
    profileIconId: 29 + player.cellId,
    puuid: `client-instance-lab-${player.cellId}`,
    riotIdGameName: player.displayName,
    riotIdTagLine: PLACEHOLDER_TAG,
    selectedPosition: "",
    skinEmblemPaths: [],
    skinSplashPath: getChampionSplashPath(player),
    skinTilePath: getChampionTilePath(player),
    spell1Id: player.spell1Id,
    spell2Id: player.spell2Id,
    stats: {
      ASSISTS: isLocalPlayer ? 18 : 7 + (player.cellId % 4),
      CHAMPIONS_KILLED: isLocalPlayer ? 11 : 5 + (player.cellId % 5),
      GOLD_EARNED: isLocalPlayer ? 15120 : 12200 + (player.cellId * 210),
      NUM_DEATHS: isLocalPlayer ? 4 : 6 + (player.cellId % 3),
      WIN: teamId === 100 ? 1 : 0,
    },
    summonerId: 9000000 + player.cellId,
    summonerName: player.displayName,
    teamId,
    wins: teamId === 100 ? 1 : 0,
  };
}

function getChampionSplashPath(player) {
  const splashBySkin = {
    79000: "/lol-game-data/assets/ASSETS/Characters/Gragas/Skins/Base/Images/gragas_splash_centered_0.jpg",
    21040: "/lol-game-data/assets/ASSETS/Characters/MissFortune/Skins/Skin40/Images/missfortune_splash_centered_40.jpg",
    35000: "/lol-game-data/assets/ASSETS/Characters/Shaco/Skins/Base/Images/shaco_splash_centered_0.jpg",
    72004: "/lol-game-data/assets/ASSETS/Characters/Skarner/Skins/Skin04/Images/skarner_splash_centered_4.jpg",
    134007: "/lol-game-data/assets/ASSETS/Characters/Syndra/Skins/Skin07/Images/syndra_splash_centered_7.jpg",
    161002: "/lol-game-data/assets/ASSETS/Characters/Velkoz/Skins/Skin02/Images/velkoz_splash_centered_2.jpg",
    235001: "/lol-game-data/assets/ASSETS/Characters/Senna/Skins/Skin01/Images/senna_splash_centered_1.jpg",
    893001: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Skin01/Images/Aurora_splash_centered_1.jpg",
    893000: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Base/Images/Aurora_splash_centered_0.jpg",
    96019: "/lol-game-data/assets/ASSETS/Characters/KogMaw/Skins/Skin19/Images/kogmaw_splash_centered_19.jpg",
    121003: "/lol-game-data/assets/ASSETS/Characters/KhaZix/Skins/skin03/Images/khazix_splash_centered_3.jpg",
    35064: "/lol-game-data/assets/ASSETS/Characters/Shaco/Skins/Skin64/Images/shaco_splash_centered_64.jpg",
    800000: "/lol-game-data/assets/ASSETS/Characters/Mel/Skins/Base/Images/Mel_splash_centered_0.jpg",
  };

  return splashBySkin[player?.skinId] || "";
}

function getChampionTilePath(player) {
  const tileBySkin = {
    79000: "/lol-game-data/assets/ASSETS/Characters/Gragas/Skins/Base/Images/gragas_splash_tile_0.jpg",
    21040: "/lol-game-data/assets/ASSETS/Characters/MissFortune/Skins/Skin40/Images/missfortune_splash_tile_40.jpg",
    35000: "/lol-game-data/assets/ASSETS/Characters/Shaco/Skins/Base/Images/shaco_splash_tile_0.jpg",
    72004: "/lol-game-data/assets/ASSETS/Characters/Skarner/Skins/Skin04/Images/skarner_splash_tile_4.jpg",
    161002: "/lol-game-data/assets/ASSETS/Characters/Velkoz/Skins/Skin02/Images/velkoz_splash_tile_2.jpg",
    235001: "/lol-game-data/assets/ASSETS/Characters/Senna/Skins/Skin01/Images/senna_splash_tile_1.jpg",
    893000: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Base/Images/Aurora_splash_tile_0.jpg",
    893001: "/lol-game-data/assets/ASSETS/Characters/Aurora/Skins/Skin01/Images/Aurora_splash_tile_1.jpg",
    800000: "/lol-game-data/assets/ASSETS/Characters/Mel/Skins/Base/Images/Mel_splash_tile_0.jpg",
  };

  return tileBySkin[player?.skinId] || "";
}

function makePlayerChampionSelections(scenario) {
  if (scenario.phase !== "ChampSelect") {
    return [];
  }

  return [...CHAMPION_SELECT_ROSTER.ally, ...CHAMPION_SELECT_ROSTER.enemy].map((player) => ({
    championId: player.championId,
    selectedSkinId: player.skinId,
    spell1Id: player.spell1Id,
    spell2Id: player.spell2Id,
    summonerInternalName: `summoner-${player.cellId}`,
    summonerName: player.displayName,
    team: player.cellId < 5 ? 100 : 200,
  }));
}

function makeGameflowTeam(teamId, ally) {
  const roster = ally ? CHAMPION_SELECT_ROSTER.ally : CHAMPION_SELECT_ROSTER.enemy;
  return roster.map((player) => ({
    championId: player.championId,
    puuid: `client-instance-lab-${player.cellId}`,
    selectedSkinId: player.skinId,
    spell1Id: player.spell1Id,
    spell2Id: player.spell2Id,
    summonerId: 9000000 + player.cellId,
    teamId,
  }));
}

async function nativeJson(path, fallback) {
  if (!nativeFetch) return fallback;

  try {
    const response = await nativeFetch(path);
    if (!response.ok) return fallback;
    return response.json();
  } catch (_) {
    return fallback;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeObject(value) {
  if (!value) return [];

  const keys = new Set();
  let current = value;

  for (let depth = 0; current && depth < 4; depth += 1) {
    Object.getOwnPropertyNames(current).forEach((key) => {
      if (key !== "constructor") {
        keys.add(key);
      }
    });
    current = Object.getPrototypeOf(current);
  }

  return [...keys].sort();
}
