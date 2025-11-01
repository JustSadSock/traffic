const TURN_LIMIT = 30;
const PLAYER_COLORS = ['#ff8ba7', '#70d6ff', '#ffd166', '#6ef2a5'];
const VEHICLE_EMOJIS = ['①', '②'];

const MAP = {
  width: 1200,
  height: 780,
  nodes: [
    { id: 'A', x: 150, y: 560 },
    { id: 'B', x: 210, y: 420 },
    { id: 'C', x: 250, y: 290 },
    { id: 'D', x: 360, y: 180 },
    { id: 'E', x: 520, y: 130 },
    { id: 'F', x: 690, y: 150 },
    { id: 'G', x: 840, y: 230 },
    { id: 'H', x: 910, y: 330 },
    { id: 'I', x: 950, y: 470 },
    { id: 'J', x: 860, y: 600 },
    { id: 'K', x: 700, y: 660 },
    { id: 'L', x: 520, y: 690 },
    { id: 'M', x: 360, y: 650 },
    { id: 'N', x: 250, y: 500 },
    { id: 'O', x: 500, y: 480 },
    { id: 'P', x: 660, y: 470 },
    { id: 'Q', x: 780, y: 400 },
    { id: 'R', x: 520, y: 310 },
    { id: 'C1', x: 600, y: 360 },
  ],
  edges: [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'E'],
    ['E', 'F'],
    ['F', 'G'],
    ['G', 'H'],
    ['H', 'I'],
    ['I', 'J'],
    ['J', 'K'],
    ['K', 'L'],
    ['L', 'M'],
    ['M', 'A'],
    ['B', 'N'],
    ['N', 'M'],
    ['C', 'R'],
    ['R', 'E'],
    ['R', 'O'],
    ['O', 'P'],
    ['P', 'Q'],
    ['Q', 'H'],
    ['N', 'O'],
    ['O', 'L'],
    ['P', 'K'],
    ['F', 'Q'],
    ['G', 'Q'],
    ['R', 'C1'],
    ['C1', 'O'],
    ['C1', 'P'],
    ['C1', 'Q'],
  ],
};

const DELIVERY_POINTS = [
  { node: 'E', label: 'Розовый дом', color: '#ffafcc', icon: '🏠' },
  { node: 'H', label: 'Синий офис', color: '#70d6ff', icon: '🏢' },
  { node: 'L', label: 'Жёлтая площадь', color: '#ffd166', icon: '🧁' },
  { node: 'B', label: 'Бирюзовый рынок', color: '#a0e7e5', icon: '🛍️' },
  { node: 'J', label: 'Солнечный пляж', color: '#ffe066', icon: '🏖️' },
  { node: 'C', label: 'Лавандовый парк', color: '#cdb4db', icon: '🌸' },
];

const START_SETS = [
  ['A', 'M'],
  ['H', 'J'],
  ['C', 'E'],
  ['K', 'G'],
];

const graph = buildGraph(MAP);

const elements = {
  canvas: document.getElementById('gameCanvas'),
  hint: document.getElementById('hint'),
  btnAdvance: document.getElementById('btnAdvance'),
  btnToggleNodes: document.getElementById('btnToggleNodes'),
  btnRoute: document.getElementById('btnRoute'),
  btnStop: document.getElementById('btnStop'),
  btnCancel: document.getElementById('btnCancel'),
  vehicleList: document.getElementById('vehicleList'),
  log: document.getElementById('log'),
  turnLabel: document.getElementById('turnLabel'),
  activePlayerLabel: document.getElementById('activePlayerLabel'),
  modeScreen: document.getElementById('modeScreen'),
  modeExtra: document.getElementById('modeExtra'),
  btnStart: document.getElementById('btnStart'),
  routeDialog: document.getElementById('routeDialog'),
  routePreview: document.getElementById('routePreview'),
  routeHint: document.getElementById('routeHint'),
  routeLength: document.getElementById('routeLength'),
  currentNode: document.getElementById('currentNode'),
  targetNode: document.getElementById('targetNode'),
  btnConfirmRoute: document.getElementById('btnConfirmRoute'),
  btnCloseRoute: document.getElementById('btnCloseRoute'),
  stopDialog: document.getElementById('stopDialog'),
  stopAmount: document.getElementById('stopAmount'),
  stopAmountLabel: document.getElementById('stopAmountLabel'),
  btnApplyStop: document.getElementById('btnApplyStop'),
  btnCloseStop: document.getElementById('btnCloseStop'),
  scorePlayers: document.getElementById('scorePlayers'),
};

const ctx = elements.canvas.getContext('2d');

const state = {
  running: false,
  mode: null,
  showNodes: false,
  players: [],
  vehicles: [],
  selectedVehicleId: null,
  turn: 0,
  turnLimit: TURN_LIMIT,
  log: [],
  hint: 'Выберите режим, чтобы начать игру.',
  plannedRoute: null,
  editingVehicle: null,
  localPlayerId: null,
  online: null,
  activePlayer: null,
  roomCode: null,
};

function buildGraph(map) {
  const nodes = new Map();
  for (const node of map.nodes) {
    nodes.set(node.id, { ...node, neighbors: new Set() });
  }
  for (const [a, b] of map.edges) {
    nodes.get(a).neighbors.add(b);
    nodes.get(b).neighbors.add(a);
  }
  return nodes;
}

const nodeById = (id) => graph.get(id);

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shortestPath(start, goal) {
  if (start === goal) return [start];
  const queue = [start];
  const visited = new Set([start]);
  const prev = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (current === goal) break;
    for (const next of graph.get(current).neighbors) {
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
  const candidates = DELIVERY_POINTS.filter((d) => d.node !== exclude);
  return candidates[Math.floor(Math.random() * candidates.length)];
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
  const dest = randomDestination(startNode);
  return {
    id: `${player.id}-${index + 1}`,
    label: `${player.name} ${VEHICLE_EMOJIS[index] || index + 1}`,
    ownerId: player.id,
    order: index + 1,
    color: player.color,
    current: startNode,
    goal: dest.node,
    goalInfo: dest,
    route: [],
    waiting: 0,
    pendingStop: 0,
    stepsTaken: 0,
    history: [],
  };
}

function startSoloGame() {
  resetState();
  const human = createPlayer('player', 'Вы', 'human', PLAYER_COLORS[0]);
  const ai = createPlayer('ai', 'Автопилот', 'ai', PLAYER_COLORS[1]);
  state.players = [human, ai];
  state.localPlayerId = human.id;
  state.activePlayer = human.id;
  assignVehicles();
  autoPlanForAI();
  selectDefaultVehicle(human.id);
  setHint('Выберите машину и запланируйте маршрут до цели.');
  state.mode = 'solo';
  state.running = true;
  elements.btnAdvance.disabled = false;
  updateUI();
}

function startLocalGame(names) {
  resetState();
  state.players = names.map((name, idx) =>
    createPlayer(`p${idx + 1}`, name || `Игрок ${idx + 1}`, 'human', PLAYER_COLORS[idx % PLAYER_COLORS.length])
  );
  state.localPlayerId = state.players[0].id;
  state.activePlayer = null;
  assignVehicles();
  selectDefaultVehicle(state.localPlayerId);
  setHint('Каждый игрок строит маршруты для своих машин. Соревнуйтесь за доставку!');
  state.mode = 'local';
  state.running = true;
  elements.btnAdvance.disabled = false;
  updateUI();
}

function startOnlineGame(config) {
  resetState();
  state.mode = 'online';
  const { name, action, room } = config;
  const socket = new WebSocket(`ws://${location.hostname}:3000`);
  state.online = { socket, action, roomCode: room, name };
  state.roomCode = room;
  state.activePlayer = null;
  setHint('Соединяемся с сервером...');
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

function resetState() {
  state.running = false;
  state.players = [];
  state.vehicles = [];
  state.selectedVehicleId = null;
  state.turn = 0;
  state.log = [];
  state.hint = '';
  state.plannedRoute = null;
  state.editingVehicle = null;
  state.localPlayerId = null;
  state.online = null;
  state.activePlayer = null;
  state.showNodes = false;
  state.roomCode = null;
  elements.log.innerHTML = '';
  elements.btnToggleNodes.textContent = 'Показать узлы';
  updateHint();
}

function assignVehicles() {
  state.vehicles = [];
  state.players.forEach((player, idx) => {
    const pair = START_SETS[idx % START_SETS.length];
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
  }
}

function setHint(text) {
  const message = text && text.length ? text : defaultHint();
  state.hint = message;
  updateHint();
}

function defaultHint() {
  if (!state.running) return 'Выберите режим, чтобы начать новую партию.';
  if (state.mode === 'solo') return 'Выберите свою маршрутку и постройте путь до цели.';
  if (state.mode === 'local') return 'Игроки по очереди планируют маршруты и нажимают «Следующий ход».';
  if (state.mode === 'online') return 'Ждите свою очередь и обновления лобби.';
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
    status.textContent = vehicle.waiting > 0 ? `Ждёт ${vehicle.waiting}` : vehicle.route.length ? `${vehicle.route.length} узлов` : 'Ожидает';
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
  setHint(`Маршрутка №${vehicle.order}. Цель: ${target}.`);
}

function updateActionButtons() {
  const vehicle = getSelectedVehicle();
  const canControl = vehicle && canControlVehicle(vehicle);
  elements.btnRoute.disabled = !canControl;
  elements.btnStop.disabled = !canControl;
  elements.btnCancel.disabled = !state.editingVehicle && !state.plannedRoute;
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

elements.btnRoute.addEventListener('click', () => {
  const vehicle = getSelectedVehicle();
  if (!vehicle) return;
  openRouteDialog(vehicle);
});

elements.btnStop.addEventListener('click', () => {
  const vehicle = getSelectedVehicle();
  if (!vehicle) return;
  openStopDialog(vehicle);
});

elements.btnCancel.addEventListener('click', () => {
  closeRouteDialog();
  closeStopDialog();
  state.plannedRoute = null;
  state.editingVehicle = null;
  updateActionButtons();
});

elements.btnCloseRoute.addEventListener('click', () => {
  closeRouteDialog();
});

elements.btnConfirmRoute.addEventListener('click', () => {
  if (!state.plannedRoute || !state.editingVehicle) return;
  applyRoute();
});

elements.btnCloseStop.addEventListener('click', () => {
  closeStopDialog();
});

elements.btnApplyStop.addEventListener('click', () => {
  applyStop();
});

elements.stopAmount.addEventListener('input', () => {
  elements.stopAmountLabel.textContent = elements.stopAmount.value;
});

setupModeSelection();
setupCanvasInteractions();
renderLoop();
updateUI();

function openRouteDialog(vehicle) {
  state.plannedRoute = [vehicle.current];
  state.editingVehicle = vehicle;
  elements.currentNode.textContent = vehicle.current;
  elements.targetNode.textContent = vehicle.goal;
  elements.routePreview.innerHTML = '';
  elements.routeLength.textContent = '0';
  elements.btnConfirmRoute.disabled = true;
  elements.routeDialog.classList.remove('hidden');
  setHint('Отметьте узлы на карте. Для отмены узла нажмите по нему в списке.');
}

function closeRouteDialog() {
  elements.routeDialog.classList.add('hidden');
  state.plannedRoute = null;
  state.editingVehicle = null;
  updateActionButtons();
  setHint('');
}

function openStopDialog(vehicle) {
  state.editingVehicle = vehicle;
  elements.stopAmount.value = '1';
  elements.stopAmountLabel.textContent = '1';
  elements.stopDialog.classList.remove('hidden');
  setHint(`Маршрутка №${vehicle.order}: задержка на узле.`);
}

function closeStopDialog() {
  elements.stopDialog.classList.add('hidden');
  state.editingVehicle = null;
  updateActionButtons();
}

function applyRoute() {
  const vehicle = state.editingVehicle;
  if (!vehicle) return;
  const selected = state.plannedRoute;
  if (state.mode === 'online') {
    sendOnlineUpdate({ type: 'setRoute', vehicle: vehicle.id, path: selected });
  } else {
    vehicle.route = selected.slice(1);
    vehicle.history = selected.slice();
    logEvent(`${vehicle.label} меняет маршрут: ${selected.join(' → ')}.`);
  }
  closeRouteDialog();
  updateUI();
}

function applyStop() {
  const vehicle = state.editingVehicle;
  if (!vehicle) return;
  const amount = Number(elements.stopAmount.value) || 1;
  if (state.mode === 'online') {
    sendOnlineUpdate({ type: 'stop', vehicle: vehicle.id, amount });
  } else {
    vehicle.pendingStop += amount;
    logEvent(`${vehicle.label} получит стоп на ${amount} ход(ов).`);
  }
  closeStopDialog();
}

function processVehicleTurn(vehicle) {
  if (vehicle.pendingStop > 0) {
    vehicle.waiting += vehicle.pendingStop;
    logEvent(`${vehicle.label} готовится стоять ${vehicle.pendingStop} ход(ов).`);
    vehicle.pendingStop = 0;
  }
  if (vehicle.waiting > 0) {
    vehicle.waiting -= 1;
    logEvent(`${vehicle.label} ожидает на узле ${vehicle.current}.`);
    return;
  }
  if (!vehicle.route.length) {
    logEvent(`${vehicle.label} без маршрута.`);
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

function logEndOfTurn() {
  logEvent(`— Ход ${state.turn} завершён —`);
}

function checkEndGame() {
  if (state.turn >= state.turnLimit) {
    state.running = false;
    elements.btnAdvance.disabled = true;
    const winner = [...state.players].sort((a, b) => b.score - a.score)[0];
    setHint(`Партия завершена. Победитель: ${winner.name} (${winner.score} очков).`);
    logEvent(`Игра закончена. Победил ${winner.name}.`);
    if (state.mode === 'online') {
      sendOnlineUpdate({ type: 'gameOver' });
    }
  }
}

function setupCanvasInteractions() {
  elements.canvas.addEventListener('click', (event) => {
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const nearest = findNearestNode(x, y, 32);
    if (!nearest) return;
    if (state.routeDialog.classList.contains('hidden')) {
      selectVehicleFromMap(nearest.id);
    } else {
      extendRoute(nearest.id);
    }
  });
}

function findNearestNode(x, y, radius) {
  let best = null;
  let bestDist = radius;
  for (const node of MAP.nodes) {
    const d = distance({ x, y }, node);
    if (d <= bestDist) {
      best = node;
      bestDist = d;
    }
  }
  return best;
}

function selectVehicleFromMap(nodeId) {
  const controllable = state.vehicles.filter((v) => canControlVehicle(v));
  const located = controllable.find((v) => v.current === nodeId);
  if (located) {
    state.selectedVehicleId = located.id;
    renderVehicleList();
    updateActionButtons();
    highlightVehicle(located);
  }
}

function extendRoute(nodeId) {
  if (!state.plannedRoute) return;
  const vehicle = state.editingVehicle;
  const last = state.plannedRoute[state.plannedRoute.length - 1];
  if (!graph.get(last).neighbors.has(nodeId)) {
    setHint('Между узлами нет дороги.');
    return;
  }
  if (state.plannedRoute.includes(nodeId) && nodeId !== vehicle.goal) {
    setHint('Маршрут не может зацикливаться, кроме цели.');
    return;
  }
  state.plannedRoute.push(nodeId);
  refreshRoutePreview();
  if (nodeId === vehicle.goal) {
    setHint('Маршрут готов. Нажмите «Применить».');
    elements.btnConfirmRoute.disabled = false;
  } else {
    setHint('Добавьте узлы до цели.');
  }
}

function refreshRoutePreview() {
  elements.routePreview.innerHTML = '';
  state.plannedRoute.forEach((nodeId, idx) => {
    const item = document.createElement('li');
    item.textContent = nodeId;
    item.addEventListener('click', () => {
      if (idx === 0) return;
      state.plannedRoute = state.plannedRoute.slice(0, idx + 1);
      refreshRoutePreview();
      elements.routeLength.textContent = String(state.plannedRoute.length - 1);
      elements.btnConfirmRoute.disabled = state.plannedRoute[state.plannedRoute.length - 1] !== state.editingVehicle.goal;
    });
    elements.routePreview.appendChild(item);
  });
  elements.routeLength.textContent = String(state.plannedRoute.length - 1);
}

function renderLoop() {
  drawScene();
  requestAnimationFrame(renderLoop);
}

function drawScene() {
  ctx.clearRect(0, 0, MAP.width, MAP.height);
  drawBackground();
  drawRoads();
  drawDestinations();
  drawVehicleRoutes();
  drawVehicles();
  if (state.showNodes || !state.running || !state.mode) {
    drawNodes();
  }
}

function drawBackground() {
  ctx.save();
  ctx.fillStyle = '#bde0fe';
  ctx.fillRect(0, 0, MAP.width, MAP.height);
  ctx.fillStyle = '#d9f1ff';
  ctx.beginPath();
  ctx.moveTo(60, 80);
  ctx.bezierCurveTo(400, -40, 800, 40, 1120, 120);
  ctx.lineTo(1120, 720);
  ctx.bezierCurveTo(780, 760, 300, 700, 80, 680);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRoads() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of MAP.edges) {
    const na = nodeById(a);
    const nb = nodeById(b);
    ctx.strokeStyle = 'rgba(38, 68, 86, 0.08)';
    ctx.lineWidth = 32;
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDestinations() {
  for (const dest of DELIVERY_POINTS) {
    const node = nodeById(dest.node);
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = dest.color;
    ctx.strokeStyle = 'rgba(38, 68, 86, 0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-20, -20, 40, 40, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '20px Nunito';
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
    if (!vehicle.route.length) continue;
    const owner = state.players.find((p) => p.id === vehicle.ownerId);
    if (!owner) continue;
    ctx.strokeStyle = `${owner.color}cc`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    const start = nodeById(vehicle.current);
    ctx.moveTo(start.x, start.y);
    let prev = start;
    for (const nodeId of vehicle.route) {
      const node = nodeById(nodeId);
      ctx.lineTo(node.x, node.y);
      prev = node;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawVehicles() {
  for (const vehicle of state.vehicles) {
    const node = nodeById(vehicle.current);
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = vehicle.color;
    ctx.beginPath();
    ctx.roundRect(-22, -22, 44, 44, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-8, -4, 6, 0, Math.PI * 2);
    ctx.arc(8, -4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#264456';
    ctx.beginPath();
    ctx.arc(-8, -4, 3, 0, Math.PI * 2);
    ctx.arc(8, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Nunito';
   ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(vehicle.order), 0, 16);
    if (vehicle.id === state.selectedVehicleId) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-26, -26, 52, 52, 18);
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
  for (const node of MAP.nodes) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(38, 68, 86, 0.25)';
    ctx.lineWidth = 2;
    ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(38, 68, 86, 0.75)';
    ctx.fillText(node.id, node.x, node.y - 16);
  }
  ctx.restore();
}

function setupModeSelection() {
  const modeCards = Array.from(document.querySelectorAll('.mode-card'));
  let selectedMode = null;
  let localNames = ['Игрок 1', 'Игрок 2'];
  const ensureStartState = () => {
    if (!selectedMode) {
      elements.btnStart.disabled = true;
      return;
    }
    if (selectedMode === 'local') {
      const inputs = Array.from(elements.modeExtra.querySelectorAll('input[type="text"]'));
      const ready = inputs.every((input) => input.value.trim().length > 0);
      elements.btnStart.disabled = !ready;
      if (ready) {
        localNames = inputs.map((input) => input.value.trim());
      }
      return;
    }
    if (selectedMode === 'online') {
      const nameInput = elements.modeExtra.querySelector('input[name="playerName"]');
      const roomInput = elements.modeExtra.querySelector('input[name="roomCode"]');
      const action = elements.modeExtra.querySelector('select[name="action"]');
      const ready = nameInput.value.trim().length > 0 && action.value !== 'join' ? true : roomInput.value.trim().length === 4;
      elements.btnStart.disabled = !ready;
      return;
    }
    elements.btnStart.disabled = false;
  };

  const renderLocalForm = (count = 2) => {
    elements.modeExtra.classList.add('visible');
    elements.modeExtra.innerHTML = '';
    const label = document.createElement('label');
    label.textContent = 'Количество игроков';
    const selector = document.createElement('input');
    selector.type = 'range';
    selector.min = '2';
    selector.max = '4';
    selector.step = '1';
    selector.value = String(count);
    const counter = document.createElement('div');
    counter.textContent = `${count} игрока`;
    selector.addEventListener('input', () => {
      const value = Number(selector.value);
      counter.textContent = value === 4 ? '4 игрока' : `${value} игрока`;
      renderLocalForm(value);
    });
    elements.modeExtra.append(label, selector, counter);
    for (let i = 0; i < count; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `Имя игрока ${i + 1}`;
      input.value = localNames[i] || '';
      input.addEventListener('input', ensureStartState);
      elements.modeExtra.appendChild(input);
    }
    ensureStartState();
  };

  const renderOnlineForm = () => {
    elements.modeExtra.classList.add('visible');
    elements.modeExtra.innerHTML = '';
    const name = document.createElement('input');
    name.type = 'text';
    name.name = 'playerName';
    name.placeholder = 'Ваше имя';
    const action = document.createElement('select');
    action.name = 'action';
    action.innerHTML = `
      <option value="create">Создать лобби</option>
      <option value="join">Войти по коду</option>
    `;
    const room = document.createElement('input');
    room.type = 'text';
    room.name = 'roomCode';
    room.placeholder = 'Код (например, XRAY)';
    room.maxLength = 4;
    room.style.textTransform = 'uppercase';
    elements.modeExtra.append(name, action, room);
    elements.btnStart.textContent = 'Подключиться';
    const handleChange = () => {
      room.disabled = action.value === 'create';
      ensureStartState();
    };
    name.addEventListener('input', ensureStartState);
    room.addEventListener('input', ensureStartState);
    action.addEventListener('change', handleChange);
    handleChange();
  };

  modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      modeCards.forEach((other) => other.classList.remove('selected'));
      card.classList.add('selected');
      selectedMode = card.dataset.mode;
      elements.modeExtra.classList.remove('visible');
      elements.modeExtra.innerHTML = '';
      elements.btnStart.textContent = 'Старт';
      if (selectedMode === 'local') {
        renderLocalForm();
      } else if (selectedMode === 'online') {
        renderOnlineForm();
      }
      ensureStartState();
    });
  });

  elements.btnStart.addEventListener('click', () => {
    if (!selectedMode) return;
    elements.modeScreen.classList.add('hidden');
    elements.modeScreen.classList.remove('visible');
    if (selectedMode === 'solo') {
      startSoloGame();
    } else if (selectedMode === 'local') {
      const inputs = Array.from(elements.modeExtra.querySelectorAll('input[type="text"]'));
      const names = inputs.map((input) => input.value.trim());
      startLocalGame(names);
    } else if (selectedMode === 'online') {
      const nameInput = elements.modeExtra.querySelector('input[name="playerName"]');
      const roomInput = elements.modeExtra.querySelector('input[name="roomCode"]');
      const action = elements.modeExtra.querySelector('select[name="action"]');
      startOnlineGame({ name: nameInput.value.trim(), room: roomInput.value.trim().toUpperCase(), action: action.value });
    }
  });
}

function setupOnlineGame(payload) {
  state.running = true;
  state.turnLimit = payload.turnLimit || TURN_LIMIT;
  state.turn = payload.turn || 0;
  state.players = payload.players;
  state.localPlayerId = payload.you;
  state.vehicles = payload.vehicles;
  state.activePlayer = payload.active || null;
  elements.btnAdvance.disabled = payload.active !== payload.you;
  state.selectedVehicleId = null;
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
      state.turn = data.payload.turn;
      state.players = data.payload.players;
      state.vehicles = data.payload.vehicles;
      state.activePlayer = data.payload.active || null;
      state.turnLimit = data.payload.turnLimit || state.turnLimit;
      state.running = true;
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
