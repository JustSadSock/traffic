const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TURN_LIMIT = 30;
const PLAYER_COLORS = ['#ff8ba7', '#70d6ff', '#ffd166', '#6ef2a5'];
const VEHICLE_EMOJIS = ['①', '②'];

const MAP = {
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

const app = express();
app.use(express.static(path.join(__dirname, '..')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clientCounter = 1;
const clients = new Map(); // ws -> { id, roomCode }
const rooms = new Map(); // code -> room

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

function shortestPath(start, goal) {
  if (start === goal) return [start];
  const queue = [start];
  const visited = new Set([start]);
  const prev = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (current === goal) break;
    for (const neighbor of graph.get(current).neighbors) {
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

function randomDestination(exclude) {
  const options = DELIVERY_POINTS.filter((d) => d.node !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

function createVehicle(player, index, startNode) {
  const dest = randomDestination(startNode);
  return {
    id: `${player.id}-${index + 1}`,
    ownerId: player.id,
    order: index + 1,
    label: `${player.name} ${VEHICLE_EMOJIS[index] || index + 1}`,
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
    pendingStop: vehicle.pendingStop,
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
  };
  rooms.set(code, room);
  const player = addPlayer(room, socket, name, true);
  clients.set(socket, { id: player.id, roomCode: code });
  return room;
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
  room.vehicles = [];
  room.players.forEach((player, index) => {
    player.deliveries = 0;
    player.score = 0;
    const pair = START_SETS[index % START_SETS.length];
    pair.forEach((startNode, idx) => {
      const vehicle = createVehicle(player, idx, startNode);
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
    message: `Игра началась! Ходит ${playerById(room, room.activePlayerId)?.name || 'ведущий'}.`,
  }));
}

function playerById(room, id) {
  return room.players.find((p) => p.id === id);
}

function vehicleById(room, id) {
  return room.vehicles.find((v) => v.id === id);
}

function validatePath(vehicle, path) {
  if (!Array.isArray(path) || path.length < 2) return false;
  if (path[0] !== vehicle.current) return false;
  if (path[path.length - 1] !== vehicle.goal) return false;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!graph.get(a).neighbors.has(b)) return false;
  }
  return true;
}

function applyRoute(room, payload) {
  const vehicle = vehicleById(room, payload.vehicle);
  if (!vehicle) return { ok: false, message: 'Маршрутка не найдена' };
  if (!validatePath(vehicle, payload.path)) return { ok: false, message: 'Маршрут недействителен' };
  vehicle.route = payload.path.slice(1);
  vehicle.history = payload.path.slice();
  return { ok: true, message: `${vehicle.label} получил новый маршрут.` };
}

function applyStop(room, payload) {
  const vehicle = vehicleById(room, payload.vehicle);
  if (!vehicle) return { ok: false, message: 'Маршрутка не найдена' };
  const amount = Math.max(1, Math.min(5, Number(payload.amount) || 1));
  vehicle.pendingStop += amount;
  return { ok: true, message: `${vehicle.label} задержится на ${amount} ход(ов).` };
}

function advanceRoom(room) {
  room.turn += 1;
  const events = [];
  for (const vehicle of room.vehicles) {
    if (vehicle.pendingStop > 0) {
      vehicle.waiting += vehicle.pendingStop;
      events.push(`${vehicle.label} запланировал ожидание на ${vehicle.pendingStop} ход(ов).`);
      vehicle.pendingStop = 0;
    }
    if (vehicle.waiting > 0) {
      vehicle.waiting -= 1;
      events.push(`${vehicle.label} стоит на узле ${vehicle.current}.`);
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
  const dest = randomDestination(vehicle.goal);
  vehicle.goal = dest.node;
  vehicle.goalInfo = dest;
  vehicle.route = [];
  vehicle.history = [];
}

function broadcastState(room, message) {
  broadcast(room, 'state', (id) => ({
    turn: room.turn,
    turnLimit: room.turnLimit,
    players: serializePlayers(room.players),
    vehicles: serializeVehicles(room),
    active: room.activePlayerId,
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
      if (action === 'create') {
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
  console.log(`Маршрутчики слушают на http://localhost:${PORT}`);
});
