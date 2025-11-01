const TURN_LIMIT = 30;
const PLAYER_COLORS = ['#ff8ba7', '#70d6ff', '#ffd166', '#6ef2a5'];
const VEHICLE_EMOJIS = ['①', '②'];

const MAP_BOUNDS = { width: 1200, height: 780 };
const DESTINATION_THEMES = [
  { label: 'Парк светлячков', color: '#8bd3dd', icon: '🌿' },
  { label: 'Ванильная кофейня', color: '#ffd6a5', icon: '☕' },
  { label: 'Бирюзовый лофт', color: '#9bf6ff', icon: '🏙️' },
  { label: 'Лавандовая площадь', color: '#cdb4db', icon: '🌸' },
  { label: 'Солнечный рынок', color: '#ffe066', icon: '🛍️' },
  { label: 'Озеро Дрифтвуд', color: '#b5e48c', icon: '🛶' },
  { label: 'Коралловая набережная', color: '#ffafcc', icon: '🌊' },
  { label: 'Неоновый гараж', color: '#a0c4ff', icon: '🛠️' },
];

const ONLINE_HTTP = 'https://irgri.uk/';
const ONLINE_WS = 'wss://irgri.uk/';

const elements = {
  canvas: document.getElementById('gameCanvas'),
  board: document.querySelector('.board'),
  hint: document.getElementById('hint'),
  btnAdvance: document.getElementById('btnAdvance'),
  btnToggleNodes: document.getElementById('btnToggleNodes'),
  vehicleList: document.getElementById('vehicleList'),
  log: document.getElementById('log'),
  turnLabel: document.getElementById('turnLabel'),
  activePlayerLabel: document.getElementById('activePlayerLabel'),
  modeScreen: document.getElementById('modeScreen'),
  modeDetails: document.getElementById('modeDetails'),
  btnStart: document.getElementById('btnStart'),
  stopAmount: document.getElementById('stopAmount'),
  stopAmountLabel: document.getElementById('stopAmountLabel'),
  stopHandle: document.getElementById('stopHandle'),
  scorePlayers: document.getElementById('scorePlayers'),
  prefShowNodes: document.getElementById('prefShowNodes'),
  prefPlayerName: document.getElementById('prefPlayerName'),
};

const ctx = elements.canvas.getContext('2d');
const view = { scale: 1, pixelScale: 1 };

const state = {
  map: { width: MAP_BOUNDS.width, height: MAP_BOUNDS.height, nodes: [], edges: [] },
  graph: new Map(),
  destinations: [],
  running: false,
  mode: null,
  showNodes: false,
  preferences: {
    showNodes: false,
    playerName: '',
  },
  players: [],
  vehicles: [],
  selectedVehicleId: null,
  turn: 0,
  turnLimit: TURN_LIMIT,
  log: [],
  hint: 'Выберите режим, чтобы начать игру.',
  localPlayerId: null,
  online: null,
  activePlayer: null,
  roomCode: null,
  interaction: {
    active: false,
    type: null,
    vehicleId: null,
    path: [],
    hoverNode: null,
    pointerId: null,
  },
  stopDrag: {
    active: false,
    vehicleId: null,
    amount: 1,
    hoverNode: null,
  },
};

setMap(generateCityMap());

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateCityMap() {
  const width = MAP_BOUNDS.width;
  const height = MAP_BOUNDS.height;
  const cols = 6;
  const rows = 4;
  const marginX = 120;
  const marginY = 120;
  const stepX = (width - marginX * 2) / (cols - 1);
  const stepY = (height - marginY * 2) / (rows - 1);
  const nodes = [];
  const adjacency = new Map();
  let idCounter = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = `N${idCounter.toString().padStart(2, '0')}`;
      idCounter += 1;
      const jitterX = randomBetween(-stepX * 0.35, stepX * 0.35);
      const jitterY = randomBetween(-stepY * 0.35, stepY * 0.35);
      const x = marginX + col * stepX + jitterX;
      const y = marginY + row * stepY + jitterY;
      nodes.push({ id, x, y });
      adjacency.set(id, new Set());
    }
  }

  const edges = [];
  const edgeSet = new Set();

  const addEdge = (a, b) => {
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([a, b]);
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  };

  const indexOf = (row, col) => row * cols + col;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const current = nodes[indexOf(row, col)];
      if (!current) continue;
      if (col < cols - 1) {
        addEdge(current.id, nodes[indexOf(row, col + 1)]?.id);
      }
      if (row < rows - 1) {
        addEdge(current.id, nodes[indexOf(row + 1, col)]?.id);
      }
      if (row < rows - 1 && col < cols - 1 && Math.random() < 0.55) {
        addEdge(current.id, nodes[indexOf(row + 1, col + 1)]?.id);
      }
      if (row < rows - 1 && col > 0 && Math.random() < 0.35) {
        addEdge(current.id, nodes[indexOf(row + 1, col - 1)]?.id);
      }
    }
  }

  const typicalSpan = Math.hypot(stepX, stepY) * 1.4;
  const extras = Math.floor(nodes.length * 1.5);
  for (let i = 0; i < extras; i += 1) {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    if (!a) continue;
    const candidates = nodes.filter((node) => node.id !== a.id && distance(node, a) <= typicalSpan * randomBetween(0.7, 1.6));
    if (!candidates.length) continue;
    const b = candidates[Math.floor(Math.random() * candidates.length)];
    addEdge(a.id, b.id);
  }

  const buildComponents = () => {
    const seen = new Set();
    const components = [];
    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      const queue = [node.id];
      const component = [];
      seen.add(node.id);
      while (queue.length) {
        const current = queue.shift();
        component.push(current);
        for (const next of adjacency.get(current) || []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      components.push(component);
    }
    return components;
  };

  let components = buildComponents();
  while (components.length > 1) {
    const detached = components.pop();
    const anchor = components[0];
    const from = detached[Math.floor(Math.random() * detached.length)];
    const to = anchor[Math.floor(Math.random() * anchor.length)];
    addEdge(from, to);
    components = buildComponents();
  }

  return { width, height, nodes, edges };
}

function buildGraph(map) {
  const nodes = new Map();
  if (!map?.nodes) return nodes;
  for (const node of map.nodes) {
    nodes.set(node.id, { ...node, neighbors: new Set() });
  }
  for (const [a, b] of map.edges || []) {
    nodes.get(a)?.neighbors.add(b);
    nodes.get(b)?.neighbors.add(a);
  }
  return nodes;
}

function generateDestinations(map) {
  if (!map?.nodes?.length) return [];
  const styles = shuffle(DESTINATION_THEMES);
  const spots = shuffle(map.nodes.slice());
  const count = Math.min(styles.length, Math.max(6, Math.floor(map.nodes.length / 3)));
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const node = spots[i % spots.length];
    const style = styles[i % styles.length];
    result.push({ node: node.id, label: style.label, color: style.color, icon: style.icon });
  }
  return result;
}

function setMap(map, destinations) {
  const nextMap = {
    width: map?.width || MAP_BOUNDS.width,
    height: map?.height || MAP_BOUNDS.height,
    nodes: Array.isArray(map?.nodes) ? map.nodes.slice() : [],
    edges: Array.isArray(map?.edges) ? map.edges.map((edge) => edge.slice()) : [],
  };
  state.map = nextMap;
  state.graph = buildGraph(nextMap);
  const points = Array.isArray(destinations) && destinations.length ? destinations : generateDestinations(nextMap);
  state.destinations = points.map((point) => ({ ...point }));
  resizeCanvas();
}

function createRoundLayout() {
  const map = generateCityMap();
  const destinations = generateDestinations(map);
  return { map, destinations };
}

function nodeById(id) {
  return state.graph?.get(id) || null;
}

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function findNearestNode(x, y, maxDistance = Infinity) {
  let closest = null;
  let best = maxDistance;
  for (const node of state.map.nodes) {
    const d = distance({ x, y }, node);
    if (d <= best) {
      best = d;
      closest = node;
    }
  }
  return closest;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixChannel(channel, factor, lighten = true) {
  return lighten
    ? Math.round(channel + (255 - channel) * factor)
    : Math.round(channel * (1 - factor));
}

function adjustColor(hex, factor, lighten = true) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const f = clamp(factor, 0, 1);
  const nr = mixChannel(r, f, lighten);
  const ng = mixChannel(g, f, lighten);
  const nb = mixChannel(b, f, lighten);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb
    .toString(16)
    .padStart(2, '0')}`;
}

function lightenColor(hex, factor = 0.2) {
  return adjustColor(hex, factor, true);
}

function darkenColor(hex, factor = 0.2) {
  return adjustColor(hex, factor, false);
}

function resizeCanvas() {
  if (!elements.board) return;
  const rect = elements.board.getBoundingClientRect();
  const availableWidth = rect.width;
  const availableHeight = rect.height;
  if (!availableWidth || !availableHeight) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const mapWidth = state.map?.width || MAP_BOUNDS.width;
  const mapHeight = state.map?.height || MAP_BOUNDS.height;
  const scale = Math.min(availableWidth / mapWidth, availableHeight / mapHeight);
  const displayWidth = Math.max(mapWidth * scale, 1);
  const displayHeight = Math.max(mapHeight * scale, 1);
  elements.canvas.style.width = `${displayWidth}px`;
  elements.canvas.style.height = `${displayHeight}px`;
  elements.canvas.width = Math.max(1, Math.round(displayWidth * ratio));
  elements.canvas.height = Math.max(1, Math.round(displayHeight * ratio));
  view.scale = scale;
  view.pixelScale = scale * ratio;
}

function loadPreferences() {
  const defaults = {
    playerName: 'Игрок',
    showNodes: false,
  };
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const storedName = storage?.getItem('trafficity.playerName');
    if (storedName && storedName.trim().length) {
      state.preferences.playerName = storedName.trim();
    } else {
      state.preferences.playerName = defaults.playerName;
    }
    const storedNodes = storage?.getItem('trafficity.showNodes');
    if (typeof storedNodes === 'string') {
      state.preferences.showNodes = storedNodes === 'true';
    } else {
      state.preferences.showNodes = defaults.showNodes;
    }
  } catch (err) {
    state.preferences.playerName = defaults.playerName;
    state.preferences.showNodes = defaults.showNodes;
  }
  if (elements.prefPlayerName) {
    elements.prefPlayerName.value = state.preferences.playerName;
  }
  if (elements.prefShowNodes) {
    elements.prefShowNodes.checked = state.preferences.showNodes;
  }
}

function shortestPath(start, goal) {
  const graph = state.graph;
  if (!graph?.size) return null;
  if (start === goal) return [start];
  const queue = [start];
  const visited = new Set([start]);
  const prev = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (current === goal) break;
    for (const next of graph.get(current)?.neighbors || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, current);
      queue.push(next);
    }
  }
  if (!prev.has(goal) && start !== goal) return null;
  const path = [];
  let cur = goal;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path;
}

function randomDestination(exclude) {
  const pool = state.destinations.length ? state.destinations : generateDestinations(state.map);
  const candidates = pool.filter((d) => d.node !== exclude);
  const source = candidates.length ? candidates : pool;
  if (!source.length) {
    const fallback = state.map.nodes[0];
    return fallback
      ? { node: fallback.id, label: 'Финиш', color: '#ffd6a5', icon: '🏁' }
      : { node: exclude, label: 'Финиш', color: '#ffd6a5', icon: '🏁' };
  }
  return source[Math.floor(Math.random() * source.length)];
}

function createPlayer(id, name, type, color) {
  return {
    id,
    name,
    type,
    color,
    deliveries: 0,
    score: 0,
  };
}

function createVehicle(player, index, startNode) {
  const starting = startNode || state.map.nodes[0]?.id;
  const dest = randomDestination(starting);
  return {
    id: `${player.id}-${index + 1}`,
    label: `${player.name} ${VEHICLE_EMOJIS[index] || index + 1}`,
    ownerId: player.id,
    order: index + 1,
    color: player.color,
    current: starting,
    goal: dest.node,
    goalInfo: dest,
    route: [],
    waiting: 0,
    stopOrders: {},
    stepsTaken: 0,
    history: [],
  };
}

function startSoloGame() {
  const layout = createRoundLayout();
  resetState(layout);
  const displayName = (state.preferences.playerName || '').trim() || 'Вы';
  const human = createPlayer('player', displayName, 'human', PLAYER_COLORS[0]);
  const ai = createPlayer('ai', 'Автопилот', 'ai', PLAYER_COLORS[1]);
  state.players = [human, ai];
  state.localPlayerId = human.id;
  state.activePlayer = human.id;
  assignVehicles();
  autoPlanForAI();
  selectDefaultVehicle(human.id);
  setHint('Нажмите на машину и протяните линию по узлам до цели.');
  state.mode = 'solo';
  state.running = true;
  elements.btnAdvance.disabled = false;
  updateUI();
}

function startLocalGame(names) {
  const layout = createRoundLayout();
  resetState(layout);
  state.players = names.map((name, idx) =>
    createPlayer(
      `p${idx + 1}`,
      (name && name.trim().length ? name.trim() : `Игрок ${idx + 1}`),
      'human',
      PLAYER_COLORS[idx % PLAYER_COLORS.length]
    )
  );
  state.localPlayerId = state.players[0].id;
  state.activePlayer = null;
  assignVehicles();
  selectDefaultVehicle(state.localPlayerId);
  setHint('Игроки тянут маршруты машин и ставят стопы, затем нажимают «Следующий ход».');
  state.mode = 'local';
  state.running = true;
  elements.btnAdvance.disabled = false;
  updateUI();
}

function startOnlineGame(config) {
  resetState();
  state.mode = 'online';
  const { name, action, room } = config;
  const socket = new WebSocket(ONLINE_WS);
  state.online = { socket, action, roomCode: room, name };
  state.roomCode = room;
  state.activePlayer = null;
  setHint('Соединяемся с irgri.uk...');
  socket.addEventListener('open', () => {
    socket.send(
      JSON.stringify({
        type: 'hello',
        payload: { name, action, room },
      })
    );
  });
  socket.addEventListener('message', handleOnlineMessage);
  socket.addEventListener('close', () => {
    logEvent('Соединение закрыто.');
    setHint('Соединение потеряно.');
    state.running = false;
    elements.btnAdvance.disabled = true;
  });
}

function resetState(layout) {
  if (layout?.map) {
    setMap(layout.map, layout.destinations);
  } else if (!state.map.nodes.length) {
    setMap(generateCityMap());
  }
  state.running = false;
  state.players = [];
  state.vehicles = [];
  state.selectedVehicleId = null;
  state.turn = 0;
  state.turnLimit = TURN_LIMIT;
  state.log = [];
  state.hint = '';
  state.localPlayerId = null;
  state.online = null;
  state.activePlayer = null;
  state.showNodes = !!state.preferences.showNodes;
  state.roomCode = null;
  state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
  const stopAmount = Number(elements.stopAmount?.value) || 1;
  state.stopDrag = { active: false, vehicleId: null, amount: stopAmount, hoverNode: null };
  elements.log.innerHTML = '';
  elements.btnToggleNodes.textContent = state.showNodes ? 'Скрыть узлы' : 'Показать узлы';
  elements.stopHandle.disabled = true;
  updateHint();
}

function pickStartingPairs(playerCount) {
  const graph = state.graph;
  const eligible = state.map.nodes.filter((node) => (graph.get(node.id)?.neighbors.size || 0) >= 2);
  const pool = eligible.length >= playerCount * 2 ? eligible : state.map.nodes;
  const picks = shuffle(pool);
  const pairs = [];
  let index = 0;
  for (let i = 0; i < playerCount; i += 1) {
    const first = picks[index % picks.length];
    index += 1;
    let second = picks[index % picks.length];
    index += 1;
    if (!second || second.id === first.id) {
      second = pool.find((node) => node.id !== first.id) || first;
    }
    pairs.push([first.id, second.id]);
  }
  return pairs;
}

function assignVehicles() {
  state.vehicles = [];
  const pairs = pickStartingPairs(state.players.length);
  state.players.forEach((player, idx) => {
    const pair = pairs[idx] || [];
    pair.forEach((startNode, vehicleIdx) => {
      const vehicle = createVehicle(player, vehicleIdx, startNode);
      state.vehicles.push(vehicle);
    });
  });
}

function autoPlanForAI() {
  for (const vehicle of state.vehicles) {
    const owner = state.players.find((p) => p.id === vehicle.ownerId);
    if (owner?.type === 'ai') {
      planShortestRoute(vehicle);
    }
  }
}

function planShortestRoute(vehicle) {
  const path = shortestPath(vehicle.current, vehicle.goal);
  if (path && path.length > 1) {
    vehicle.route = path.slice(1);
    vehicle.history = path.slice();
  }
}

function setHint(text) {
  const message = text && text.length ? text : defaultHint();
  state.hint = message;
  updateHint();
}

function defaultHint() {
  if (!state.running) return 'Выберите режим, чтобы начать новую партию.';
  if (state.mode === 'solo') return 'Зажмите машину и протяните маршрут по узлам до цели.';
  if (state.mode === 'local') return 'Игроки ведут линии от своих машин и перетаскивают стопы на узлы.';
  if (state.mode === 'online') return 'Планируйте маршрут машин и ждите свой ход — сервер irgri.uk синхронизирует партии.';
  return '';
}

function updateHint() {
  elements.hint.textContent = state.hint;
}

function updateTurnLabel() {
  elements.turnLabel.textContent = `${state.turn} / ${state.turnLimit}`;
}

function logEvent(text) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = text;
  elements.log.prepend(entry);
  while (elements.log.children.length > 40) {
    elements.log.removeChild(elements.log.lastChild);
  }
}

function updateUI() {
  updateTurnLabel();
  renderVehicleList();
  renderScores();
  updateHint();
  updateActionButtons();
  updateActivePlayerLabel();
}

function updateActivePlayerLabel() {
  let text = 'Режим ожидания';
  if (!state.running) {
    elements.activePlayerLabel.textContent = text;
    return;
  }
  if (state.mode === 'solo') {
    text = 'Вы против автопилота';
  } else if (state.mode === 'local') {
    const count = state.players.length;
    const suffix = count === 1 ? 'игрок' : count >= 2 && count <= 4 ? 'игрока' : 'игроков';
    text = `Играют ${count} ${suffix}`;
  } else if (state.mode === 'online') {
    if (state.activePlayer) {
      const player = state.players.find((p) => p.id === state.activePlayer);
      text = player ? `Ходит: ${player.name}` : 'Ожидание хода';
    } else {
      text = 'Ожидаем игроков';
    }
  }
  elements.activePlayerLabel.textContent = text;
}

function renderScores() {
  const container = elements.scorePlayers;
  container.innerHTML = '';
  state.players.forEach((player) => {
    const card = document.createElement('div');
    card.className = 'score';
    card.style.borderTop = `4px solid ${player.color}`;
    card.innerHTML = `
      <span class="label">${player.name}</span>
      <strong>${player.deliveries} доставок</strong>
      <span class="cash">${player.score} очков</span>
    `;
    container.appendChild(card);
  });
}

function renderVehicleList() {
  elements.vehicleList.innerHTML = '';
  const localPlayers = new Set();
  if (state.mode === 'solo') {
    localPlayers.add(state.localPlayerId);
  } else if (state.mode === 'local') {
    state.players.forEach((p) => localPlayers.add(p.id));
  } else if (state.mode === 'online' && state.localPlayerId) {
    localPlayers.add(state.localPlayerId);
  }

  for (const vehicle of state.vehicles) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'vehicle-card';
    if (vehicle.id === state.selectedVehicleId) {
      card.classList.add('active');
    }
    const owner = state.players.find((p) => p.id === vehicle.ownerId);
    const avatar = document.createElement('div');
    avatar.className = 'vehicle-avatar';
    avatar.style.background = owner?.color || '#ccc';
    avatar.textContent = VEHICLE_EMOJIS[(vehicle.order - 1) % VEHICLE_EMOJIS.length] || vehicle.order;
    const info = document.createElement('div');
    info.className = 'vehicle-info';
    info.innerHTML = `
      <strong>${owner?.name || 'Игрок'} — №${vehicle.order}</strong>
      <span>Точка: ${vehicle.goalInfo?.label || vehicle.goal}</span>
    `;
    const status = document.createElement('div');
    status.className = 'vehicle-status';
    const stops = vehicle.stopOrders || {};
    let statusText = 'Ожидает';
    if (vehicle.waiting > 0) {
      statusText = `Стоит ${vehicle.waiting}`;
    } else if (stops[vehicle.current]) {
      statusText = `Стоп ${stops[vehicle.current]} ход(ов)`;
    } else if (Object.keys(stops).length) {
      const [nextNode, amount] = Object.entries(stops)[0];
      statusText = `Стоп ${amount} на ${nextNode}`;
    } else if (vehicle.route.length) {
      statusText = `${vehicle.route.length} узлов`;
    }
    status.textContent = statusText;
    card.append(avatar, info, status);
    const selectable = owner?.type !== 'ai' || state.mode !== 'solo';
    card.disabled = !localPlayers.has(vehicle.ownerId) || !selectable;
    card.addEventListener('click', () => {
      state.selectedVehicleId = vehicle.id;
      updateActionButtons();
      renderVehicleList();
      highlightVehicle(vehicle);
    });
    elements.vehicleList.appendChild(card);
  }
}

function selectDefaultVehicle(ownerId) {
  if (!ownerId) return;
  const candidate = state.vehicles.find((v) => v.ownerId === ownerId);
  if (candidate) {
    state.selectedVehicleId = candidate.id;
  }
}

function highlightVehicle(vehicle) {
  const target = vehicle.goalInfo?.label || vehicle.goal;
  setHint(`Машина №${vehicle.order}. Цель: ${target}.`);
}

function updateActionButtons() {
  const vehicle = getSelectedVehicle();
  const canControl = vehicle && canControlVehicle(vehicle);
  elements.stopHandle.disabled = !canControl;
}

function canControlVehicle(vehicle) {
  if (!vehicle) return false;
  const owner = state.players.find((p) => p.id === vehicle.ownerId);
  if (!owner) return false;
  if (state.mode === 'solo') {
    return owner.type === 'human';
  }
  if (state.mode === 'local') {
    return true;
  }
  if (state.mode === 'online') {
    return owner.id === state.localPlayerId;
  }
  return false;
}

function getSelectedVehicle() {
  return state.vehicles.find((v) => v.id === state.selectedVehicleId) || null;
}

function advanceTurn() {
  if (state.mode === 'online') {
    const kind = state.running ? 'advance' : 'start';
    sendOnlineUpdate({ type: kind });
    elements.btnAdvance.disabled = true;
    return;
  }
  if (!state.running) return;
  state.turn += 1;
  for (const vehicle of state.vehicles) {
    processVehicleTurn(vehicle);
  }
  if (state.mode === 'solo') {
    autoPlanForAI();
  }
  logEndOfTurn();
  updateUI();
  checkEndGame();
}

elements.btnAdvance.addEventListener('click', advanceTurn);

elements.btnToggleNodes.addEventListener('click', () => {
  state.showNodes = !state.showNodes;
  elements.btnToggleNodes.textContent = state.showNodes ? 'Скрыть узлы' : 'Показать узлы';
});

elements.stopAmount.addEventListener('input', () => {
  elements.stopAmountLabel.textContent = elements.stopAmount.value;
  state.stopDrag.amount = Number(elements.stopAmount.value) || 1;
});

loadPreferences();
setupModeSelection();
setupCanvasInteractions();
setupStopDrag();
if (typeof ResizeObserver !== 'undefined' && elements.board) {
  const observer = new ResizeObserver(() => resizeCanvas());
  observer.observe(elements.board);
} else {
  window.addEventListener('resize', resizeCanvas);
}
window.addEventListener('orientationchange', () => {
  window.setTimeout(resizeCanvas, 120);
});
resizeCanvas();
renderLoop();
updateUI();

function setupStopDrag() {
  elements.stopHandle.addEventListener('dragstart', handleStopDragStart);
  elements.stopHandle.addEventListener('dragend', handleStopDragEnd);
  elements.canvas.addEventListener('dragover', handleCanvasDragOver);
  elements.canvas.addEventListener('dragleave', handleCanvasDragLeave);
  elements.canvas.addEventListener('drop', handleCanvasDrop);
}

function handleStopDragStart(event) {
  const vehicle = getSelectedVehicle();
  if (!vehicle || !canControlVehicle(vehicle)) {
    event.preventDefault();
    return;
  }
  const amount = Number(elements.stopAmount.value) || 1;
  state.stopDrag = { active: true, vehicleId: vehicle.id, amount, hoverNode: null };
  event.dataTransfer.setData('text/plain', 'stop');
  event.dataTransfer.effectAllowed = 'copy';
  setHint(`Перетащите стоп на узел для ${vehicle.label}.`);
}

function handleStopDragEnd() {
  state.stopDrag.hoverNode = null;
  state.stopDrag.active = false;
  state.stopDrag.vehicleId = null;
  state.stopDrag.amount = Number(elements.stopAmount.value) || 1;
  updateHint();
}

function handleCanvasDragOver(event) {
  if (!state.stopDrag.active) return;
  event.preventDefault();
  const { x, y } = getCanvasCoordinates(event);
  const nearest = findNearestNode(x, y, 40);
  state.stopDrag.hoverNode = nearest ? nearest.id : null;
  if (nearest) {
    event.dataTransfer.dropEffect = 'copy';
    setHint(`Стоп на узле ${nearest.id}. Отпустите, чтобы применить.`);
  } else {
    setHint('Перетащите жетон на узел дороги.');
  }
}

function handleCanvasDragLeave() {
  if (!state.stopDrag.active) return;
  state.stopDrag.hoverNode = null;
  updateHint();
}

function handleCanvasDrop(event) {
  if (!state.stopDrag.active) return;
  event.preventDefault();
  const { hoverNode, vehicleId, amount } = state.stopDrag;
  const vehicle = state.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle || !canControlVehicle(vehicle)) {
    handleStopDragEnd();
    return;
  }
  let nodeId = hoverNode;
  if (!nodeId) {
    const { x, y } = getCanvasCoordinates(event);
    const nearest = findNearestNode(x, y, 40);
    nodeId = nearest?.id || null;
  }
  if (!nodeId) {
    setHint('Стоп можно ставить только на узлах.');
    handleStopDragEnd();
    return;
  }
  applyStopOrder(vehicle, nodeId, amount);
  handleStopDragEnd();
}

function setupCanvasInteractions() {
  elements.canvas.addEventListener('pointerdown', handleCanvasPointerDown);
  elements.canvas.addEventListener('pointermove', handleCanvasPointerMove);
  elements.canvas.addEventListener('pointerup', handleCanvasPointerUp);
  elements.canvas.addEventListener('pointerleave', handleCanvasPointerLeave);
}

function handleCanvasPointerDown(event) {
  const coords = getCanvasCoordinates(event);
  const vehicle = hitVehicle(coords.x, coords.y);
  if (vehicle && canControlVehicle(vehicle)) {
    if (state.selectedVehicleId !== vehicle.id) {
      state.selectedVehicleId = vehicle.id;
      renderVehicleList();
      updateActionButtons();
    }
    highlightVehicle(vehicle);
    startRouteDrag(event.pointerId, vehicle);
    elements.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const nearest = findNearestNode(coords.x, coords.y, 28);
  if (nearest) {
    selectVehicleFromMap(nearest.id);
  }
}

function handleCanvasPointerMove(event) {
  if (!state.interaction.active || state.interaction.pointerId !== event.pointerId) return;
  const coords = getCanvasCoordinates(event);
  updateRouteDrag(coords.x, coords.y);
}

function handleCanvasPointerUp(event) {
  if (!state.interaction.active || state.interaction.pointerId !== event.pointerId) return;
  finishRouteDrag();
  if (elements.canvas.hasPointerCapture(event.pointerId)) {
    elements.canvas.releasePointerCapture(event.pointerId);
  }
}

function handleCanvasPointerLeave(event) {
  if (!state.interaction.active || state.interaction.pointerId !== event.pointerId) return;
  const coords = getCanvasCoordinates(event);
  updateRouteDrag(coords.x, coords.y);
}

function getCanvasCoordinates(event) {
  const rect = elements.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }
  const mapWidth = state.map?.width || MAP_BOUNDS.width;
  const mapHeight = state.map?.height || MAP_BOUNDS.height;
  const scaleX = mapWidth / rect.width;
  const scaleY = mapHeight / rect.height;
  const clientX = event.clientX ?? 0;
  const clientY = event.clientY ?? 0;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function hitVehicle(x, y) {
  const radius = 40;
  return state.vehicles.find((vehicle) => {
    const node = nodeById(vehicle.current);
    return distance({ x, y }, node) <= radius;
  }) || null;
}

function startRouteDrag(pointerId, vehicle) {
  state.interaction = { active: true, type: 'route', vehicleId: vehicle.id, path: [vehicle.current], hoverNode: null, pointerId };
  setHint(`Ведите маршрут до цели ${vehicle.goal}.`);
}

function updateRouteDrag(x, y) {
  if (!state.interaction.active || state.interaction.type !== 'route') return;
  const vehicle = state.vehicles.find((v) => v.id === state.interaction.vehicleId);
  if (!vehicle) return;
  const nearest = findNearestNode(x, y, 42);
  state.interaction.hoverNode = nearest ? nearest.id : null;
  if (!nearest) return;
  const graph = state.graph;
  if (!graph?.size) return;
  const path = state.interaction.path;
  const last = path[path.length - 1];
  if (nearest.id === last) return;
  if (!graph.get(last)?.neighbors.has(nearest.id)) return;
  if (path.length >= 2 && nearest.id === path[path.length - 2]) {
    path.pop();
    setHint('Шаг назад по маршруту.');
    return;
  }
  if (path.includes(nearest.id) && nearest.id !== vehicle.goal) {
    setHint('Нельзя зациклить маршрут, кроме цели.');
    return;
  }
  path.push(nearest.id);
  if (nearest.id === vehicle.goal) {
    setHint('Отпустите, чтобы подтвердить маршрут.');
  } else {
    setHint(`Продолжайте к цели ${vehicle.goal}.`);
  }
}

function finishRouteDrag() {
  if (!state.interaction.active || state.interaction.type !== 'route') {
    state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
    return;
  }
  const vehicle = state.vehicles.find((v) => v.id === state.interaction.vehicleId);
  if (!vehicle) {
    state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
    return;
  }
  const path = state.interaction.path;
  const goalReached = path[path.length - 1] === vehicle.goal;
  if (path.length > 1 && goalReached) {
    commitRoute(vehicle, path);
  } else {
    setHint(`Маршрут не завершён. Дотяните до цели ${vehicle.goal}.`);
  }
  state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
}

function commitRoute(vehicle, path, remote = false) {
  if (state.mode === 'online' && !remote) {
    sendOnlineUpdate({ type: 'setRoute', vehicle: vehicle.id, path });
    setHint('Маршрут отправлен на сервер.');
    return;
  }
  vehicle.route = path.slice(1);
  vehicle.history = path.slice();
  vehicle.waiting = 0;
  logEvent(`${vehicle.label} меняет маршрут: ${path.join(' → ')}.`);
  updateUI();
}

function applyStopOrder(vehicle, nodeId, amount, remote = false) {
  if (state.mode === 'online' && !remote) {
    sendOnlineUpdate({ type: 'stop', vehicle: vehicle.id, node: nodeId, amount });
    setHint('Стоп отправлен на сервер.');
    return;
  }
  if (!vehicle.stopOrders) vehicle.stopOrders = {};
  vehicle.stopOrders[nodeId] = amount;
  logEvent(`${vehicle.label} поставит стоп на узле ${nodeId} (${amount} ход(ов)).`);
  updateUI();
}

function processVehicleTurn(vehicle) {
  if (vehicle.waiting > 0) {
    vehicle.waiting -= 1;
    logEvent(`${vehicle.label} ожидает на узле ${vehicle.current}.`);
    return;
  }
  const plannedStop = vehicle.stopOrders ? vehicle.stopOrders[vehicle.current] : undefined;
  if (plannedStop) {
    vehicle.waiting = plannedStop - 1;
    delete vehicle.stopOrders[vehicle.current];
    logEvent(`${vehicle.label} держит стоп на узле ${vehicle.current} (${plannedStop} ход(ов)).`);
    return;
  }
  if (!vehicle.route.length) {
    logEvent(`${vehicle.label} ждёт новый маршрут.`);
    return;
  }
  const next = vehicle.route.shift();
  vehicle.current = next;
  vehicle.stepsTaken += 1;
  logEvent(`${vehicle.label} движется к узлу ${next}.`);
  if (vehicle.current === vehicle.goal) {
    handleArrival(vehicle);
  }
}

function handleArrival(vehicle) {
  const owner = state.players.find((p) => p.id === vehicle.ownerId);
  if (!owner) return;
  owner.deliveries += 1;
  const gained = Math.max(10, 40 - vehicle.stepsTaken * 2);
  owner.score += gained;
  logEvent(`${vehicle.label} достиг цели ${vehicle.goalInfo?.label || vehicle.goal} и заработал ${gained} очков!`);
  vehicle.stepsTaken = 0;
  vehicle.stopOrders = {};
  vehicle.waiting = 0;
  const nextDest = randomDestination(vehicle.goal);
  vehicle.goal = nextDest.node;
  vehicle.goalInfo = nextDest;
  vehicle.route = [];
  vehicle.history = [];
  if (owner.type === 'ai' && state.mode === 'solo') {
    planShortestRoute(vehicle);
  } else if (state.mode === 'online') {
    sendOnlineUpdate({ type: 'routeComplete', vehicle: vehicle.id, score: owner.score, deliveries: owner.deliveries });
  }
}

function renderLoop() {
  drawScene();
  requestAnimationFrame(renderLoop);
}

function drawScene() {
  const pixelScale = view.pixelScale || window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  const mapWidth = state.map?.width || MAP_BOUNDS.width;
  const mapHeight = state.map?.height || MAP_BOUNDS.height;
  ctx.clearRect(0, 0, mapWidth, mapHeight);
  drawBackground();
  drawRoads();
  drawDestinations();
  drawStopOrders();
  drawVehicleRoutes();
  drawInteractionPreview();
  drawVehicles();
  if (state.showNodes || !state.running || !state.mode) {
    drawNodes();
  }
  ctx.restore();
}

function drawBackground() {
  ctx.save();
  const mapWidth = state.map?.width || MAP_BOUNDS.width;
  const mapHeight = state.map?.height || MAP_BOUNDS.height;
  const gradient = ctx.createLinearGradient(0, 0, 0, mapHeight);
  gradient.addColorStop(0, '#f7fbff');
  gradient.addColorStop(1, '#e3f2ff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, mapWidth, mapHeight);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.moveTo(mapWidth * 0.05, mapHeight * 0.15);
  ctx.bezierCurveTo(mapWidth * 0.35, mapHeight * -0.05, mapWidth * 0.65, mapHeight * 0.1, mapWidth * 0.92, mapHeight * 0.2);
  ctx.lineTo(mapWidth * 0.92, mapHeight * 0.85);
  ctx.bezierCurveTo(mapWidth * 0.6, mapHeight * 0.95, mapWidth * 0.25, mapHeight * 0.9, mapWidth * 0.08, mapHeight * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoads() {
  ctx.save();
  const roadWidth = 38;
  for (const [a, b] of state.map.edges || []) {
    const na = nodeById(a);
    const nb = nodeById(b);
    if (!na || !nb) continue;
    const angle = Math.atan2(nb.y - na.y, nb.x - na.x);
    const length = distance(na, nb);
    ctx.save();
    ctx.translate(na.x, na.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#1f2a37';
    ctx.beginPath();
    ctx.roundRect(0, -roadWidth / 2 - 3, length, roadWidth + 6, roadWidth / 2);
    ctx.fill();
    ctx.fillStyle = '#2e3a48';
    ctx.beginPath();
    ctx.roundRect(0, -roadWidth / 2, length, roadWidth, roadWidth / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const dash = 28;
    const gap = 18;
    const stripeWidth = 4;
    for (let offset = 12; offset < length - dash; offset += dash + gap) {
      const segment = Math.min(dash, length - offset - gap * 0.5);
      if (segment <= 0) break;
      ctx.fillRect(offset, -stripeWidth / 2, segment, stripeWidth);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawDestinations() {
  for (const dest of state.destinations) {
    const node = nodeById(dest.node);
    if (!node) continue;
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = dest.color;
    ctx.strokeStyle = 'rgba(38, 68, 86, 0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-24, -24, 48, 48, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '22px Nunito';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dest.icon, 0, 2);
    ctx.restore();
  }
}

function drawVehicleRoutes() {
  ctx.save();
  ctx.lineCap = 'round';
  for (const vehicle of state.vehicles) {
    const owner = state.players.find((p) => p.id === vehicle.ownerId);
    if (!owner) continue;
    const basePath = Array.isArray(vehicle.history) && vehicle.history.length
      ? vehicle.history
      : [vehicle.current, ...vehicle.route];
    if (basePath.length < 2) continue;
    const first = nodeById(basePath[0]);
    if (!first) continue;
    ctx.strokeStyle = `${owner.color}cc`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < basePath.length; i += 1) {
      const node = nodeById(basePath[i]);
      if (!node) continue;
      ctx.lineTo(node.x, node.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawStopOrders() {
  ctx.save();
  for (const vehicle of state.vehicles) {
    const owner = state.players.find((p) => p.id === vehicle.ownerId);
    if (!owner) continue;
    const stops = vehicle.stopOrders ? Object.entries(vehicle.stopOrders) : [];
    for (const [nodeId, amount] of stops) {
      const node = nodeById(nodeId);
      if (!node) continue;
      ctx.fillStyle = `${owner.color}40`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `${owner.color}80`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Nunito';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${amount}`, node.x, node.y);
    }
  }
  if (state.stopDrag.active && state.stopDrag.hoverNode) {
    const node = nodeById(state.stopDrag.hoverNode);
    if (node) {
      ctx.strokeStyle = 'rgba(34, 66, 90, 0.35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

function drawInteractionPreview() {
  if (!state.interaction.active || state.interaction.type !== 'route') return;
  const vehicle = state.vehicles.find((v) => v.id === state.interaction.vehicleId);
  if (!vehicle) return;
  const owner = state.players.find((p) => p.id === vehicle.ownerId);
  const path = state.interaction.path;
  if (!path || path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = `${owner?.color || '#264456'}aa`;
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const start = nodeById(path[0]);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < path.length; i += 1) {
    const node = nodeById(path[i]);
    ctx.lineTo(node.x, node.y);
  }
  ctx.stroke();
  if (state.interaction.hoverNode) {
    const hover = nodeById(state.interaction.hoverNode);
    if (hover) {
      ctx.fillStyle = `${owner?.color || '#264456'}55`;
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawVehicles() {
  for (const vehicle of state.vehicles) {
    const node = nodeById(vehicle.current);
    if (!node) continue;
    let angle = 0;
    if (vehicle.route?.length) {
      const next = nodeById(vehicle.route[0]);
      if (next) angle = Math.atan2(next.y - node.y, next.x - node.x);
    } else if (vehicle.history?.length >= 2) {
      const prev = nodeById(vehicle.history[vehicle.history.length - 2]);
      if (prev) angle = Math.atan2(node.y - prev.y, node.x - prev.x);
    }
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = 12;
    const baseColor = vehicle.color || '#3b82f6';
    const darker = darkenColor(baseColor, 0.35);
    const roof = lightenColor(baseColor, 0.25);
    const bodyLength = 56;
    const bodyWidth = 28;
    const wheelWidth = 8;
    const wheelHeight = bodyWidth + 8;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.fillRect(-bodyLength / 2 + 6, -wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(bodyLength / 2 - wheelWidth - 6, -wheelHeight / 2, wheelWidth, wheelHeight);

    ctx.fillStyle = darker;
    ctx.beginPath();
    ctx.roundRect(-bodyLength / 2, -bodyWidth / 2 - 3, bodyLength, bodyWidth + 6, bodyWidth / 2.1);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, bodyWidth / 2.4);
    ctx.fill();

    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.roundRect(-bodyLength / 2 + 8, -bodyWidth / 2 + 5, bodyLength - 16, bodyWidth - 10, bodyWidth / 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const windowLength = (bodyLength - 24) / 2 - 4;
    ctx.beginPath();
    ctx.roundRect(-bodyLength / 2 + 10, -bodyWidth / 2 + 6, windowLength, bodyWidth - 12, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-bodyLength / 2 + 14 + windowLength, -bodyWidth / 2 + 6, windowLength, bodyWidth - 12, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 251, 235, 0.9)';
    ctx.fillRect(bodyLength / 2 - 6, -6, 4, 6);
    ctx.fillRect(bodyLength / 2 - 6, 0, 4, 6);

    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.font = 'bold 16px Nunito';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(vehicle.order), -bodyLength / 2 + 14, 0);

    if (vehicle.id === state.selectedVehicleId) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-bodyLength / 2 - 6, -bodyWidth / 2 - 6, bodyLength + 12, bodyWidth + 12, bodyWidth / 2.2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawNodes() {
  ctx.save();
  ctx.fillStyle = 'rgba(38, 68, 86, 0.7)';
  ctx.font = '14px Nunito';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const node of state.map.nodes) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = 'rgba(38, 68, 86, 0.3)';
    ctx.lineWidth = 2;
    ctx.arc(node.x, node.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(38, 68, 86, 0.75)';
    ctx.fillText(node.id, node.x, node.y - 16);
  }
  ctx.restore();
}

function logEndOfTurn() {
  logEvent(`Ход ${state.turn} завершён.`);
}

function checkEndGame() {
  if (state.turn < state.turnLimit) return;
  state.running = false;
  elements.btnAdvance.disabled = true;
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const message = winner
    ? `Партия завершена. Победитель: ${winner.name} (${winner.score} очков).`
    : 'Партия завершена.';
  logEvent(message);
  setHint(message);
  renderModeOverlay(message);
}

function setupModeSelection() {
  const modeCards = Array.from(document.querySelectorAll('.mode-card'));
  const details = elements.modeDetails;
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const localState = {
    count: 2,
    names: [
      state.preferences.playerName || 'Игрок 1',
      'Игрок 2',
      'Игрок 3',
      'Игрок 4',
    ],
  };
  let selectedMode = null;

  const playerCountText = (count) => {
    if (count === 1) return '1 игрок';
    if (count >= 2 && count <= 4) return `${count} игрока`;
    return `${count} игроков`;
  };

  const setCardSelection = (mode) => {
    modeCards.forEach((card) => {
      const active = card.dataset.mode === mode;
      card.classList.toggle('selected', active);
      card.setAttribute('aria-selected', String(active));
    });
  };

  const ensureStartState = () => {
    if (!selectedMode) {
      elements.btnStart.disabled = true;
      return;
    }
    if (selectedMode === 'local') {
      const ready = localState.names
        .slice(0, localState.count)
        .every((name, index) => {
          const trimmed = (name || '').trim();
          if (!trimmed.length) return false;
          localState.names[index] = name;
          return true;
        });
      elements.btnStart.disabled = !ready;
      return;
    }
    if (selectedMode === 'online') {
      const hasName = (state.preferences.playerName || '').trim().length > 0;
      elements.btnStart.disabled = !hasName;
      return;
    }
    elements.btnStart.disabled = false;
  };

  const renderSoloDetails = () => {
    if (!details) return;
    details.innerHTML = '';
    const intro = document.createElement('p');
    intro.textContent = 'Сразитесь с автопилотом. Ваша цель — быстрее доставить пассажиров по скрытым узлам.';
    const tip = document.createElement('p');
    tip.textContent = 'Совет: протяните маршрут прямо от машин и используйте стопы, чтобы задерживать соперника.';
    details.append(intro, tip);
  };

  const renderLocalDetails = () => {
    if (!details) return;
    details.innerHTML = '';
    const info = document.createElement('p');
    info.textContent = 'Настройте количество игроков (2–4) и впишите имена, чтобы различать маршруты.';
    const sliderField = document.createElement('div');
    sliderField.className = 'field';
    const sliderLabel = document.createElement('span');
    sliderLabel.textContent = 'Количество игроков';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '2';
    slider.max = '4';
    slider.step = '1';
    slider.value = String(localState.count);
    const sliderValue = document.createElement('output');
    sliderValue.textContent = playerCountText(localState.count);
    slider.addEventListener('input', () => {
      localState.count = Number(slider.value);
      sliderValue.textContent = playerCountText(localState.count);
      if (!localState.names[localState.count - 1]) {
        localState.names[localState.count - 1] = `Игрок ${localState.count}`;
      }
      renderLocalDetails();
      ensureStartState();
    });
    sliderField.append(sliderLabel, slider, sliderValue);

    const names = document.createElement('div');
    names.className = 'names';
    for (let i = 0; i < localState.count; i += 1) {
      if (!localState.names[i] || !localState.names[i].trim().length) {
        localState.names[i] = `Игрок ${i + 1}`;
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.value = localState.names[i];
      input.placeholder = `Игрок ${i + 1}`;
      input.addEventListener('input', () => {
        localState.names[i] = input.value;
        ensureStartState();
      });
      names.appendChild(input);
    }

    details.append(info, sliderField, names);
  };

  const renderOnlineDetails = () => {
    if (!details) return;
    details.innerHTML = '';
    const summary = document.createElement('p');
    summary.textContent = 'Мы подключим вас к серверу irgri.uk и автоматически подберём свободную комнату.';
    const nameInfo = document.createElement('p');
    const currentName = (state.preferences.playerName || '').trim() || 'Диспетчер';
    nameInfo.innerHTML = `Ваше имя в лобби: <strong>${currentName}</strong>. Измените его в настройках слева.`;
    const tip = document.createElement('p');
    tip.textContent = 'После подключения дождитесь второго игрока и нажмите «Следующий ход», чтобы начать партию.';
    details.append(summary, nameInfo, tip);
  };

  const renderDetails = () => {
    if (!details) return;
    if (!selectedMode) {
      details.innerHTML = '';
      const placeholder = document.createElement('p');
      placeholder.textContent = 'Выберите режим, чтобы увидеть настройки матча.';
      details.appendChild(placeholder);
      elements.btnStart.textContent = 'Начать игру';
      elements.btnStart.disabled = true;
      return;
    }
    if (selectedMode === 'solo') {
      renderSoloDetails();
    } else if (selectedMode === 'local') {
      renderLocalDetails();
    } else if (selectedMode === 'online') {
      renderOnlineDetails();
    }
    elements.btnStart.textContent = selectedMode === 'online' ? 'Подключиться' : 'Начать игру';
    ensureStartState();
  };

  function selectMode(mode) {
    selectedMode = mode;
    setCardSelection(mode);
    renderDetails();
  }

  modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      selectMode(card.dataset.mode);
    });
  });

  if (elements.prefShowNodes) {
    elements.prefShowNodes.addEventListener('change', () => {
      state.preferences.showNodes = elements.prefShowNodes.checked;
      try {
        storage?.setItem('trafficity.showNodes', String(state.preferences.showNodes));
      } catch (err) {
        /* ignore */
      }
    });
  }

  if (elements.prefPlayerName) {
    elements.prefPlayerName.addEventListener('input', () => {
      const raw = elements.prefPlayerName.value;
      const trimmed = raw.trim();
      state.preferences.playerName = trimmed;
      if (!localState.names[0] || localState.names[0].startsWith('Игрок ')) {
        localState.names[0] = trimmed || 'Игрок 1';
      }
      try {
        storage?.setItem('trafficity.playerName', trimmed);
      } catch (err) {
        /* ignore */
      }
      if (selectedMode === 'online') {
        renderDetails();
      } else {
        ensureStartState();
      }
    });
  }

  elements.btnStart.addEventListener('click', () => {
    if (!selectedMode) return;
    elements.modeScreen.classList.add('hidden');
    elements.modeScreen.classList.remove('visible');
    if (selectedMode === 'solo') {
      startSoloGame();
    } else if (selectedMode === 'local') {
      const preparedNames = localState.names
        .slice(0, localState.count)
        .map((name, index) => {
          const trimmed = (name || '').trim();
          return trimmed.length ? trimmed : `Игрок ${index + 1}`;
        });
      startLocalGame(preparedNames);
    } else if (selectedMode === 'online') {
      const name = (state.preferences.playerName || '').trim() || 'Игрок';
      startOnlineGame({ name, action: 'auto' });
    }
  });

  selectMode('solo');
}
function setupOnlineGame(payload) {
  if (payload.map) {
    setMap(payload.map, payload.destinations);
  }
  state.running = true;
  state.turnLimit = payload.turnLimit || TURN_LIMIT;
  state.turn = payload.turn || 0;
  state.players = payload.players;
  state.localPlayerId = payload.you;
  state.vehicles = payload.vehicles;
  state.activePlayer = payload.active || null;
  elements.btnAdvance.disabled = payload.active !== payload.you;
  state.selectedVehicleId = null;
  state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
  state.stopDrag = { active: false, vehicleId: null, amount: Number(elements.stopAmount.value) || 1, hoverNode: null };
  selectDefaultVehicle(state.localPlayerId);
  setHint(payload.message || 'Подождите свой ход.');
  updateUI();
}

function handleOnlineMessage(event) {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'lobby':
      if (data.payload.you) state.localPlayerId = data.payload.you;
      if (Array.isArray(data.payload.players)) state.players = data.payload.players;
      if (data.payload.code) state.roomCode = data.payload.code;
      state.activePlayer = data.payload.host || null;
      state.running = false;
      setHint(data.payload.message);
      elements.btnAdvance.disabled = !(data.payload.ready && data.payload.host === state.localPlayerId);
      if (data.payload.message) logEvent(data.payload.message);
      updateUI();
      break;
    case 'start':
      setupOnlineGame(data.payload);
      elements.modeScreen.classList.add('hidden');
      elements.modeScreen.classList.remove('visible');
      break;
    case 'state':
      if (data.payload.map) {
        setMap(data.payload.map, data.payload.destinations);
      } else if (Array.isArray(data.payload.destinations) && data.payload.destinations.length) {
        state.destinations = data.payload.destinations.map((point) => ({ ...point }));
      }
      state.turn = data.payload.turn;
      state.players = data.payload.players;
      state.vehicles = data.payload.vehicles;
      state.activePlayer = data.payload.active || null;
      state.turnLimit = data.payload.turnLimit || state.turnLimit;
      state.running = true;
      state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
      state.stopDrag = { active: false, vehicleId: null, amount: Number(elements.stopAmount.value) || 1, hoverNode: null };
      elements.btnAdvance.disabled = data.payload.active !== state.localPlayerId;
      setHint(data.payload.message);
      if (data.payload.message) logEvent(data.payload.message);
      updateUI();
      break;
    case 'error':
      logEvent(`Ошибка: ${data.payload}`);
      break;
  }
}

function sendOnlineUpdate(payload) {
  if (!state.online?.socket || state.online.socket.readyState !== WebSocket.OPEN) return;
  state.online.socket.send(JSON.stringify({ type: 'update', payload }));
}

function renderModeOverlay(message) {
  if (!state.running) {
    elements.modeScreen.classList.remove('hidden');
    elements.modeScreen.classList.add('visible');
    setHint(message);
  }
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + width, y, x + width, y + height, r);
    this.arcTo(x + width, y + height, x, y + height, r);
    this.arcTo(x, y + height, x, y, r);
    this.arcTo(x, y, x + width, y, r);
    this.closePath();
    return this;
  };
}
