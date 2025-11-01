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

const ONLINE_HTTP = 'https://irgri.uk/';
const ONLINE_WS = 'wss://irgri.uk/';

const graph = buildGraph(MAP);

const elements = {
  canvas: document.getElementById('gameCanvas'),
  hint: document.getElementById('hint'),
  btnAdvance: document.getElementById('btnAdvance'),
  btnToggleNodes: document.getElementById('btnToggleNodes'),
  vehicleList: document.getElementById('vehicleList'),
  log: document.getElementById('log'),
  turnLabel: document.getElementById('turnLabel'),
  activePlayerLabel: document.getElementById('activePlayerLabel'),
  modeScreen: document.getElementById('modeScreen'),
  modeExtra: document.getElementById('modeExtra'),
  btnStart: document.getElementById('btnStart'),
  stopAmount: document.getElementById('stopAmount'),
  stopAmountLabel: document.getElementById('stopAmountLabel'),
  stopHandle: document.getElementById('stopHandle'),
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
    stopOrders: {},
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
  setHint('Нажмите на маршрутку и протяните путь до цели.');
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
  setHint('Игроки тянут маршруты и ставят стопы, затем нажимают «Следующий ход».');
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

function resetState() {
  state.running = false;
  state.players = [];
  state.vehicles = [];
  state.selectedVehicleId = null;
  state.turn = 0;
  state.log = [];
  state.hint = '';
  state.localPlayerId = null;
  state.online = null;
  state.activePlayer = null;
  state.showNodes = false;
  state.roomCode = null;
  state.interaction = { active: false, type: null, vehicleId: null, path: [], hoverNode: null, pointerId: null };
  state.stopDrag = { active: false, vehicleId: null, amount: 1, hoverNode: null };
  elements.log.innerHTML = '';
  elements.btnToggleNodes.textContent = 'Показать узлы';
  elements.stopHandle.disabled = true;
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
  if (state.mode === 'solo') return 'Нажмите на маршрутку и протяните путь до цели.';
  if (state.mode === 'local') return 'Игроки по очереди тянут маршруты и перетаскивают стопы на узлы.';
  if (state.mode === 'online') return 'Планируйте маршрут и ждите свой ход — сервер irgri.uk синхронизирует партии.';
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
  setHint(`Маршрутка №${vehicle.order}. Цель: ${target}.`);
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

setupModeSelection();
setupCanvasInteractions();
setupStopDrag();
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
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  const clientX = event.clientX ?? 0;
  const clientY = event.clientY ?? 0;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function hitVehicle(x, y) {
  const radius = 34;
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
  const path = state.interaction.path;
  const last = path[path.length - 1];
  if (nearest.id === last) return;
  if (!graph.get(last).neighbors.has(nearest.id)) return;
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
    nodeId = nearest ? nearest.id : null;
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
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  const clientX = event.clientX ?? 0;
  const clientY = event.clientY ?? 0;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function hitVehicle(x, y) {
  const radius = 34;
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
  const path = state.interaction.path;
  const last = path[path.length - 1];
  if (nearest.id === last) return;
  if (!graph.get(last).neighbors.has(nearest.id)) return;
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
  ctx.clearRect(0, 0, MAP.width, MAP.height);
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
    const owner = state.players.find((p) => p.id === vehicle.ownerId);
    if (!owner) continue;
    const basePath = Array.isArray(vehicle.history) && vehicle.history.length
      ? vehicle.history
      : [vehicle.current, ...vehicle.route];
    if (basePath.length < 2) continue;
    ctx.strokeStyle = `${owner.color}cc`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    const first = nodeById(basePath[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < basePath.length; i += 1) {
      const node = nodeById(basePath[i]);
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
