(function () {
  const COLORS = ["#f94144", "#277da1", "#f9c74f", "#90be6d"];
  const TURN_LIMIT = 40;
  const PASSENGER_VALUE = 12;
  const PASSENGER_LIFETIME = 10;
  const AI_DELAY_MS = 600;

  const Mode = {
    Solo: "solo",
    Local: "local",
    Online: "online",
  };

  const DIFFICULTY_LABELS = {
    normal: "Нормальная",
    hard: "Сложная",
    relaxed: "Спокойная",
  };

  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  class EventBus {
    constructor() {
      this.listeners = new Map();
    }
    on(event, cb) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(cb);
      return () => this.off(event, cb);
    }
    off(event, cb) {
      const set = this.listeners.get(event);
      if (set) set.delete(cb);
    }
    emit(event, payload) {
      const set = this.listeners.get(event);
      if (!set) return;
      for (const cb of Array.from(set)) cb(payload);
    }
  }

  class GameMap {
    constructor({ width, height, spacing = 140, margin = 120 }) {
      this.width = width;
      this.height = height;
      this.spacing = spacing;
      this.margin = margin;
      this.nodes = [];
      this._generate();
    }
    _generate() {
      const { width, height, spacing, margin } = this;
      let id = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          this.nodes.push({
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
          const node = this.nodes[index(x, y)];
          if (x < width - 1) {
            const right = this.nodes[index(x + 1, y)];
            node.neighbors.add(right.id);
            right.neighbors.add(node.id);
          }
          if (y < height - 1) {
            const down = this.nodes[index(x, y + 1)];
            node.neighbors.add(down.id);
            down.neighbors.add(node.id);
          }
        }
      }
    }
    getNode(id) {
      return this.nodes[id];
    }
    neighborsOf(id) {
      return Array.from(this.getNode(id).neighbors);
    }
    randomNode() {
      return randChoice(this.nodes);
    }
    toJSON() {
      return {
        width: this.width,
        height: this.height,
        spacing: this.spacing,
        margin: this.margin,
      };
    }
    static fromJSON(json) {
      const map = new GameMap(json);
      return map;
    }
    findNodeAt(x, y) {
      let closest = null;
      let dist = Infinity;
      for (const node of this.nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        const d = Math.hypot(dx, dy);
        if (d < dist) {
          dist = d;
          closest = node;
        }
      }
      if (closest && dist <= this.spacing * 0.6) return closest;
      return null;
    }
  }

  class PlayerState {
    constructor({ id, name, color, type, position }) {
      this.id = id;
      this.name = name;
      this.color = color;
      this.type = type; // "human" | "npc" | "remote"
      this.position = position;
      this.score = 0;
      this.deliveries = 0;
    }
  }

  class Passenger {
    constructor(nodeId) {
      this.nodeId = nodeId;
      this.timer = PASSENGER_LIFETIME;
    }
  }

  class TrafficGame {
    constructor({ map, mode, players, difficulty = "normal", eventBus, preloaded = false }) {
      this.map = map;
      this.mode = mode;
      this.players = players;
      this.difficulty = difficulty;
      this.turn = 1;
      this.maxTurns = TURN_LIMIT;
      this.currentPlayerIndex = 0;
      this.passengers = [];
      this.state = "setup"; // setup | running | finished
      this.bus = eventBus || new EventBus();
      this.logEntries = [];
      this.pendingAI = null;
      this.remoteController = null;
      this.preloaded = preloaded;
      this.localPlayerId = null;
    }
    setRemoteController(ctrl) {
      this.remoteController = ctrl;
    }
    on(event, cb) {
      return this.bus.on(event, cb);
    }
    emit(event, payload) {
      this.bus.emit(event, payload);
    }
    start() {
      this.state = "running";
      this.emit("state", this.state);
      this.emit("turn", { turn: this.turn, limit: this.maxTurns });
      if (!this.preloaded) {
        for (let i = 0; i < Math.min(3, this.players.length * 2); i++) {
          this.spawnPassenger();
        }
      } else {
        this.emit("passengers", this.passengers);
      }
      this.updateActivePlayer();
      this.log("Игра началась. Удачи, диспетчеры!");
    }
    updateActivePlayer() {
      const player = this.players[this.currentPlayerIndex];
      this.emit("activePlayer", player);
      this.emit("players", this.players);
      this.emit("passengers", this.passengers);
      if (player.type === "npc" && this.state === "running") {
        this.queueAIMove(player);
      }
    }
    queueAIMove(player) {
      clearTimeout(this.pendingAI);
      this.pendingAI = setTimeout(() => {
        if (this.state !== "running") return;
        const neighbors = this.map.neighborsOf(player.position);
        if (!neighbors.length) {
          this.endTurn();
          return;
        }
        const target = randChoice(neighbors);
        this.movePlayer(player, target);
      }, AI_DELAY_MS);
    }
    spawnPassenger() {
      const taken = new Set(this.players.map((p) => p.position));
      for (const passenger of this.passengers) taken.add(passenger.nodeId);
      const available = this.map.nodes.filter((n) => !taken.has(n.id));
      if (!available.length) return;
      const node = randChoice(available);
      const passenger = new Passenger(node.id);
      this.passengers.push(passenger);
      this.emit("passengers", this.passengers);
      this.log(`На узле ${node.id + 1} появился пассажир.`);
    }
    movePlayer(player, targetNodeId) {
      if (this.state !== "running") return false;
      if (!this.map.getNode(targetNodeId)) return false;
      if (!this.map.getNode(player.position).neighbors.has(targetNodeId)) return false;
      player.position = targetNodeId;
      this.emit("players", this.players);
      const passenger = this.passengers.find((p) => p.nodeId === targetNodeId);
      if (passenger) {
        player.score += PASSENGER_VALUE;
        player.deliveries += 1;
        this.passengers = this.passengers.filter((p) => p !== passenger);
        this.emit("passengers", this.passengers);
        const node = this.map.getNode(targetNodeId);
        this.log(`${player.name} подобрал пассажира на узле ${node.id + 1}. +${PASSENGER_VALUE}₵`);
      } else {
        this.log(`${player.name} переехал на узел ${targetNodeId + 1}.`);
      }
      this.endTurn();
      return true;
    }
    endTurn() {
      if (this.state !== "running") return;
      clearTimeout(this.pendingAI);
      this.emit("turnEnd", { turn: this.turn, player: this.players[this.currentPlayerIndex] });
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      if (this.currentPlayerIndex === 0) {
        this.turn += 1;
        this.emit("turn", { turn: this.turn, limit: this.maxTurns });
        for (const passenger of this.passengers) {
          passenger.timer -= 1;
        }
        const expired = this.passengers.filter((p) => p.timer <= 0);
        if (expired.length) {
          for (const p of expired) this.log(`Пассажир на узле ${p.nodeId + 1} устал ждать и ушёл.`);
          this.passengers = this.passengers.filter((p) => p.timer > 0);
          this.emit("passengers", this.passengers);
        }
        if (Math.random() < 0.6) this.spawnPassenger();
        if (this.turn > this.maxTurns) {
          this.finishGame();
          return;
        }
      }
      this.updateActivePlayer();
    }
    finishGame() {
      this.state = "finished";
      clearTimeout(this.pendingAI);
      this.emit("state", this.state);
      this.emit("players", this.players);
      const winner = [...this.players].sort((a, b) => b.score - a.score)[0];
      if (winner) {
        this.log(`Раунд завершён! Победитель: ${winner.name} (${winner.score}₵).`);
      } else {
        this.log("Раунд завершён!");
      }
    }
    log(message) {
      const entry = { message, ts: Date.now() };
      this.logEntries.push(entry);
      this.emit("log", entry);
    }
  }

  class Renderer {
    constructor(canvas, map, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.map = map;
      this.game = game;
      this.hoverNode = null;
      this.selection = null;
      this.devicePixelRatio = window.devicePixelRatio || 1;
      this.resizeCanvas();
      window.addEventListener("resize", () => this.resizeCanvas());
      canvas.addEventListener("mousemove", (e) => this.handleMove(e));
      canvas.addEventListener("mouseleave", () => { this.hoverNode = null; });
    }
    resizeCanvas() {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = this.devicePixelRatio;
      this.canvas.width = rect.width * ratio;
      this.canvas.height = rect.height * ratio;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.draw();
    }
    attach(game) {
      this.game = game;
      this.draw();
    }
    setHover(node) {
      this.hoverNode = node;
      this.draw();
    }
    setSelection(node) {
      this.selection = node;
      this.draw();
    }
    handleMove(e) {
      if (!this.map) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = this.map.findNodeAt(x, y);
      this.hoverNode = node ? node.id : null;
      this.draw();
    }
    draw() {
      const ctx = this.ctx;
      if (!ctx || !this.map) return;
      const { width, height } = this.canvas;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.restore();

      ctx.save();
      ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

      ctx.fillStyle = "#0f1724";
      ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

      ctx.strokeStyle = "rgba(80,100,130,0.55)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      for (const node of this.map.nodes) {
        for (const neighborId of node.neighbors) {
          if (neighborId < node.id) continue;
          const neighbor = this.map.getNode(neighborId);
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(neighbor.x, neighbor.y);
          ctx.stroke();
        }
      }

      for (const passenger of this.game.passengers) {
        const node = this.map.getNode(passenger.nodeId);
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#ffd166";
        ctx.arc(node.x, node.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0d1320";
        ctx.font = "600 14px Rubik, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${passenger.timer}`, node.x, node.y);
      }

      if (this.hoverNode !== null) {
        const node = this.map.getNode(this.hoverNode);
        ctx.beginPath();
        ctx.fillStyle = "rgba(76,201,240,0.18)";
        ctx.arc(node.x, node.y, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.selection !== null) {
        const node = this.map.getNode(this.selection);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(72,149,239,0.9)";
        ctx.lineWidth = 4;
        ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const node of this.map.nodes) {
        ctx.beginPath();
        ctx.fillStyle = "#1f2937";
        ctx.arc(node.x, node.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const player of this.game.players) {
        const node = this.map.getNode(player.position);
        ctx.beginPath();
        ctx.fillStyle = player.color;
        ctx.arc(node.x, node.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.font = "600 13px Rubik, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.name[0].toUpperCase(), node.x, node.y + 1);
      }

      ctx.restore();
    }
  }

  class UIController {
    constructor(game) {
      this.game = game;
      this.turnEl = document.getElementById("turnValue");
      this.turnLimitEl = document.getElementById("turnLimit");
      this.activePlayerEl = document.getElementById("activePlayer");
      this.passengerEl = document.getElementById("passengerCount");
      this.roundSummaryEl = document.getElementById("roundSummary");
      this.difficultyEl = document.getElementById("difficultySummary");
      this.modeLabelEl = document.getElementById("modeLabel");
      this.playerListEl = document.getElementById("playerList");
      this.logEl = document.getElementById("log");
      this.bind();
    }
    bind() {
      this.game.on("turn", ({ turn, limit }) => {
        this.turnEl.textContent = turn;
        this.turnLimitEl.textContent = limit;
      });
      this.game.on("players", (players) => {
        this.updatePlayerList(players);
      });
      this.game.on("activePlayer", (player) => {
        this.activePlayerEl.textContent = player.name;
      });
      this.game.on("passengers", (passengers) => {
        this.passengerEl.textContent = passengers.length;
      });
      this.game.on("log", (entry) => {
        const div = document.createElement("div");
        div.className = "log-entry";
        const time = new Date(entry.ts).toLocaleTimeString();
        div.textContent = `[${time}] ${entry.message}`;
        this.logEl.appendChild(div);
        this.logEl.scrollTop = this.logEl.scrollHeight;
      });
    }
    updatePlayerList(players) {
      this.playerListEl.innerHTML = "";
      for (const player of players) {
        const li = document.createElement("li");
        const left = document.createElement("div");
        const badge = document.createElement("span");
        badge.className = "player-badge";
        badge.style.background = player.color;
        const name = document.createElement("span");
        name.textContent = player.name;
        left.appendChild(badge);
        left.appendChild(name);
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "0.5rem";
        const right = document.createElement("div");
        right.innerHTML = `<strong>${player.score}₵</strong><br/><small>${player.deliveries} пасс.</small>`;
        li.appendChild(left);
        li.appendChild(right);
        this.playerListEl.appendChild(li);
      }
    }
    setModeLabel(mode, extra = "") {
      const labels = {
        [Mode.Solo]: "Одиночный режим",
        [Mode.Local]: "Локальная партия",
        [Mode.Online]: "Онлайн матч",
      };
      this.modeLabelEl.textContent = labels[mode] + (extra ? ` — ${extra}` : "");
    }
    setDifficulty(label) {
      this.difficultyEl.textContent = label;
    }
    setRoundLabel(label) {
      this.roundSummaryEl.textContent = label;
    }
  }

  class OnlineClient extends EventBus {
    constructor(url) {
      super();
      this.url = url;
      this.ws = null;
      this.connected = false;
      this.clientId = null;
      this.roomCode = null;
    }
    ensureConnection() {
      if (this.ws && this.connected) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(this.url.replace(/^http/, "ws"));
        this.ws = ws;
        ws.addEventListener("open", () => {
          this.connected = true;
          this.emit("status", { type: "connected" });
          resolve();
        });
        ws.addEventListener("message", (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            console.error("WS message error", err);
          }
        });
        ws.addEventListener("close", () => {
          this.connected = false;
          this.emit("status", { type: "disconnected" });
        });
        ws.addEventListener("error", (err) => {
          reject(err);
        });
      });
    }
    handleMessage(data) {
      if (data.type === "hello") {
        this.clientId = data.clientId;
        return;
      }
      this.emit(data.type, data.payload || {});
    }
    send(type, payload) {
      if (!this.ws || !this.connected) return;
      this.ws.send(JSON.stringify({ type, payload }));
    }
    createRoom({ name, maxPlayers }) {
      return this.ensureConnection().then(() => {
        this.send("createRoom", { name, maxPlayers });
      });
    }
    joinRoom({ name, code }) {
      return this.ensureConnection().then(() => {
        this.send("joinRoom", { name, code });
      });
    }
    startGame() {
      this.send("startGame", {});
    }
    makeMove(targetNodeId) {
      this.send("makeMove", { targetNodeId });
    }
  }

  function setupLocalNames(form, defaultCount = 2) {
    const container = form.querySelector(".local-names");
    const render = (count) => {
      container.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const label = document.createElement("label");
        label.textContent = `Игрок ${i + 1}`;
        const input = document.createElement("input");
        input.type = "text";
        input.name = `player${i}`;
        input.value = `Игрок ${i + 1}`;
        container.appendChild(label);
        label.appendChild(input);
      }
    };
    render(defaultCount);
    form.elements.count.addEventListener("change", (e) => {
      render(Number(e.target.value));
    });
  }

  function buildPlayers({ mode, map, names, includeNPC = 0 }) {
    const players = [];
    let colorIndex = 0;
    for (const name of names) {
      const node = map.randomNode();
      players.push(new PlayerState({
        id: `p${players.length}`,
        name,
        color: COLORS[colorIndex % COLORS.length],
        type: "human",
        position: node.id,
      }));
      colorIndex += 1;
    }
    for (let i = 0; i < includeNPC; i++) {
      const node = map.randomNode();
      players.push(new PlayerState({
        id: `npc${i}`,
        name: `NPC ${i + 1}`,
        color: COLORS[(colorIndex + i) % COLORS.length],
        type: "npc",
        position: node.id,
      }));
    }
    return players;
  }

  function setupMenu({ startSolo, startLocal, startOnline }) {
    const overlay = document.getElementById("menuOverlay");
    const modeButtons = overlay.querySelectorAll(".mode-button");
    const forms = overlay.querySelectorAll(".mode-form");
    const showForm = (mode) => {
      forms.forEach((form) => {
        form.classList.toggle("active", form.dataset.mode === mode);
      });
    };

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        showForm(btn.dataset.mode);
      });
    });

    const soloForm = document.getElementById("soloForm");
    soloForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(soloForm);
      startSolo({
        name: data.get("name"),
        difficulty: data.get("difficulty"),
        npcCount: clamp(Number(data.get("npc")), 0, 5),
      });
      overlay.classList.remove("visible");
    });

    const localForm = document.getElementById("localForm");
    setupLocalNames(localForm, Number(localForm.elements.count.value));
    localForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(localForm);
      const count = Number(data.get("count"));
      const names = [];
      for (let i = 0; i < count; i++) {
        names.push(data.get(`player${i}`) || `Игрок ${i + 1}`);
      }
      startLocal({ names });
      overlay.classList.remove("visible");
    });

    const onlineForm = document.getElementById("onlineForm");
    const tabs = onlineForm.querySelectorAll(".online-tabs button");
    const panels = onlineForm.querySelectorAll(".online-panel");
    const statusEl = document.getElementById("onlineStatus");
    const lobbyEl = document.getElementById("onlineLobby");
    const lobbyCodeEl = document.getElementById("lobbyCode");
    const lobbyPlayersEl = document.getElementById("lobbyPlayers");
    const btnStartOnline = document.getElementById("btnStartOnline");

    const setTab = (tab) => {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
      panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab));
    };
    tabs.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    onlineForm.querySelector('[data-action="create"]').addEventListener("click", () => {
      const name = onlineForm.elements.hostName.value.trim() || "Хост";
      const maxPlayers = Number(onlineForm.elements.max.value);
      startOnline({
        mode: "create",
        name,
        maxPlayers,
        showLobby({ code, players, isHost }) {
          statusEl.classList.add("hidden");
          lobbyEl.classList.remove("hidden");
          lobbyCodeEl.textContent = code;
          renderLobbyPlayers(players);
          btnStartOnline.hidden = !isHost;
        },
        showStatus(text, isError = false) {
          statusEl.classList.remove("hidden");
          statusEl.classList.toggle("error", isError);
          statusEl.textContent = text;
        },
        onPlayersUpdate(players) {
          renderLobbyPlayers(players);
        },
        onGameStart() {
          overlay.classList.remove("visible");
        },
      });
    });

    onlineForm.querySelector('[data-action="join"]').addEventListener("click", () => {
      const name = onlineForm.elements.guestName.value.trim() || "Гость";
      const code = onlineForm.elements.code.value.trim().toUpperCase();
      startOnline({
        mode: "join",
        name,
        code,
        showLobby({ code, players }) {
          lobbyEl.classList.remove("hidden");
          lobbyCodeEl.textContent = code;
          renderLobbyPlayers(players);
          btnStartOnline.hidden = true;
        },
        showStatus(text, isError = false) {
          statusEl.classList.remove("hidden");
          statusEl.classList.toggle("error", isError);
          statusEl.textContent = text;
        },
        onPlayersUpdate(players) {
          renderLobbyPlayers(players);
        },
        onGameStart() {
          overlay.classList.remove("visible");
        },
      });
    });

    function renderLobbyPlayers(players) {
      lobbyPlayersEl.innerHTML = "";
      for (const player of players) {
        const li = document.createElement("li");
        li.innerHTML = `<span>${player.name}</span><span>${player.ready ? "готов" : "ожидаем"}</span>`;
        lobbyPlayersEl.appendChild(li);
      }
    }

    btnStartOnline.addEventListener("click", () => {
      startOnline({ mode: "start" });
    });

    document.getElementById("btnBackToMenu").addEventListener("click", () => {
      overlay.classList.add("visible");
    });
  }

  function init() {
    const canvas = document.getElementById("gameCanvas");
    const map = new GameMap({ width: 6, height: 5, spacing: 140, margin: 110 });
    const renderer = new Renderer(canvas, map, null);

    let currentGame = null;
    let uiController = null;
    let onlineClient = null;
    let clickHandler = null;

    function removeClickHandler() {
      if (clickHandler) {
        canvas.removeEventListener("click", clickHandler);
        clickHandler = null;
      }
    }

    function attachGame(game, options = {}) {
      removeClickHandler();
      currentGame = game;
      renderer.attach(game);
      renderer.setSelection(null);
      renderer.draw();
      uiController = new UIController(game);
      uiController.setModeLabel(game.mode, options.modeExtra || "");
      if (options.difficultyLabel) uiController.setDifficulty(options.difficultyLabel);
      if (options.roundLabel) uiController.setRoundLabel(options.roundLabel);
      game.on("players", () => renderer.draw());
      game.on("passengers", () => renderer.draw());
      game.on("activePlayer", (player) => {
        renderer.setSelection(player.position);
        removeClickHandler();
        if (game.mode === Mode.Online) {
          if (player.id === game.localPlayerId) {
            enableOnlineInteraction(player);
          }
        } else if (player.type === "human") {
          enableLocalInteraction(player);
        }
      });
      game.on("state", (state) => {
        if (state === "finished") {
          document.getElementById("menuOverlay").classList.add("visible");
        }
      });
      game.on("log", () => renderer.draw());
      renderer.draw();
      game.start();
    }

    function enableLocalInteraction(player) {
      removeClickHandler();
      const handler = (event) => {
        if (!currentGame || currentGame.state !== "running") return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const node = map.findNodeAt(x, y);
        if (!node) return;
        const isNeighbor = map.getNode(player.position).neighbors.has(node.id);
        if (!isNeighbor) return;
        const moved = currentGame.movePlayer(player, node.id);
        if (moved) {
          removeClickHandler();
        }
      };
      clickHandler = handler;
      canvas.addEventListener("click", handler);
    }

    function enableOnlineInteraction(player) {
      removeClickHandler();
      const controller = currentGame?.remoteController;
      if (!controller) return;
      const handler = (event) => {
        if (!currentGame || currentGame.state !== "running") return;
        if (currentGame.players[currentGame.currentPlayerIndex].id !== player.id) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const node = map.findNodeAt(x, y);
        if (!node) return;
        const isNeighbor = map.getNode(player.position).neighbors.has(node.id);
        if (!isNeighbor) return;
        controller.makeMove(node.id);
        removeClickHandler();
      };
      clickHandler = handler;
      canvas.addEventListener("click", handler);
    }

    setupMenu({
      startSolo: ({ name, difficulty, npcCount }) => {
        const players = buildPlayers({
          mode: Mode.Solo,
          map,
          names: [name],
          includeNPC: npcCount,
        });
        const game = new TrafficGame({ map, mode: Mode.Solo, players, difficulty });
        attachGame(game, {
          modeExtra: npcCount ? `NPC: ${npcCount}` : "",
          difficultyLabel: DIFFICULTY_LABELS[difficulty] || difficulty,
          roundLabel: `${TURN_LIMIT} ходов`,
        });
      },
      startLocal: ({ names }) => {
        const players = buildPlayers({ mode: Mode.Local, map, names });
        const game = new TrafficGame({ map, mode: Mode.Local, players, difficulty: "normal" });
        attachGame(game, {
          modeExtra: `${names.length} игрока`,
          difficultyLabel: DIFFICULTY_LABELS["normal"],
          roundLabel: `${TURN_LIMIT} ходов`,
        });
      },
      startOnline: (opts) => {
        if (opts.mode === "create" || opts.mode === "join") {
          if (onlineClient && onlineClient.ws) {
            try { onlineClient.ws.close(); } catch (err) { /* ignore */ }
          }
          onlineClient = new OnlineClient(`${location.origin}`);
        }
        if (opts.mode === "create") {
          opts.showStatus("Соединяемся…");
          onlineClient.createRoom({ name: opts.name, maxPlayers: opts.maxPlayers }).catch((err) => {
            opts.showStatus(`Ошибка: ${err.message}`, true);
          });
          onlineClient.on("roomCreated", ({ code, players, isHost }) => {
            opts.showLobby({ code, players, isHost });
          });
          onlineClient.on("lobbyUpdate", ({ players }) => {
            opts.onPlayersUpdate(players);
          });
          onlineClient.on("error", ({ message }) => {
            opts.showStatus(message, true);
          });
          onlineClient.on("gameStart", (payload) => {
            const game = prepareOnlineGame(payload, map, onlineClient);
            attachGame(game, {
              modeExtra: `${payload.players.length} игроков`,
              difficultyLabel: DIFFICULTY_LABELS[payload.difficulty] || payload.difficulty,
              roundLabel: `${payload.maxTurns} ходов`,
            });
            bindOnlineUpdates(game, onlineClient);
            opts.onGameStart();
          });
        } else if (opts.mode === "join") {
          opts.showStatus("Подключаемся…");
          onlineClient.joinRoom({ name: opts.name, code: opts.code }).catch((err) => {
            opts.showStatus(`Ошибка: ${err.message}`, true);
          });
          onlineClient.on("joined", ({ code, players }) => {
            opts.showLobby({ code, players });
          });
          onlineClient.on("lobbyUpdate", ({ players }) => {
            opts.onPlayersUpdate(players);
          });
          onlineClient.on("error", ({ message }) => {
            opts.showStatus(message, true);
          });
          onlineClient.on("gameStart", (payload) => {
            const game = prepareOnlineGame(payload, map, onlineClient);
            attachGame(game, {
              modeExtra: `${payload.players.length} игроков`,
              difficultyLabel: DIFFICULTY_LABELS[payload.difficulty] || payload.difficulty,
              roundLabel: `${payload.maxTurns} ходов`,
            });
            bindOnlineUpdates(game, onlineClient);
            opts.onGameStart();
          });
        } else if (opts.mode === "start") {
          onlineClient?.startGame();
        }
      },
    });

    document.getElementById("btnEndTurn").addEventListener("click", () => {
      if (!currentGame || currentGame.state !== "running") return;
      if (currentGame.mode === Mode.Online) return;
        currentGame.endTurn();
    });
  }

  function prepareOnlineGame(payload, map, onlineClient) {
    const serverMap = GameMap.fromJSON(payload.map);
    map.nodes = serverMap.nodes;
    map.width = serverMap.width;
    map.height = serverMap.height;
    map.spacing = serverMap.spacing;
    map.margin = serverMap.margin;

    const players = payload.players.map((p) => new PlayerState({
      id: p.id,
      name: p.name,
      color: p.color,
      type: p.type,
      position: p.position,
    }));

    const game = new TrafficGame({
      map,
      mode: Mode.Online,
      players,
      difficulty: payload.difficulty,
      preloaded: true,
    });
    game.passengers = payload.passengers.map((nodeId) => new Passenger(nodeId));
    game.turn = payload.turn;
    game.maxTurns = payload.maxTurns;
    game.currentPlayerIndex = payload.currentPlayerIndex || 0;
    game.localPlayerId = payload.you;
    game.setRemoteController(onlineClient);
    return game;
  }

  function bindOnlineUpdates(game, onlineClient) {
    onlineClient.on("stateUpdate", ({ players: playersData, passengers, turn, currentPlayerIndex }) => {
      game.players.forEach((player, idx) => {
        const source = playersData[idx];
        player.position = source.position;
        player.score = source.score;
        player.deliveries = source.deliveries;
      });
      game.passengers = passengers.map((nodeId) => new Passenger(nodeId));
      game.turn = turn;
      game.currentPlayerIndex = currentPlayerIndex;
      game.emit("players", game.players);
      game.emit("passengers", game.passengers);
      game.emit("turn", { turn: game.turn, limit: game.maxTurns });
      const active = game.players[currentPlayerIndex];
      if (active) {
        game.emit("activePlayer", active);
      }
    });
    onlineClient.on("gameOver", ({ winner }) => {
      game.state = "finished";
      game.emit("state", game.state);
      if (winner) {
        game.log(`Раунд завершён! Победитель: ${winner}.`);
      }
    });
    onlineClient.on("error", ({ message }) => {
      game.log(`Ошибка сервера: ${message}`);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
