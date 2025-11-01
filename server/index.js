const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
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

const app = express();
app.use(express.static(path.join(__dirname, '..')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clientCounter = 1;
const clients = new Map(); // ws -> { id, roomCode }
const rooms = new Map(); // code -> room

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

function distance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function generateCityMap() {
  const width = MAP_BOUNDS.width;
  const height = MAP_BOUNDS.height;
  const cols = 7;
  const rows = 5;
  const marginX = 80;
  const marginY = 90;
  const stepX = (width - marginX * 2) / (cols - 1);
  const stepY = (height - marginY * 2) / (rows - 1);
  const nodes = [];
  const adjacency = new Map();
  const nodeMap = new Map();
  let idCounter = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = `N${idCounter.toString().padStart(2, '0')}`;
      idCounter += 1;
      const jitterX = randomBetween(-stepX * 0.25, stepX * 0.25);
      const jitterY = randomBetween(-stepY * 0.25, stepY * 0.25);
      const x = marginX + col * stepX + jitterX;
      const y = marginY + row * stepY + jitterY;
      const node = { id, x, y };
      nodes.push(node);
      adjacency.set(id, new Set());
      nodeMap.set(id, node);
    }
  }

  const edges = [];
  const edgeSet = new Set();
  const EPSILON = 1e-6;
  const orientation = (p, q, r) => {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < EPSILON) return 0;
    return val > 0 ? 1 : 2;
  };
  const onSegment = (p, q, r) =>
    Math.min(p.x, r.x) - EPSILON <= q.x &&
    q.x <= Math.max(p.x, r.x) + EPSILON &&
    Math.min(p.y, r.y) - EPSILON <= q.y &&
    q.y <= Math.max(p.y, r.y) + EPSILON;
  const segmentsIntersect = (p1, p2, p3, p4) => {
    const o1 = orientation(p1, p2, p3);
    const o2 = orientation(p1, p2, p4);
    const o3 = orientation(p3, p4, p1);
    const o4 = orientation(p3, p4, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p3, p2)) return true;
    if (o2 === 0 && onSegment(p1, p4, p2)) return true;
    if (o3 === 0 && onSegment(p3, p1, p4)) return true;
    if (o4 === 0 && onSegment(p3, p2, p4)) return true;
    return false;
  };
  const wouldCross = (aId, bId) => {
    const pa = nodeMap.get(aId);
    const pb = nodeMap.get(bId);
    if (!pa || !pb) return true;
    for (const [cId, dId] of edges) {
      if (aId === cId || aId === dId || bId === cId || bId === dId) continue;
      const pc = nodeMap.get(cId);
      const pd = nodeMap.get(dId);
      if (!pc || !pd) continue;
      if (segmentsIntersect(pa, pb, pc, pd)) {
        return true;
      }
    }
    return false;
  };
  const addEdge = (a, b) => {
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) return;
    if (wouldCross(a, b)) return;
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
      if (row < rows - 1 && col < cols - 1 && Math.random() < 0.6) {
        addEdge(current.id, nodes[indexOf(row + 1, col + 1)]?.id);
      }
      if (row < rows - 1 && col > 0 && Math.random() < 0.45) {
        addEdge(current.id, nodes[indexOf(row + 1, col - 1)]?.id);
      }
    }
  }

  const typicalSpan = Math.hypot(stepX, stepY) * 1.2;
  const extras = Math.floor(nodes.length * 2.4);
  for (let i = 0; i < extras; i += 1) {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    if (!a) continue;
    const radius = typicalSpan * randomBetween(0.6, 1.5);
    const candidates = nodes
      .filter((node) => node.id !== a.id && distance(node, a) <= radius)
      .sort((node1, node2) => distance(node1, a) - distance(node2, a));
    if (!candidates.length) continue;
    const b = candidates[Math.floor(Math.random() * candidates.length)];
    addEdge(a.id, b.id);
  }

  for (const node of nodes) {
    const potentials = nodes
      .filter((other) => other.id !== node.id && !adjacency.get(node.id)?.has(other.id))
      .sort((a, b) => distance(a, node) - distance(b, node))
      .slice(0, 3);
    for (const candidate of potentials) {
      addEdge(node.id, candidate.id);
    }
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

function shortestPath(graph, start, goal) {
  if (!graph?.size) return null;
  if (start === goal) return [start];
  const queue = [start];
  const visited = new Set([start]);
  const prev = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (current === goal) break;
    for (const neighbor of graph.get(current)?.neighbors || []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      prev.set(neighbor, current);
      queue.push(neighbor);
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

function createRoundLayout() {
  const map = generateCityMap();
  const destinations = generateDestinations(map);
  return { map, destinations };
}

function pickStartingPairs(map, graph, playerCount) {
  const eligible = map.nodes.filter((node) => (graph.get(node.id)?.neighbors.size || 0) >= 2);
  const pool = eligible.length >= playerCount * 2 ? eligible : map.nodes;
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

function randomDestination(room, exclude) {
  const pool = room.destinations && room.destinations.length ? room.destinations : generateDestinations(room.map);
  const candidates = pool.filter((d) => d.node !== exclude);
  const source = candidates.length ? candidates : pool;
  if (!source.length) {
    const fallback = room.map?.nodes?.[0];
    return fallback
      ? { node: fallback.id, label: 'Финиш', color: '#ffd6a5', icon: '🏁' }
      : { node: exclude, label: 'Финиш', color: '#ffd6a5', icon: '🏁' };
  }
  return source[Math.floor(Math.random() * source.length)];
}

function createVehicle(room, player, index, startNode) {
  const starting = startNode || room.map.nodes[0]?.id;
  const dest = randomDestination(room, starting);
  return {
    id: `${player.id}-${index + 1}`,
    ownerId: player.id,
    order: index + 1,
    label: `${player.name} ${VEHICLE_EMOJIS[index] || index + 1}`,
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

function serializePlayers(players) {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    deliveries: player.deliveries,
    score: player.score,
  }));
}

function serializeVehicles(room) {
  return room.vehicles.map((vehicle) => ({
    id: vehicle.id,
    ownerId: vehicle.ownerId,
    order: vehicle.order,
    label: vehicle.label,
    color: vehicle.color,
    current: vehicle.current,
    goal: vehicle.goal,
    goalInfo: vehicle.goalInfo,
    route: vehicle.route.slice(),
    waiting: vehicle.waiting,
    stopOrders: Object.fromEntries(Object.entries(vehicle.stopOrders || {})),
    stepsTaken: vehicle.stepsTaken,
    history: vehicle.history.slice(),
  }));
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(room, type, payload) {
  for (const [id, socket] of room.sockets.entries()) {
    if (socket.readyState === socket.OPEN) {
      send(socket, type, payload(id));
    }
  }
}

function createRoom(socket, name) {
  const code = generateRoomCode();
  const room = {
    code,
    state: 'lobby',
    players: [],
    sockets: new Map(),
    hostId: null,
    turn: 0,
    turnLimit: TURN_LIMIT,
    activePlayerId: null,
    vehicles: [],
    map: null,
    graph: new Map(),
    destinations: [],
  };
  rooms.set(code, room);
  const player = addPlayer(room, socket, name, true);
  clients.set(socket, { id: player.id, roomCode: code });
  return room;
}

function findAutoRoom() {
  for (const room of rooms.values()) {
    if (room.state === 'lobby' && room.players.length < 4) {
      return room;
    }
  }
  return null;
}

function addPlayer(room, socket, name, isHost = false) {
  const id = `p${clientCounter++}`;
  const color = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
  const player = {
    id,
    name: name || `Игрок ${room.players.length + 1}`,
    color,
    deliveries: 0,
    score: 0,
  };
  room.players.push(player);
  room.sockets.set(id, socket);
  if (isHost || !room.hostId) {
    room.hostId = id;
  }
  clients.set(socket, { id, roomCode: room.code });
  return player;
}

function removePlayer(socket) {
  const info = clients.get(socket);
  if (!info) return;
  const room = rooms.get(info.roomCode);
  if (!room) {
    clients.delete(socket);
    return;
  }
  const player = playerById(room, info.id);
  const name = player?.name || 'Игрок';
  room.players = room.players.filter((p) => p.id !== info.id);
  room.sockets.delete(info.id);
  clients.delete(socket);
  if (!room.players.length) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === info.id) {
    room.hostId = room.players[0].id;
  }
  if (room.state === 'running') {
    room.state = 'lobby';
    room.vehicles = [];
    room.turn = 0;
    room.activePlayerId = room.hostId;
    room.map = null;
    room.graph = new Map();
    room.destinations = [];
  }
  notifyLobby(room, `${name} отключился.`);
}

function notifyLobby(room, message) {
  broadcast(room, 'lobby', (id) => ({
    you: id,
    code: room.code,
    players: serializePlayers(room.players),
    ready: room.players.length >= 2,
    host: room.hostId,
    message,
  }));
}

function startGame(room) {
  room.state = 'running';
  room.turn = 0;
  room.activePlayerId = room.hostId;
  const layout = createRoundLayout();
  room.map = layout.map;
  room.graph = buildGraph(room.map);
  room.destinations = layout.destinations;
  room.vehicles = [];
  const pairs = pickStartingPairs(room.map, room.graph, room.players.length);
  room.players.forEach((player, index) => {
    player.deliveries = 0;
    player.score = 0;
    const pair = pairs[index] || [];
    pair.forEach((startNode, idx) => {
      const vehicle = createVehicle(room, player, idx, startNode);
      room.vehicles.push(vehicle);
    });
  });
  broadcast(room, 'start', (id) => ({
    you: id,
    players: serializePlayers(room.players),
    vehicles: serializeVehicles(room),
    turn: room.turn,
    turnLimit: room.turnLimit,
    active: room.activePlayerId,
    map: room.map,
    destinations: room.destinations,
    message: `Игра началась! Ходит ${playerById(room, room.activePlayerId)?.name || 'ведущий'}.`,
  }));
}

function playerById(room, id) {
  return room.players.find((p) => p.id === id);
}

function vehicleById(room, id) {
  return room.vehicles.find((v) => v.id === id);
}

function validatePath(room, vehicle, path) {
  if (!Array.isArray(path) || path.length < 2) return false;
  if (path[0] !== vehicle.current) return false;
  if (path[path.length - 1] !== vehicle.goal) return false;
  const graph = room.graph;
  if (!graph?.size) return false;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!graph.get(a)?.neighbors.has(b)) return false;
  }
  return true;
}

function applyRoute(room, payload) {
  const vehicle = vehicleById(room, payload.vehicle);
  if (!vehicle) return { ok: false, message: 'Машина не найдена' };
  if (!validatePath(room, vehicle, payload.path)) return { ok: false, message: 'Маршрут недействителен' };
  vehicle.route = payload.path.slice(1);
  vehicle.history = payload.path.slice();
  return { ok: true, message: `${vehicle.label} получил новый маршрут.` };
}

function applyStop(room, payload) {
  const vehicle = vehicleById(room, payload.vehicle);
  if (!vehicle) return { ok: false, message: 'Машина не найдена' };
  const node = typeof payload.node === 'string' ? payload.node : null;
  if (!node || !room.graph.has(node)) {
    return { ok: false, message: 'Узел не найден' };
  }
  const amount = Math.max(1, Math.min(5, Number(payload.amount) || 1));
  if (!vehicle.stopOrders) vehicle.stopOrders = {};
  vehicle.stopOrders[node] = amount;
  return { ok: true, message: `${vehicle.label} поставит стоп на узле ${node} (${amount} ход(ов)).` };
}

function advanceRoom(room) {
  room.turn += 1;
  const events = [];
  for (const vehicle of room.vehicles) {
    if (vehicle.waiting > 0) {
      vehicle.waiting -= 1;
      events.push(`${vehicle.label} стоит на узле ${vehicle.current}.`);
      continue;
    }
    const plannedStop = vehicle.stopOrders ? vehicle.stopOrders[vehicle.current] : undefined;
    if (plannedStop) {
      vehicle.waiting = plannedStop - 1;
      delete vehicle.stopOrders[vehicle.current];
      events.push(`${vehicle.label} держит стоп на узле ${vehicle.current} (${plannedStop} ход(ов)).`);
      continue;
    }
    if (!vehicle.route.length) {
      events.push(`${vehicle.label} ждёт новый маршрут.`);
      continue;
    }
    const next = vehicle.route.shift();
    vehicle.current = next;
    vehicle.stepsTaken += 1;
    if (vehicle.current === vehicle.goal) {
      handleArrival(room, vehicle, events);
    }
  }
  let finished = false;
  let winnerMessage = '';
  if (room.turn >= room.turnLimit) {
    finished = true;
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    winnerMessage = winner
      ? `Партия завершена. Победитель: ${winner.name} (${winner.score} очков).`
      : 'Партия завершена.';
  } else {
    const idx = room.players.findIndex((p) => p.id === room.activePlayerId);
    room.activePlayerId = room.players[(idx + 1) % room.players.length].id;
  }
  return { events, finished, winnerMessage };
}

function handleArrival(room, vehicle, events) {
  const owner = playerById(room, vehicle.ownerId);
  if (!owner) return;
  owner.deliveries += 1;
  const gained = Math.max(10, 40 - vehicle.stepsTaken * 2);
  owner.score += gained;
  events.push(`${vehicle.label} завершил доставку (${gained} очков).`);
  vehicle.stepsTaken = 0;
  const dest = randomDestination(room, vehicle.goal);
  vehicle.goal = dest.node;
  vehicle.goalInfo = dest;
  vehicle.route = [];
  vehicle.history = [];
  vehicle.waiting = 0;
  vehicle.stopOrders = {};
}

function broadcastState(room, message) {
  broadcast(room, 'state', (id) => ({
    turn: room.turn,
    turnLimit: room.turnLimit,
    players: serializePlayers(room.players),
    vehicles: serializeVehicles(room),
    map: room.map,
    destinations: room.destinations,
    active: room.activePlayerId,
    you: id,
    message,
  }));
}

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      return;
    }
    if (data.type === 'hello') {
      const { name, action, room: code } = data.payload || {};
      if (action === 'auto') {
        let room = findAutoRoom();
        if (!room) {
          room = createRoom(ws, name);
          notifyLobby(room, `Лобби ${room.code}. Ждём соперников (2–4 игроков).`);
        } else {
          const player = addPlayer(room, ws, name, false);
          notifyLobby(room, `${player.name} подключился. Игроков: ${room.players.length}.`);
        }
      } else if (action === 'create') {
        const room = createRoom(ws, name);
        notifyLobby(room, `Лобби ${room.code}. Ждём соперников (2–4 игроков).`);
      } else if (action === 'join') {
        if (!code || !rooms.has(code)) {
          send(ws, 'error', 'Код лобби не найден.');
          return;
        }
        const room = rooms.get(code);
        if (room.players.length >= 4) {
          send(ws, 'error', 'Лобби уже заполнено.');
          return;
        }
        const player = addPlayer(room, ws, name, false);
        notifyLobby(room, `${player.name} подключился. Игроков: ${room.players.length}.`);
      }
      return;
    }

    const info = clients.get(ws);
    if (!info) {
      send(ws, 'error', 'Сначала выберите режим.');
      return;
    }
    const room = rooms.get(info.roomCode);
    if (!room) {
      send(ws, 'error', 'Лобби не найдено.');
      return;
    }

    if (data.type === 'update') {
      const payload = data.payload || {};
      if (payload.type === 'start') {
        if (room.state === 'lobby' && room.players.length >= 2 && room.hostId === info.id) {
          startGame(room);
        } else {
          send(ws, 'error', 'Нельзя начать игру.');
        }
        return;
      }
      if (room.state !== 'running') {
        send(ws, 'error', 'Игра ещё не запущена.');
        return;
      }
      let message = '';
      switch (payload.type) {
        case 'setRoute':
          const routeResult = applyRoute(room, payload);
          if (!routeResult.ok) {
            send(ws, 'error', routeResult.message);
            return;
          }
          message = routeResult.message;
          break;
        case 'stop':
          const stopResult = applyStop(room, payload);
          if (!stopResult.ok) {
            send(ws, 'error', stopResult.message);
            return;
          }
          message = stopResult.message;
          break;
        case 'advance': {
          if (room.activePlayerId !== info.id) {
            send(ws, 'error', 'Сейчас ход другого игрока.');
            return;
          }
          const result = advanceRoom(room);
          message = result.events.length ? result.events.join(' ') : `Ход ${room.turn} завершён.`;
          if (result.finished) {
            message = result.winnerMessage || message;
          }
          broadcastState(room, message);
          if (result.finished) {
            notifyLobby(room, `${message} Нажмите «Следующий ход», чтобы начать новую партию.`);
            room.state = 'lobby';
            room.vehicles = [];
            room.turn = 0;
            room.activePlayerId = room.hostId;
          }
          return;
        }
        default:
          message = '';
      }
      broadcastState(room, message);
    }
  });

  ws.on('close', () => removePlayer(ws));
});

server.listen(PORT, () => {
  console.log(`Trafficity слушает на http://localhost:${PORT}`);
});
