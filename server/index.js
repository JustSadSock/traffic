const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TURN_LIMIT = 40;
const PASSENGER_VALUE = 12;
const PASSENGER_LIFETIME = 10;
const COLORS = ['#f94144', '#277da1', '#f9c74f', '#90be6d'];

const app = express();
app.use(express.static(path.join(__dirname, '..')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clientCounter = 1;
const clients = new Map(); // ws -> { id, roomCode }
const rooms = new Map(); // code -> room

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (rooms.has(code)) return createRoomCode();
  return code;
}

function createMapConfig() {
  return { width: 6, height: 5, spacing: 140, margin: 110 };
}

function generateNodes(map) {
  const nodes = [];
  const { width, height, spacing, margin } = map;
  let id = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      nodes.push({
        id: id++,
        x: margin + x * spacing,
        y: margin + y * spacing,
        neighbors: new Set(),
      });
    }
  }
  const index = (x, y) => y * width + x;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const node = nodes[index(x, y)];
      if (x < width - 1) {
        const right = nodes[index(x + 1, y)];
        node.neighbors.add(right.id);
        right.neighbors.add(node.id);
      }
      if (y < height - 1) {
        const down = nodes[index(x, y + 1)];
        node.neighbors.add(down.id);
        down.neighbors.add(node.id);
      }
    }
  }
  return nodes;
}

function serializePlayers(players) {
  return players.map(({ id, name, color, type, position, score, deliveries }) => ({
    id,
    name,
    color,
    type,
    position,
    score,
    deliveries,
  }));
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(room, type, payload) {
  for (const player of room.players) {
    const client = room.clientSockets.get(player.id);
    if (client) send(client, type, payload);
  }
}

function randomNodeId(room) {
  const idx = Math.floor(Math.random() * room.mapNodes.length);
  return room.mapNodes[idx].id;
}

function createRoom({ hostId, hostSocket, name, maxPlayers }) {
  const code = createRoomCode();
  const room = {
    code,
    hostId,
    maxPlayers: Math.max(2, Math.min(4, maxPlayers || 4)),
    players: [],
    state: 'lobby',
    mapConfig: createMapConfig(),
    mapNodes: null,
    passengers: [],
    turn: 1,
    currentPlayerIndex: 0,
    clientSockets: new Map(),
  };
  room.mapNodes = generateNodes(room.mapConfig);
  rooms.set(code, room);
  addPlayerToRoom(room, hostId, hostSocket, name, true);
  return room;
}

function addPlayerToRoom(room, playerId, socket, name, isHost = false) {
  if (room.players.length >= room.maxPlayers) {
    throw new Error('Лобби заполнено');
  }
  const color = COLORS[room.players.length % COLORS.length];
  let position = randomNodeId(room);
  const taken = new Set(room.players.map((p) => p.position));
  let attempts = 0;
  while (taken.has(position) && attempts < 20) {
    position = randomNodeId(room);
    attempts++;
  }
  const player = {
    id: playerId,
    name,
    color,
    type: 'remote',
    position,
    score: 0,
    deliveries: 0,
    ready: isHost,
  };
  room.players.push(player);
  room.clientSockets.set(playerId, socket);
  return player;
}

function removePlayer(room, playerId) {
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx >= 0) {
    room.players.splice(idx, 1);
    room.clientSockets.delete(playerId);
  }
  if (!room.players.length) {
    rooms.delete(room.code);
  }
}

function startRoomGame(room) {
  if (room.players.length < 2) {
    throw new Error('Нужно минимум два игрока');
  }
  room.state = 'running';
  room.turn = 1;
  room.currentPlayerIndex = 0;
  room.passengers = [];
  for (const player of room.players) {
    player.score = 0;
    player.deliveries = 0;
    player.position = randomNodeId(room);
  }
  const passengerSlots = Math.min(3, room.players.length * 2);
  for (let i = 0; i < passengerSlots; i++) {
    spawnPassenger(room);
  }
  const payload = {
    map: room.mapConfig,
    players: serializePlayers(room.players),
    passengers: room.passengers.map((p) => p.nodeId),
    turn: room.turn,
    maxTurns: TURN_LIMIT,
    difficulty: 'online',
  };
  for (const player of room.players) {
    const socket = room.clientSockets.get(player.id);
    if (socket) {
      send(socket, 'gameStart', { ...payload, you: player.id });
    }
  }
  broadcast(room, 'lobbyUpdate', { players: room.players });
}

function spawnPassenger(room) {
  const taken = new Set(room.players.map((p) => p.position));
  for (const passenger of room.passengers) taken.add(passenger.nodeId);
  const candidates = room.mapNodes.filter((node) => !taken.has(node.id));
  if (!candidates.length) return;
  const node = candidates[Math.floor(Math.random() * candidates.length)];
  room.passengers.push({ nodeId: node.id, timer: PASSENGER_LIFETIME });
}

function advanceTurn(room) {
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  if (room.currentPlayerIndex === 0) {
    room.turn += 1;
    for (const passenger of room.passengers) passenger.timer -= 1;
    room.passengers = room.passengers.filter((p) => p.timer > 0);
    if (Math.random() < 0.6) spawnPassenger(room);
    if (room.turn > TURN_LIMIT) {
      finishRoom(room);
    }
  }
}

function finishRoom(room) {
  room.state = 'finished';
  const ranking = [...room.players].sort((a, b) => b.score - a.score);
  broadcast(room, 'stateUpdate', {
    players: serializePlayers(room.players),
    passengers: room.passengers.map((p) => p.nodeId),
    turn: room.turn,
    currentPlayerIndex: room.currentPlayerIndex,
  });
  broadcast(room, 'gameOver', {
    winner: ranking[0]?.name || '—',
  });
}

wss.on('connection', (ws) => {
  const clientId = `c${clientCounter++}`;
  clients.set(ws, { id: clientId, roomCode: null });
  send(ws, 'hello', { clientId });

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      return;
    }
    const meta = clients.get(ws);
    if (!meta) return;
    switch (data.type) {
      case 'createRoom': {
        const name = String(data.payload?.name || 'Хост').slice(0, 24);
        const maxPlayers = Number(data.payload?.maxPlayers || 4);
        const room = createRoom({ hostId: meta.id, hostSocket: ws, name, maxPlayers });
        meta.roomCode = room.code;
        send(ws, 'roomCreated', { code: room.code, players: room.players, isHost: true });
        break;
      }
      case 'joinRoom': {
        const code = String(data.payload?.code || '').toUpperCase();
        const name = String(data.payload?.name || 'Игрок').slice(0, 24);
        const room = rooms.get(code);
        if (!room) {
          send(ws, 'error', { message: 'Лобби не найдено' });
          return;
        }
        if (room.state !== 'lobby') {
          send(ws, 'error', { message: 'Игра уже идёт' });
          return;
        }
        try {
          addPlayerToRoom(room, meta.id, ws, name, false);
          meta.roomCode = room.code;
          send(ws, 'joined', { code: room.code, players: room.players });
          broadcast(room, 'lobbyUpdate', { players: room.players });
        } catch (err) {
          send(ws, 'error', { message: err.message });
        }
        break;
      }
      case 'startGame': {
        const room = rooms.get(meta.roomCode);
        if (!room) return;
        if (room.hostId !== meta.id) {
          send(ws, 'error', { message: 'Только хост может запустить игру' });
          return;
        }
        try {
          startRoomGame(room);
        } catch (err) {
          send(ws, 'error', { message: err.message });
        }
        break;
      }
      case 'makeMove': {
        const room = rooms.get(meta.roomCode);
        if (!room || room.state !== 'running') return;
        const playerIndex = room.players.findIndex((p) => p.id === meta.id);
        if (playerIndex !== room.currentPlayerIndex) {
          send(ws, 'error', { message: 'Сейчас не ваш ход' });
          return;
        }
        const targetNodeId = Number(data.payload?.targetNodeId);
        const player = room.players[playerIndex];
        const currentNode = room.mapNodes[player.position];
        if (!currentNode.neighbors.has(targetNodeId)) {
          send(ws, 'error', { message: 'Недопустимый ход' });
          return;
        }
        player.position = targetNodeId;
        const passengerIndex = room.passengers.findIndex((p) => p.nodeId === targetNodeId);
        if (passengerIndex >= 0) {
          player.score += PASSENGER_VALUE;
          player.deliveries += 1;
          room.passengers.splice(passengerIndex, 1);
        }
        advanceTurn(room);
        broadcast(room, 'stateUpdate', {
          players: serializePlayers(room.players),
          passengers: room.passengers.map((p) => p.nodeId),
          turn: room.turn,
          currentPlayerIndex: room.currentPlayerIndex,
        });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (!meta) return;
    if (meta.roomCode) {
      const room = rooms.get(meta.roomCode);
      if (room) {
        removePlayer(room, meta.id);
        broadcast(room, 'lobbyUpdate', { players: room.players });
      }
    }
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Маршрутчики сервер запущен на http://localhost:${PORT}`);
});
