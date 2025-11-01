(() => {
  const TURN_LIMIT = 30;
  const PLAYER_VEHICLES = 2;
  const ONE_WAY_DURATION = 3;
  const ONE_WAY_COOLDOWN = 5;
  const ROUTE_BASE_COST = 5;
  const SIGNAL_BASE_COST = 10;
  const SIGNAL_COOLDOWN = 3;
  const SIGNAL_HISTORY_WINDOW = 10;
  const NPC_SPAWN_RATE = 0.04;
  const NPC_LOOKAHEAD = 5;

  const SCENARIOS = {
    weekday: {
      id: 'weekday',
      name: 'Будний рассвет',
      spawnMultiplier: 1,
      penaltyMultiplier: 1,
      description: 'Базовые параметры правил v0.2. Отлично, чтобы освоиться.'
    },
    market: {
      id: 'market',
      name: 'Базарный день',
      spawnMultiplier: 1.4,
      penaltyMultiplier: 1.2,
      description: 'Больше NPC и плотнее пробки — следите за маршрутами.'
    },
    night: {
      id: 'night',
      name: 'Ночная смена',
      spawnMultiplier: 0.7,
      penaltyMultiplier: 1.4,
      description: 'Меньше трафика, но штрафы ощутимее.'
    }
  };

  const NODE_DEFS = [
    { id: 'river', label: 'Набережная', x: 120, y: 210 },
    { id: 'campus', label: 'Кампус', x: 260, y: 120 },
    { id: 'museum', label: 'Музей', x: 420, y: 120 },
    { id: 'hospital', label: 'Больница', x: 560, y: 160 },
    { id: 'uptown', label: 'Северный', x: 700, y: 220 },
    { id: 'loop', label: 'Кольцо', x: 780, y: 360, signal: { groups: { A: ['uptown', 'park'], B: ['mall', 'terminal'] } } },
    { id: 'mall', label: 'Торговый', x: 560, y: 340 },
    { id: 'center', label: 'Центр', x: 400, y: 300, signal: { groups: { A: ['campus', 'station'], B: ['museum', 'mall'] } } },
    { id: 'station', label: 'Вокзал', x: 260, y: 360 },
    { id: 'oldtown', label: 'Старый город', x: 180, y: 500 },
    { id: 'depot', label: 'Депо', x: 320, y: 560 },
    { id: 'lake', label: 'Озеро', x: 500, y: 560 },
    { id: 'park', label: 'Парк', x: 640, y: 540 },
    { id: 'terminal', label: 'Терминал', x: 800, y: 520 }
  ];

  const EDGE_DEFS = [
    ['river', 'campus'],
    ['campus', 'museum'],
    ['museum', 'hospital'],
    ['hospital', 'uptown'],
    ['uptown', 'loop'],
    ['loop', 'mall'],
    ['mall', 'center'],
    ['center', 'campus'],
    ['center', 'station'],
    ['station', 'river'],
    ['station', 'oldtown'],
    ['oldtown', 'depot'],
    ['depot', 'lake'],
    ['lake', 'park'],
    ['park', 'terminal'],
    ['mall', 'lake'],
    ['station', 'depot'],
    ['museum', 'center'],
    ['hospital', 'mall'],
    ['oldtown', 'lake']
  ];

  const COLORS = {
    background: '#fdfdfd',
    road: '#d9d5ff',
    roadHighlight: '#b8b4f4',
    node: '#ffffff',
    nodeBorder: '#aea6d0',
    signalA: '#65d6ad',
    signalB: '#f6a7d8',
    player: ['#ff728c', '#7b8bff'],
    npc: '#636b86',
    destination: '#ffd166',
    route: '#ff9dbb',
    routeShadow: 'rgba(255, 157, 187, 0.25)',
    oneWay: '#6b49ff'
  };

  const dom = {};
  const state = {
    scenario: SCENARIOS.weekday,
    turn: 0,
    limit: TURN_LIMIT,
    balance: 0,
    income: 0,
    penalties: 0,
    completedRoutes: 0,
    graph: null,
    vehicles: [],
    npcs: [],
    pendingActions: {
      routeEdits: [],
      signalSwitches: [],
      oneWays: []
    },
    oneWays: new Map(),
    selection: null,
    uiMode: 'idle',
    hoverNode: null,
    routeEditor: null,
    spawnPool: 0,
    logs: [],
    npcPreview: null
  };

  function init() {
    cacheDom();
    bindUI();
    state.graph = buildGraph();
    initOneWayState();
    resizeCanvas();
    requestAnimationFrame(draw);
  }

  function cacheDom() {
    dom.canvas = document.getElementById('gameCanvas');
    dom.ctx = dom.canvas.getContext('2d');
    dom.turnValue = document.getElementById('turnValue');
    dom.turnLimit = document.getElementById('turnLimit');
    dom.turnsRemaining = document.getElementById('turnsRemaining');
    dom.balanceValue = document.getElementById('balanceValue');
    dom.incomeValue = document.getElementById('incomeValue');
    dom.penaltyValue = document.getElementById('penaltyValue');
    dom.routeSummary = document.getElementById('routeSummary');
    dom.vehicleList = document.getElementById('vehicleList');
    dom.actionQueue = document.getElementById('actionQueue');
    dom.log = document.getElementById('log');
    dom.boardHint = document.getElementById('boardHint');
    dom.statusMessage = document.getElementById('statusMessage');
    dom.btnEndTurn = document.getElementById('btnEndTurn');
    dom.btnPlanRoute = document.getElementById('btnPlanRoute');
    dom.btnSetWait = document.getElementById('btnSetWait');
    dom.btnSignal = document.getElementById('btnSignal');
    dom.btnOneWay = document.getElementById('btnOneWay');
    dom.btnCancelMode = document.getElementById('btnCancelMode');
    dom.startScreen = document.getElementById('startScreen');
    dom.routeEditor = document.getElementById('routeEditor');
    dom.routeTitle = document.getElementById('routeTitle');
    dom.routeSubtitle = document.getElementById('routeSubtitle');
    dom.routeList = document.getElementById('routeList');
    dom.routeDestination = document.getElementById('routeDestination');
    dom.routeLength = document.getElementById('routeLength');
    dom.routeCost = document.getElementById('routeCost');
    dom.btnConfirmRoute = document.getElementById('btnConfirmRoute');
    dom.btnCloseRoute = document.getElementById('btnCloseRoute');
    dom.helpOverlay = document.getElementById('helpOverlay');
    dom.btnShowHelp = document.getElementById('btnShowHelp');
    dom.btnCloseHelp = document.getElementById('btnCloseHelp');
    dom.paletteSelect = document.getElementById('paletteSelect');
    dom.btnStartGame = document.getElementById('btnStartGame');
    dom.startCards = Array.from(document.querySelectorAll('.scenario-card'));
  }

  function bindUI() {
    window.addEventListener('resize', resizeCanvas);
    dom.btnEndTurn.addEventListener('click', advanceTurn);
    dom.canvas.addEventListener('click', handleCanvasClick);
    dom.canvas.addEventListener('mousemove', handleCanvasHover);
    dom.btnPlanRoute.addEventListener('click', () => openRouteEditor(false));
    dom.btnSetWait.addEventListener('click', () => openRouteEditor(true));
    dom.btnSignal.addEventListener('click', enterSignalMode);
    dom.btnOneWay.addEventListener('click', enterOneWayMode);
    dom.btnCancelMode.addEventListener('click', resetInteractionMode);
    dom.btnCloseRoute.addEventListener('click', closeRouteEditor);
    dom.btnConfirmRoute.addEventListener('click', confirmRoutePlan);
    dom.btnShowHelp.addEventListener('click', () => toggleHelp(true));
    dom.btnCloseHelp.addEventListener('click', () => toggleHelp(false));
    dom.paletteSelect.addEventListener('change', handlePaletteChange);
    dom.btnStartGame.addEventListener('click', startGame);
    dom.startCards.forEach((card) => {
      card.addEventListener('click', () => selectScenario(card.dataset.scenario));
    });
  }

  function handlePaletteChange() {
    const theme = dom.paletteSelect.value;
    document.body.setAttribute('data-theme', theme);
    document.getElementById('app').setAttribute('data-theme', theme);
  }

  function selectScenario(id) {
    const scenario = SCENARIOS[id];
    if (!scenario) return;
    state.scenario = scenario;
    dom.startCards.forEach((card) => {
      card.classList.toggle('active', card.dataset.scenario === id);
    });
    dom.btnStartGame.disabled = false;
  }

  function startGame() {
    dom.startScreen.classList.add('hidden');
    resetGameState();
    updateUI();
    logEvent('Смена начата. Планируйте маршруты и держите город в движении.');
  }

  function resetGameState() {
    state.turn = 0;
    state.limit = TURN_LIMIT;
    state.balance = 0;
    state.income = 0;
    state.penalties = 0;
    state.completedRoutes = 0;
    state.vehicles = [];
    state.npcs = [];
    state.pendingActions = { routeEdits: [], signalSwitches: [], oneWays: [] };
    state.logs = [];
    state.selection = null;
    state.uiMode = 'idle';
    state.spawnPool = 0;
    state.npcPreview = null;
    initOneWayState();
    dom.btnPlanRoute.disabled = true;
    dom.btnSetWait.disabled = true;
    dom.btnCancelMode.disabled = true;
    setStatus('Выберите маршрутку, чтобы спланировать первый рейс.');
    hideHint();
    for (let i = 0; i < PLAYER_VEHICLES; i += 1) {
      const startNode = i === 0 ? 'depot' : 'station';
      const vehicle = createPlayerVehicle(i, startNode);
      state.vehicles.push(vehicle);
      assignNewDestination(vehicle);
    }
    resizeCanvas();
  }

  function createPlayerVehicle(index, nodeId) {
    return {
      id: `player-${index + 1}`,
      type: 'player',
      name: `Маршрутка ${index + 1}`,
      color: COLORS.player[index % COLORS.player.length],
      node: nodeId,
      routeSegments: [{ node: nodeId, wait: 0 }],
      routeIndex: 0,
      waitRemaining: 0,
      routePaidLength: 0,
      pendingRoute: null,
      pendingPaidLength: 0,
      destination: null,
      stats: {
        distance: 0,
        turns: 0,
        blocking: 0,
        blockingThisTurn: 0,
        clean: true
      }
    };
  }

  function createNPC(id, nodeId) {
    return {
      id,
      type: 'npc',
      node: nodeId,
      color: COLORS.npc,
      path: [nodeId],
      pathIndex: 0,
      waitRemaining: 0,
      destination: null,
      eta: 0
    };
  }

  function buildGraph() {
    const nodes = new Map();
    NODE_DEFS.forEach((def) => {
      nodes.set(def.id, {
        ...def,
        neighbors: new Set(),
        signal: def.signal
          ? {
              phase: 'A',
              timer: 0,
              groups: {
                A: new Set(def.signal.groups.A),
                B: new Set(def.signal.groups.B)
              },
              cooldown: 0,
              history: []
            }
          : null
      });
    });
    const edges = [];
    EDGE_DEFS.forEach(([a, b], index) => {
      const id = `edge-${index}`;
      nodes.get(a).neighbors.add(b);
      nodes.get(b).neighbors.add(a);
      edges.push({ id, a, b });
    });
    const adjacency = buildAdjacency(nodes, edges);
    return { nodes, edges, adjacency };
  }

  function buildAdjacency(nodes, edges) {
    const adjacency = new Map();
    nodes.forEach((_, id) => {
      adjacency.set(id, []);
    });
    edges.forEach((edge) => {
      const { a, b } = edge;
      const abPhase = getSignalPhaseRequirement(nodes.get(b), a);
      const baPhase = getSignalPhaseRequirement(nodes.get(a), b);
      adjacency.get(a).push({ to: b, edge, phase: abPhase });
      adjacency.get(b).push({ to: a, edge, phase: baPhase });
    });
    return adjacency;
  }

  function getSignalPhaseRequirement(node, fromId) {
    if (!node.signal) return null;
    if (node.signal.groups.A.has(fromId)) return 'A';
    if (node.signal.groups.B.has(fromId)) return 'B';
    return null;
  }

  function initOneWayState() {
    state.oneWays = new Map();
    state.graph.edges.forEach((edge) => {
      const key = edgeKey(edge.a, edge.b);
      state.oneWays.set(key, {
        edge,
        active: false,
        allowed: null,
        remaining: 0,
        cooldown: 0
      });
    });
  }

  function edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function resizeCanvas() {
    const rect = dom.canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const ratio = window.devicePixelRatio || 1;
    dom.canvas.width = size * ratio;
    dom.canvas.height = size * ratio;
    dom.canvas.style.width = `${size}px`;
    dom.canvas.style.height = `${size}px`;
    dom.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function draw() {
    const ctx = dom.ctx;
    if (!ctx || !state.graph) return;
    const { width, height } = dom.canvas;
    ctx.clearRect(0, 0, width, height);
    drawEdges(ctx);
    drawOneWays(ctx);
    drawRoutes(ctx);
    drawNpcPreview(ctx);
    drawNodes(ctx);
    drawVehicles(ctx);
    drawDestinations(ctx);
    if (state.uiMode === 'signal') {
      highlightSignalTargets(ctx);
    }
    if (state.uiMode === 'oneway-to' && state.routeEditor?.fromNode) {
      highlightOneWayTargets(ctx);
    }
    requestAnimationFrame(draw);
  }

  function project(node) {
    const padding = 60;
    const size = Math.min(dom.canvas.width, dom.canvas.height) / (window.devicePixelRatio || 1);
    const scaleX = (size - padding * 2) / 700;
    const scaleY = (size - padding * 2) / 460;
    return {
      x: padding + (node.x - 100) * scaleX,
      y: padding + (node.y - 120) * scaleY
    };
  }

  function drawEdges(ctx) {
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.road;
    state.graph.edges.forEach((edge) => {
      const a = project(state.graph.nodes.get(edge.a));
      const b = project(state.graph.nodes.get(edge.b));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  function drawOneWays(ctx) {
    state.oneWays.forEach((status) => {
      if (!status.active || !status.allowed) return;
      const [from, to] = status.allowed.split('>');
      const start = project(state.graph.nodes.get(from));
      const end = project(state.graph.nodes.get(to));
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const arrowLength = 24;
      const arrowWidth = 10;
      ctx.strokeStyle = COLORS.oneWay;
      ctx.fillStyle = COLORS.oneWay;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(mid.x - arrowLength * Math.cos(angle) + arrowWidth * Math.sin(angle), mid.y - arrowLength * Math.sin(angle) - arrowWidth * Math.cos(angle));
      ctx.lineTo(mid.x - arrowLength * Math.cos(angle) - arrowWidth * Math.sin(angle), mid.y - arrowLength * Math.sin(angle) + arrowWidth * Math.cos(angle));
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawRoutes(ctx) {
    state.vehicles.forEach((vehicle) => {
      if (!vehicle.routeSegments || vehicle.routeSegments.length <= 1) return;
      ctx.strokeStyle = vehicle.color || COLORS.route;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      vehicle.routeSegments.forEach((segment, index) => {
        const point = project(state.graph.nodes.get(segment.node));
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function drawNpcPreview(ctx) {
    if (!state.npcPreview || !state.npcPreview.path || state.npcPreview.path.length < 2) return;
    ctx.strokeStyle = 'rgba(99, 107, 134, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    state.npcPreview.path.forEach((nodeId, index) => {
      const point = project(state.graph.nodes.get(nodeId));
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawNodes(ctx) {
    state.graph.nodes.forEach((node) => {
      const { x, y } = project(node);
      ctx.fillStyle = COLORS.node;
      ctx.strokeStyle = COLORS.nodeBorder;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (node.signal) {
        ctx.fillStyle = node.signal.phase === 'A' ? COLORS.signalA : COLORS.signalB;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#55586f';
      ctx.font = '12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, x, y - 18);
    });
  }

  function drawVehicles(ctx) {
    const all = [...state.npcs, ...state.vehicles];
    all.forEach((entity) => {
      const node = state.graph.nodes.get(entity.node);
      if (!node) return;
      const { x, y } = project(node);
      if (entity.id.startsWith('player')) {
        ctx.fillStyle = entity.color;
        drawRoundedRect(ctx, x - 12, y - 12, 24, 24, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "Inter"';
        ctx.textAlign = 'center';
        ctx.fillText(entity.id.endsWith('1') ? '1' : '2', x, y + 4);
      } else {
        ctx.fillStyle = COLORS.npc;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }


  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawDestinations(ctx) {
    state.vehicles.forEach((vehicle) => {
      if (!vehicle.destination) return;
      const node = state.graph.nodes.get(vehicle.destination);
      if (!node) return;
      const { x, y } = project(node);
      ctx.fillStyle = COLORS.destination;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function highlightSignalTargets(ctx) {
    state.graph.nodes.forEach((node) => {
      if (!node.signal) return;
      const { x, y } = project(node);
      ctx.strokeStyle = COLORS.signalA;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function highlightOneWayTargets(ctx) {
    const from = state.routeEditor.fromNode;
    if (!from) return;
    const neighbors = state.graph.adjacency.get(from);
    neighbors.forEach((neighbor) => {
      const node = state.graph.nodes.get(neighbor.to);
      const { x, y } = project(node);
      ctx.strokeStyle = COLORS.oneWay;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function handleCanvasClick(event) {
    if (!state.graph) return;
    const point = getCanvasCoordinates(event);
    const node = findNodeAt(point.x, point.y);
    const entity = findEntityAt(node?.id);
    if (state.uiMode === 'signal') {
      if (node && node.signal) {
        scheduleSignalSwitch(node.id);
      }
      return;
    }
    if (state.uiMode === 'oneway-from') {
      if (node) {
        state.routeEditor = { fromNode: node.id };
        state.uiMode = 'oneway-to';
        setStatus(`Выберите узел, на который будет направлен односторонний знак из «${node.label}».`);
      }
      return;
    }
    if (state.uiMode === 'oneway-to') {
      if (node && state.routeEditor?.fromNode) {
        attemptOneWay(state.routeEditor.fromNode, node.id);
      }
      return;
    }
    if (state.uiMode === 'route-edit' || state.uiMode === 'wait-edit') {
      if (node) {
        updateRouteEditorPath(node.id);
      }
      return;
    }
    if (entity) {
      if (entity.type === 'npc') {
        showNpcForecast(entity);
      } else {
        selectVehicle(entity.id);
      }
      return;
    }
    if (node && node.signal) {
      setStatus(`Перекрёсток «${node.label}» — фаза ${node.signal.phase}.`);
    }
  }

  function handleCanvasHover(event) {
    if (!state.graph) return;
    if (!['signal', 'oneway-from', 'oneway-to'].includes(state.uiMode)) return;
    const point = getCanvasCoordinates(event);
    const node = findNodeAt(point.x, point.y);
    if (!node) {
      hideHint();
      return;
    }
    if (state.uiMode === 'signal' && node.signal) {
      showHint(`Переключить «${node.label}»`);
    } else if (state.uiMode === 'oneway-from') {
      showHint(`Исходный узел: «${node.label}»`);
    } else if (state.uiMode === 'oneway-to' && state.routeEditor?.fromNode) {
      const neighbors = state.graph.adjacency.get(state.routeEditor.fromNode);
      if (neighbors.some((n) => n.to === node.id)) {
        showHint(`Цель: «${node.label}»`);
      } else {
        showHint('Узел не соединён ребром');
      }
    }
  }

  function getCanvasCoordinates(event) {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function findNodeAt(x, y) {
    const threshold = 24;
    let closest = null;
    let distance = threshold;
    state.graph.nodes.forEach((node) => {
      const projected = project(node);
      const dx = projected.x - x;
      const dy = projected.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < distance) {
        distance = dist;
        closest = node;
      }
    });
    return closest;
  }

  function findEntityAt(nodeId) {
    if (!nodeId) return null;
    return state.vehicles.find((vehicle) => vehicle.node === nodeId) || state.npcs.find((npc) => npc.node === nodeId);
  }

  function selectVehicle(id) {
    state.npcPreview = null;
    const vehicle = state.vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    state.selection = { type: 'vehicle', id };
    dom.btnPlanRoute.disabled = false;
    dom.btnSetWait.disabled = vehicle.routeSegments.length <= 1;
    updateVehicleList();
    setStatus(`Выбрана ${vehicle.name}. Цель: ${formatDestination(vehicle)}.`);
  }

  function formatDestination(vehicle) {
    if (!vehicle.destination) return '—';
    const node = state.graph.nodes.get(vehicle.destination);
    return node ? node.label : vehicle.destination;
  }

  function openRouteEditor(waitOnly) {
    if (!state.selection || state.selection.type !== 'vehicle') return;
    const vehicle = state.vehicles.find((v) => v.id === state.selection.id);
    if (!vehicle) return;
    const title = waitOnly ? 'Ожидание на маршруте' : `Маршрут для ${vehicle.name}`;
    dom.routeTitle.textContent = title;
    dom.routeSubtitle.textContent = waitOnly
      ? 'Измените задержку на узлах маршрута. Правки вступят в силу в начале следующего хода.'
      : 'Кликните по узлам на карте, чтобы построить путь. Правки вступят в силу в начале следующего хода.';
    dom.routeDestination.textContent = formatDestination(vehicle);
    dom.routeEditor.classList.remove('hidden');
    state.uiMode = waitOnly ? 'wait-edit' : 'route-edit';
    dom.btnCancelMode.disabled = false;
    const path = waitOnly ? vehicle.routeSegments.map((segment) => ({ node: segment.node, wait: segment.wait })) : [{ node: vehicle.routeSegments[0].node, wait: 0 }];
    state.routeEditor = {
      vehicleId: vehicle.id,
      path,
      waitOnly,
      cost: 0
    };
    renderRouteEditor();
    setStatus(waitOnly ? 'Настраивайте ожидание в правой части окна.' : 'Добавьте узлы маршрута кликами по карте.');
  }

  function updateRouteEditorPath(nodeId) {
    if (!state.routeEditor) return;
    const { path, waitOnly } = state.routeEditor;
    const last = path[path.length - 1];
    if (waitOnly) {
      return;
    }
    const neighbors = state.graph.adjacency.get(last.node);
    const isNeighbor = neighbors.some((n) => n.to === nodeId);
    if (!isNeighbor) {
      setStatus('Узел не соединён с предыдущим. Выберите соседний перекрёсток.');
      return;
    }
    if (path.length > 1 && path[path.length - 2].node === nodeId) {
      setStatus('Нельзя двигаться назад сразу. Попробуйте другой путь.');
      return;
    }
    path.push({ node: nodeId, wait: 0 });
    renderRouteEditor();
  }

  function renderRouteEditor() {
    const editor = state.routeEditor;
    if (!editor) return;
    const vehicle = state.vehicles.find((v) => v.id === editor.vehicleId);
    if (!vehicle) return;
    dom.routeList.innerHTML = '';
    editor.path.forEach((segment, index) => {
      const node = state.graph.nodes.get(segment.node);
      const item = document.createElement('div');
      item.className = 'route-node';
      const title = document.createElement('span');
      title.textContent = `${index + 1}. ${node ? node.label : segment.node}`;
      item.appendChild(title);
      if (index > 0) {
        const waitInput = document.createElement('input');
        waitInput.type = 'number';
        waitInput.min = '0';
        waitInput.max = '3';
        waitInput.value = segment.wait;
        waitInput.addEventListener('change', () => {
          const value = clamp(parseInt(waitInput.value, 10) || 0, 0, 3);
          segment.wait = value;
          waitInput.value = value;
        });
        const label = document.createElement('label');
        label.textContent = 'Ожидание';
        label.style.marginRight = '8px';
        const container = document.createElement('span');
        container.appendChild(label);
        container.appendChild(waitInput);
        item.appendChild(container);
      }
      dom.routeList.appendChild(item);
    });
    const edgesCount = Math.max(0, editor.path.length - 1);
    dom.routeLength.textContent = edgesCount;
    const paidLength = Math.max(vehicle.routePaidLength, 0);
    const diff = Math.max(0, edgesCount - paidLength);
    const cost = editor.waitOnly ? 0 : ROUTE_BASE_COST + diff;
    editor.cost = cost;
    dom.routeCost.textContent = `${cost}₵`;
    dom.btnConfirmRoute.disabled = editor.path.length <= 1 && !editor.waitOnly;
  }

  function closeRouteEditor() {
    dom.routeEditor.classList.add('hidden');
    state.routeEditor = null;
    if (state.uiMode === 'route-edit' || state.uiMode === 'wait-edit') {
      state.uiMode = 'idle';
    }
  }

  function confirmRoutePlan() {
    const editor = state.routeEditor;
    if (!editor) return;
    const vehicle = state.vehicles.find((v) => v.id === editor.vehicleId);
    if (!vehicle) return;
    if (!editor.waitOnly && editor.path.length <= 1) {
      setStatus('Добавьте хотя бы один узел маршрута.');
      return;
    }
    if (!editor.waitOnly) {
      if (state.balance < editor.cost) {
        logEvent(`Недостаточно средств: требуется ${editor.cost}₵.`);
      }
      state.balance -= editor.cost;
    }
    const segments = editor.waitOnly ? editor.path : editor.path.map((segment) => ({ node: segment.node, wait: segment.wait }));
    const newLength = Math.max(0, segments.length - 1);
    const newPaidLength = editor.waitOnly ? vehicle.routePaidLength : Math.max(vehicle.routePaidLength, newLength);
    state.pendingActions.routeEdits.push({
      vehicleId: vehicle.id,
      segments,
      paidLength: newPaidLength
    });
    logEvent(`${vehicle.name}: правки маршрута применятся в начале следующего хода.`);
    closeRouteEditor();
    resetInteractionMode();
    updateActionQueue();
    updateUI();
  }

  function enterSignalMode() {
    resetInteractionMode();
    state.uiMode = 'signal';
    dom.btnCancelMode.disabled = false;
    state.npcPreview = null;
    setStatus('Кликните по перекрёстку со светофором, чтобы запланировать переключение (10₵ + надбавка за частые вмешательства).');
    showHint('Выберите светофор');
  }

  function enterOneWayMode() {
    resetInteractionMode();
    state.uiMode = 'oneway-from';
    dom.btnCancelMode.disabled = false;
    state.routeEditor = { fromNode: null };
    state.npcPreview = null;
    setStatus('Выберите первый узел ребра, на котором хотите ввести временный односторонний знак (15₵).');
    showHint('Кликните исходный узел');
  }

  function attemptOneWay(fromId, toId) {
    const neighbors = state.graph.adjacency.get(fromId);
    const isNeighbor = neighbors.some((n) => n.to === toId);
    if (!isNeighbor) {
      setStatus('Узлы не соединены ребром. Выберите соседний узел.');
      return;
    }
    const key = edgeKey(fromId, toId);
    const status = state.oneWays.get(key);
    if (!status) {
      setStatus('Для этого ребра недоступен знак.');
      return;
    }
    if (status.active || status.cooldown > 0) {
      setStatus('Это ребро сейчас под защитой кулдауна. Попробуйте позже.');
      return;
    }
    state.balance -= 15;
    state.pendingActions.oneWays.push({ key, allowed: `${fromId}>${toId}` });
    logEvent(`Назначен временный односторонний знак: ${labelForNode(fromId)} → ${labelForNode(toId)}.`);
    resetInteractionMode();
    updateActionQueue();
    updateUI();
  }

  function scheduleSignalSwitch(nodeId) {
    const node = state.graph.nodes.get(nodeId);
    if (!node?.signal) return;
    if (node.signal.cooldown > 0) {
      setStatus(`«${node.label}» в кулдауне ещё ${node.signal.cooldown} ход(а).`);
      return;
    }
    const recent = node.signal.history.filter((turn) => state.turn - turn < SIGNAL_HISTORY_WINDOW).length;
    const cost = SIGNAL_BASE_COST + 10 * recent;
    state.balance -= cost;
    state.pendingActions.signalSwitches.push({ nodeId });
    logEvent(`Переключение светофора на «${node.label}» вступит в силу в начале следующего хода (стоимость ${cost}₵).`);
    resetInteractionMode();
    updateActionQueue();
    updateUI();
  }

  function resetInteractionMode() {
    if (state.uiMode === 'route-edit' || state.uiMode === 'wait-edit') {
      closeRouteEditor();
    }
    state.uiMode = 'idle';
    dom.btnCancelMode.disabled = true;
    state.routeEditor = null;
    state.npcPreview = null;
    hideHint();
    setStatus('Режим ожидания: выберите маршрутку или действие.');
  }

  function setStatus(message) {
    dom.statusMessage.textContent = message;
  }

  function showHint(message) {
    dom.boardHint.textContent = message;
    dom.boardHint.classList.add('visible');
  }

  function hideHint() {
    dom.boardHint.classList.remove('visible');
  }

  function advanceTurn() {
    if (state.turn >= state.limit) {
      logEvent('Смена завершена.');
      return;
    }
    state.npcPreview = null;
    applyPendingActions();
    tickSignals();
    tickOneWays();
    spawnNPCs();
    moveEntities();
    handleEconomy();
    state.turn += 1;
    state.vehicles.forEach((vehicle) => {
      vehicle.stats.turns += 1;
    });
    if (state.turn >= state.limit) {
      logEvent(`Смена завершена. Итоговый баланс: ${state.balance}₵.`);
    }
    updateUI();
  }

  function applyPendingActions() {
    state.pendingActions.routeEdits.forEach((action) => {
      const vehicle = state.vehicles.find((v) => v.id === action.vehicleId);
      if (!vehicle) return;
      vehicle.routeSegments = action.segments.map((segment) => ({ node: segment.node, wait: segment.wait }));
      vehicle.routeIndex = 0;
      vehicle.waitRemaining = vehicle.routeSegments[0]?.wait || 0;
      vehicle.pendingRoute = null;
      vehicle.routePaidLength = action.paidLength;
    });
    state.pendingActions.routeEdits = [];

    state.pendingActions.signalSwitches.forEach((action) => {
      const node = state.graph.nodes.get(action.nodeId);
      if (!node?.signal) return;
      node.signal.phase = node.signal.phase === 'A' ? 'B' : 'A';
      node.signal.timer = 0;
      node.signal.cooldown = SIGNAL_COOLDOWN;
      node.signal.history.push(state.turn);
      logEvent(`Светофор на «${node.label}» переключился на фазу ${node.signal.phase}.`);
    });
    state.pendingActions.signalSwitches = [];

    state.pendingActions.oneWays.forEach((action) => {
      const status = state.oneWays.get(action.key);
      if (!status) return;
      status.active = true;
      status.allowed = action.allowed;
      status.remaining = ONE_WAY_DURATION;
      status.cooldown = ONE_WAY_COOLDOWN;
      logEvent(`Одностороннее движение активно: ${labelForNode(action.allowed.split('>')[0])} → ${labelForNode(action.allowed.split('>')[1])}.`);
    });
    state.pendingActions.oneWays = [];
  }

  function tickSignals() {
    state.graph.nodes.forEach((node) => {
      if (!node.signal) return;
      if (node.signal.cooldown > 0) {
        node.signal.cooldown -= 1;
      }
      node.signal.timer += 1;
      if (node.signal.timer >= 3) {
        node.signal.phase = node.signal.phase === 'A' ? 'B' : 'A';
        node.signal.timer = 0;
      }
      while (node.signal.history.length && state.turn - node.signal.history[0] >= SIGNAL_HISTORY_WINDOW) {
        node.signal.history.shift();
      }
    });
  }

  function tickOneWays() {
    state.oneWays.forEach((status) => {
      if (status.active) {
        status.remaining -= 1;
        if (status.remaining <= 0) {
          status.active = false;
          status.allowed = null;
        }
      } else if (status.cooldown > 0) {
        status.cooldown -= 1;
      }
    });
  }

  function spawnNPCs() {
    const maxNPCs = Math.floor(state.graph.nodes.size / 2);
    if (state.npcs.length >= maxNPCs) return;
    state.spawnPool += NPC_SPAWN_RATE * state.graph.nodes.size * state.scenario.spawnMultiplier;
    const spawnCount = Math.floor(state.spawnPool);
    state.spawnPool -= spawnCount;
    for (let i = 0; i < spawnCount; i += 1) {
      if (state.npcs.length >= maxNPCs) break;
      const freeNodes = Array.from(state.graph.nodes.values()).filter((node) => !isNodeOccupied(node.id));
      if (freeNodes.length === 0) break;
      const startNode = freeNodes[Math.floor(Math.random() * freeNodes.length)];
      const npc = createNPC(`npc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, startNode.id);
      assignNpcDestination(npc);
      state.npcs.push(npc);
      logEvent(`NPC появился на узле «${startNode.label}».`);
    }
  }

  function isNodeOccupied(nodeId) {
    const occupiedPlayer = state.vehicles.some((vehicle) => vehicle.node === nodeId);
    const occupiedNPC = state.npcs.some((npc) => npc.node === nodeId);
    return occupiedPlayer || occupiedNPC;
  }

  function assignNpcDestination(npc) {
    const distances = breadthFirstDistances(npc.node);
    const candidates = Array.from(distances.entries())
      .filter(([nodeId, distance]) => distance >= 3 && distance <= 12 && nodeId !== npc.node)
      .map(([nodeId]) => nodeId);
    const options = shuffled(candidates);
    for (const target of options) {
      const path = findNpcPath(npc.node, target);
      if (path && path.length > 1) {
        npc.destination = target;
        npc.path = path;
        npc.pathIndex = 0;
        npc.eta = path.length - 1;
        return;
      }
    }
    npc.destination = null;
    npc.path = [npc.node];
    npc.pathIndex = 0;
    npc.eta = 0;
  }

  function assignNewDestination(vehicle) {
    const target = randomNodeAtDistance(vehicle.node, 6, 18);
    if (!target) return;
    vehicle.destination = target;
    vehicle.stats.distance = 0;
    vehicle.stats.turns = 0;
    vehicle.stats.blocking = 0;
    vehicle.stats.clean = true;
    vehicle.routeSegments = [{ node: vehicle.node, wait: 0 }];
    vehicle.routeIndex = 0;
    vehicle.waitRemaining = 0;
    vehicle.routePaidLength = 0;
    vehicle.pendingRoute = null;
    logEvent(`${vehicle.name}: новая цель — «${labelForNode(target)}».`);
  }

  function randomNodeAtDistance(fromId, min, max) {
    const distances = breadthFirstDistances(fromId);
    const candidates = Array.from(distances.entries())
      .filter(([nodeId, distance]) => distance >= min && distance <= max && nodeId !== fromId)
      .map(([nodeId]) => nodeId);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function breadthFirstDistances(startId) {
    const distances = new Map();
    const queue = [[startId, 0]];
    distances.set(startId, 0);
    while (queue.length) {
      const [nodeId, distance] = queue.shift();
      state.graph.adjacency.get(nodeId).forEach((neighbor) => {
        if (!distances.has(neighbor.to)) {
          distances.set(neighbor.to, distance + 1);
          queue.push([neighbor.to, distance + 1]);
        }
      });
    }
    return distances;
  }

  function findShortestPath(startId, targetId) {
    const queue = [startId];
    const visited = new Set([startId]);
    const prev = new Map();
    while (queue.length) {
      const current = queue.shift();
      if (current === targetId) break;
      state.graph.adjacency.get(current).forEach((neighbor) => {
        if (!visited.has(neighbor.to)) {
          visited.add(neighbor.to);
          prev.set(neighbor.to, current);
          queue.push(neighbor.to);
        }
      });
    }
    if (!visited.has(targetId)) return null;
    const path = [];
    let node = targetId;
    while (node) {
      path.unshift(node);
      node = prev.get(node);
    }
    return path;
  }

  function findNpcPath(startId, targetId) {
    const queue = [startId];
    const visited = new Set([startId]);
    const prev = new Map();
    while (queue.length) {
      const current = queue.shift();
      if (current === targetId) break;
      state.graph.adjacency.get(current).forEach((neighbor) => {
        if (!visited.has(neighbor.to) && canNpcUseEdge(current, neighbor.to)) {
          visited.add(neighbor.to);
          prev.set(neighbor.to, current);
          queue.push(neighbor.to);
        }
      });
    }
    if (!visited.has(targetId)) return null;
    const path = [];
    let node = targetId;
    while (node) {
      path.unshift(node);
      node = prev.get(node);
    }
    return path;
  }

  function moveEntities() {
    const occupancy = new Map();
    state.vehicles.forEach((vehicle) => {
      occupancy.set(vehicle.node, vehicle.id);
      vehicle.stats.blockingThisTurn = 0;
    });
    state.npcs.forEach((npc) => {
      if (!occupancy.has(npc.node)) {
        occupancy.set(npc.node, npc.id);
      }
    });

    const requests = [];
    const registry = new Map();

    const registerRequest = (entity, nextNode, phaseRequirement) => {
      const currentNode = entity.node;
      const occupant = occupancy.get(nextNode);
      const signal = state.graph.nodes.get(nextNode).signal;
      let priority = signal ? 2 : 1;
      if (signal && phaseRequirement && signal.phase !== phaseRequirement) {
        return; // красный
      }
      if (entity.type !== 'npc' && signal && !phaseRequirement) {
        priority = 2;
      }
      const entry = {
        entity,
        from: currentNode,
        to: nextNode,
        priority,
        allowed: true
      };
      requests.push(entry);
      registry.set(entity.id, entry);
    };

    state.vehicles.forEach((vehicle) => {
      const plan = vehicle.routeSegments;
      if (!plan || plan.length <= vehicle.routeIndex + 1) return;
      if (vehicle.waitRemaining > 0) {
        vehicle.waitRemaining -= 1;
        return;
      }
      const nextSegment = plan[vehicle.routeIndex + 1];
      const adjacency = state.graph.adjacency.get(vehicle.routeSegments[vehicle.routeIndex].node);
      const link = adjacency.find((neighbor) => neighbor.to === nextSegment.node);
      if (!link) return;
      registerRequest(vehicle, nextSegment.node, link.phase);
    });

    state.npcs.forEach((npc) => {
      if (!npc.path || npc.path.length <= npc.pathIndex + 1) {
        assignNpcDestination(npc);
      }
      if (npc.waitRemaining > 0) {
        npc.waitRemaining -= 1;
        return;
      }
      const nextNode = npc.path[npc.pathIndex + 1];
      if (!nextNode) return;
      const adjacency = state.graph.adjacency.get(npc.path[npc.pathIndex]);
      const link = adjacency.find((neighbor) => neighbor.to === nextNode);
      if (!link) return;
      if (!canNpcUseEdge(npc.path[npc.pathIndex], nextNode)) {
        const updatedPath = npc.destination ? findNpcPath(npc.node, npc.destination) : null;
        if (updatedPath && updatedPath.length > 1) {
          npc.path = updatedPath;
          npc.pathIndex = 0;
          npc.waitRemaining = 0;
        } else {
          npc.waitRemaining = 1;
        }
        return;
      }
      registerRequest(npc, nextNode, link.phase);
    });

    const winners = resolveRequests(requests, occupancy);

    winners.forEach((request) => {
      const { entity, to } = request;
      occupancy.delete(entity.node);
      entity.node = to;
      occupancy.set(entity.node, entity.id);
      if (entity.id.startsWith('player')) {
        const vehicle = entity;
        vehicle.routeIndex += 1;
        vehicle.waitRemaining = vehicle.routeSegments[vehicle.routeIndex]?.wait || 0;
        vehicle.stats.distance += 1;
      } else {
        const npc = entity;
        npc.pathIndex += 1;
        npc.eta = Math.max(0, npc.path.length - npc.pathIndex - 1);
      }
    });

    winners.forEach((request) => {
      if (!request.entity.destination) return;
      if (request.entity.id.startsWith('player')) {
        const vehicle = request.entity;
        if (vehicle.node === vehicle.destination) {
          completeRoute(vehicle);
        }
      } else {
        const npc = request.entity;
        if (npc.node === npc.destination) {
          assignNpcDestination(npc);
        }
      }
    });

    state.vehicles.forEach((vehicle) => {
      if (vehicle.stats.blockingThisTurn > 0) {
        vehicle.stats.blocking += 1;
        vehicle.stats.clean = false;
      }
    });
  }

  function resolveRequests(requests, occupancy) {
    const targets = new Map();
    requests.forEach((request) => {
      if (!targets.has(request.to)) targets.set(request.to, []);
      targets.get(request.to).push(request);
    });

    const winners = new Map();
    targets.forEach((group, targetNode) => {
      const allowed = group.filter((req) => req.allowed !== false);
      if (allowed.length === 0) return;
      allowed.sort((a, b) => b.priority - a.priority);
      if (allowed.length >= 2 && allowed[0].priority === allowed[1].priority) {
        // вежливый стоп
        allowed.forEach((req) => {
          if (req.entity.id.startsWith('player')) {
            const vehicle = req.entity;
            setStatus(`${vehicle.name} остановилась на «вежливом стопе».`);
          }
          const occupantId = occupancy.get(targetNode);
          if (occupantId) {
            const blocker = findVehicleById(occupantId);
            if (blocker && blocker.stats) blocker.stats.blockingThisTurn += 1;
          }
        });
        return;
      }
      const winner = allowed[0];
      winners.set(winner.entity.id, winner);
    });

    let changed = true;
    while (changed) {
      changed = false;
      occupancy.forEach((occupantId, nodeId) => {
        const occupantRequest = winners.get(occupantId);
        if (!occupantRequest || occupantRequest.from !== nodeId) {
          const blocked = Array.from(winners.values()).filter((req) => req.to === nodeId);
          if (blocked.length > 0) {
            blocked.forEach((req) => {
              winners.delete(req.entity.id);
              const occupant = findVehicleById(occupantId);
              if (occupant?.stats) {
                occupant.stats.blockingThisTurn += 1;
              }
            });
            changed = true;
          }
        }
      });
    }

    return Array.from(winners.values());
  }

  function findVehicleById(id) {
    return state.vehicles.find((vehicle) => vehicle.id === id) || state.npcs.find((npc) => npc.id === id);
  }

  function canNpcUseEdge(fromId, toId) {
    const key = edgeKey(fromId, toId);
    const status = state.oneWays.get(key);
    if (!status || !status.active || !status.allowed) return true;
    return status.allowed === `${fromId}>${toId}`;
  }

  function handleEconomy() {
    state.vehicles.forEach((vehicle) => {
      if (vehicle.stats.blockingThisTurn > 0) {
        const penaltyValue = Math.round(10 * vehicle.stats.blockingThisTurn * state.scenario.penaltyMultiplier);
        const penalty = -penaltyValue;
        state.balance += penalty;
        state.penalties += penalty;
        logEvent(`${vehicle.name}: штраф за блокировку ${penalty}₵.`);
      }
      vehicle.stats.blockingThisTurn = 0;
    });
  }

  function completeRoute(vehicle) {
    const distance = vehicle.stats.distance;
    const turns = vehicle.stats.turns;
    const base = 100 + 5 * distance;
    const speedBonus = Math.max(0, 20 - turns) * 2;
    const cleanMultiplier = vehicle.stats.clean ? 1.2 : 1;
    const payout = Math.round((base + speedBonus) * cleanMultiplier);
    state.balance += payout;
    state.income += payout;
    state.completedRoutes += 1;
    logEvent(`${vehicle.name} завершила рейс: +${payout}₵ (дистанция ${distance}, ходов ${turns}).`);
    assignNewDestination(vehicle);
  }

  function updateUI() {
    dom.turnValue.textContent = state.turn;
    dom.turnLimit.textContent = state.limit;
    dom.turnsRemaining.textContent = Math.max(0, state.limit - state.turn);
    dom.balanceValue.textContent = state.balance;
    dom.incomeValue.textContent = `${state.income}₵`;
    dom.penaltyValue.textContent = `${state.penalties}₵`;
    dom.routeSummary.textContent = `${state.completedRoutes} завершено`;
    updateVehicleList();
    updateActionQueue();
    updateLog();
  }

  function updateVehicleList() {
    dom.vehicleList.innerHTML = '';
    state.vehicles.forEach((vehicle) => {
      const card = document.createElement('article');
      card.className = 'vehicle-card';
      if (state.selection?.id === vehicle.id) card.classList.add('active');
      const header = document.createElement('header');
      const title = document.createElement('strong');
      title.textContent = vehicle.name;
      const badge = document.createElement('span');
      badge.textContent = vehicle.destination ? labelForNode(vehicle.destination) : '—';
      header.append(title, badge);
      const meta = document.createElement('div');
      meta.className = 'vehicle-meta';
      meta.innerHTML = `
        <span>Позиция: ${labelForNode(vehicle.node)}</span>
        <span>Дистанция: ${vehicle.stats.distance}</span>
        <span>Ходы в рейсе: ${vehicle.stats.turns}</span>
        <span>Маршрут: ${Math.max(0, vehicle.routeSegments.length - 1)} ребёр</span>
      `;
      card.append(header, meta);
      card.addEventListener('click', () => selectVehicle(vehicle.id));
      dom.vehicleList.appendChild(card);
    });
  }

  function updateActionQueue() {
    dom.actionQueue.innerHTML = '';
    const entries = [];
      state.pendingActions.routeEdits.forEach((action) => {
        const vehicle = state.vehicles.find((v) => v.id === action.vehicleId);
        if (!vehicle) return;
        const length = Math.max(0, action.segments.length - 1);
        entries.push(`Маршрут ${vehicle.name} обновится на ${length} рёбер.`);
      });
    state.pendingActions.signalSwitches.forEach((action) => {
      const node = state.graph.nodes.get(action.nodeId);
      if (!node) return;
      entries.push(`Светофор «${node.label}» переключится.`);
    });
    state.pendingActions.oneWays.forEach((action) => {
      const [from, to] = action.allowed.split('>');
      entries.push(`Одностороннее движение: ${labelForNode(from)} → ${labelForNode(to)}.`);
    });
    if (entries.length === 0) {
      const placeholder = document.createElement('li');
      placeholder.textContent = 'На следующий ход действий не запланировано.';
      dom.actionQueue.appendChild(placeholder);
    } else {
      entries.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        dom.actionQueue.appendChild(li);
      });
    }
  }

  function updateLog() {
    dom.log.innerHTML = '';
    state.logs.slice(-40).forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = entry;
      dom.log.appendChild(div);
    });
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function logEvent(text) {
    state.logs.push(`Ход ${state.turn}: ${text}`);
    updateLog();
  }

  function showNpcForecast(npc) {
    if (!npc.path || npc.path.length === 0) return;
    const upcoming = npc.path.slice(npc.pathIndex, npc.pathIndex + NPC_LOOKAHEAD + 1);
    state.npcPreview = { path: upcoming };
    const labels = upcoming.slice(1).map(labelForNode);
    const eta = Math.max(0, upcoming.length - 1);
    const message = labels.length > 0
      ? `NPC из «${labelForNode(npc.node)}» направляется: ${labels.join(' → ')} (ETA ${eta} ходов).`
      : `NPC ожидает на «${labelForNode(npc.node)}».`;
    setStatus(message);
  }

  function toggleHelp(show) {
    if (show) {
      dom.helpOverlay.classList.remove('hidden');
    } else {
      dom.helpOverlay.classList.add('hidden');
    }
  }

  function labelForNode(nodeId) {
    const node = state.graph.nodes.get(nodeId);
    return node ? node.label : nodeId;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shuffled(source) {
    const copy = [...source];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
