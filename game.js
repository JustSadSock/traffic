// Маршрутчики v0.2 — прототип.
// Один HTML + JS + CSS. Рендер через canvas. Минимально достаточный функционал.
// Ограничения: одиночная игра против «ничейного» трафика (NPC).

// -------------------- Утилиты --------------------
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }

// Простая очередь
class Queue {
  constructor() { this.a = []; this.b = 0; }
  enqueue(x) { this.a.push(x); }
  dequeue() { if (this.size() === 0) return undefined; const x = this.a[this.b++]; if (this.b*2 >= this.a.length){ this.a = this.a.slice(this.b); this.b = 0; } return x; }
  size() { return this.a.length - this.b; }
}

// -------------------- Граф дорог --------------------
class Node {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.neighbors = new Set(); // ids
    this.light = null; // TrafficLight, если перекресток
  }
}

class Edge {
  constructor(a, b) {
    this.a = a; this.b = b; // node ids
    this.oneWay = null; // { allowFrom: a|b, ttl: N, cd: M } если временный односторонний
    this.cd = 0; // кулдаун установки одностороннего
  }
  key() { return Edge.key(this.a, this.b); }
  static key(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
}

class TrafficLight {
  constructor(nodeId, axis) {
    // axis: массив пар направлений или просто 2 состояния
    this.nodeId = nodeId;
    this.timer = 3; // по умолчанию 3/3
    this.state = 0; // 0 или 1
    this.autoCycle = 3;
    this.cooldown = 0; // КД после ручного свитча
    this.lastManualTurn = -9999; // для удорожания в окне 10 ходов
  }
  tick() {
    if (--this.timer <= 0) {
      this.state = 1 - this.state;
      this.timer = this.autoCycle;
    }
    if (this.cooldown > 0) this.cooldown--;
  }
  manualSwitch(currentTurn) {
    if (this.cooldown > 0) return false;
    this.state = 1 - this.state;
    this.timer = this.autoCycle;
    this.cooldown = 3;
    this.lastManualTurn = currentTurn;
    return true;
  }
  // Разрешает ли проезд по направлению edgeDir ("a->b" или "b->a") относительно узла
  // Упрощение: разбиваем исходящие на 2 группы по угловому сектору
}

class Graph {
  constructor() {
    this.nodes = [];
    this.edges = new Map(); // key -> Edge
  }
  addNode(x, y) {
    const n = new Node(this.nodes.length, x, y);
    this.nodes.push(n);
    return n;
  }
  connect(aId, bId) {
    if (aId === bId) return;
    const key = Edge.key(aId, bId);
    if (this.edges.has(key)) return;
    this.nodes[aId].neighbors.add(bId);
    this.nodes[bId].neighbors.add(aId);
    this.edges.set(key, new Edge(aId, bId));
  }
  edge(a, b) { return this.edges.get(Edge.key(a, b)); }
}

// -------------------- Машины --------------------
class Car {
  constructor(id, owner, nodeId) {
    this.id = id;
    this.owner = owner; // 'player' | 'npc'
    this.nodeId = nodeId;
    this.route = []; // список nodeId, включая текущий как первый
    this.routeIndex = 0;
    this.wait = 0; // запланированные ожидания на текущем узле
    this.crashHold = 0; // простой после ДТП
    this.totalRouteLen = 0; // L
    this.travelTime = 0; // T
    this.targetId = null; // B
    this.readyToMoveEdge = null; // номер следующего узла для визуала
    this.lastPlannedLenPaid = 0; // сколько ребер оплачено последней правкой
    this.blockingPenalty = 0; // накоплено за блокировку
    this.predictedPath = null; // для NPC preview
  }
  atTarget() { return this.nodeId === this.targetId; }
}

// -------------------- Игра --------------------
class Game {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width; this.h = canvas.height;

    // Настройки
    this.turn = 1; this.turnLimit = 30;
    this.money = 0; this.trips = 0; this.penalties = 0;
    this.rules = {
      basePay: 100,
      perEdge: 5,
      speedBonusCap: 20,
      speedBonusPer: 2,
      cleanMult: 1.2,
      fineCrash: 100,
      fineRed: 30,
      fineBlock: 10,
      lightManualCostBase: 10,
      lightManualWindow: 10,
      oneWayCost: 15,
      oneWayTTL: 3,
      oneWayCD: 5,
      routeBaseRecalc: 5,
      routePerEdge: 1,
      autoCycle: 3,
      npcSpawnRate: 0.04, // * Nnodes per turn
      npcMaxFactor: 0.5
    };

    this.seed = Math.floor(Math.random()*1e9);
    this.random = Math.random;
    this.graph = new Graph();
    this.cars = [];
    this.playerCars = [];
    this.npcCars = [];
    this.intersections = []; // nodeIds with lights
    this.manualCostsBump = new Map(); // nodeId -> count within window

    this.actionsQueued = []; // применяются через 1 ход
    this.tool = 'route'; // route | light | oneway | wait
    this.hover = {nodeId: null, edge: null, carId: null};

    // UI refs
    this.turnEl = document.getElementById('turn');
    this.turnLimitEl = document.getElementById('turnLimit');
    this.moneyEl = document.getElementById('money');
    this.tripsEl = document.getElementById('trips');
    this.penaltiesEl = document.getElementById('penalties');

    this._bindUI();
    this._genMap();
    this._spawnPlayer();
    this._assignTargets();

    this._loop();
  }

  _bindUI() {
    const toolRoute = document.getElementById('toolRoute');
    const toolLight = document.getElementById('toolLight');
    const toolOneWay = document.getElementById('toolOneWay');
    const toolWait = document.getElementById('toolWait');
    const btnEndTurn = document.getElementById('btnEndTurn');
    const btnRecalc = document.getElementById('btnRecalc');
    const btnNewSeed = document.getElementById('btnNewSeed');

    const setTool = (t)=>{
      this.tool = t;
      [toolRoute,toolLight,toolOneWay,toolWait].forEach(b=>b.classList.remove('active'));
      if(t==='route') toolRoute.classList.add('active');
      if(t==='light') toolLight.classList.add('active');
      if(t==='oneway') toolOneWay.classList.add('active');
      if(t==='wait') toolWait.classList.add('active');
    };

    toolRoute.onclick = ()=> setTool('route');
    toolLight.onclick = ()=> setTool('light');
    toolOneWay.onclick = ()=> setTool('oneway');
    toolWait.onclick = ()=> setTool('wait');
    btnEndTurn.onclick = ()=> this.endTurn();
    btnRecalc.onclick = ()=> this.recalcPlayerRoutes();
    btnNewSeed.onclick = ()=> { this.newMap(); };

    this.cv.addEventListener('mousemove', (e)=>{
      const p = this._canvasToWorld(e.offsetX, e.offsetY);
      this._updateHover(p.x, p.y);
    });
    this.cv.addEventListener('mouseleave', ()=>{ this.hover = {nodeId:null,edge:null,carId:null}; });
    this.cv.addEventListener('click', (e)=>{
      const p = this._canvasToWorld(e.offsetX, e.offsetY);
      this._handleClick(p.x, p.y);
    });
  }

  newMap() {
    this.turn = 1; this.money = 0; this.trips = 0; this.penalties = 0;
    this.graph = new Graph();
    this.cars = []; this.playerCars = []; this.npcCars = [];
    this.intersections = [];
    this.manualCostsBump = new Map();
    this.actionsQueued = [];
    this.seed = Math.floor(Math.random()*1e9);
    this._genMap();
    this._spawnPlayer();
    this._assignTargets();
  }

  _genMap() {
    // Генерируем узлы на мягкой сетке и соединяем, чтобы получился плотный, связный граф
    const cols = 14, rows = 10;
    const margin = 60;
    const cellW = (this.w - margin*2) / (cols-1);
    const cellH = (this.h - margin*2) / (rows-1);
    for (let y=0;y<rows;y++) {
      for (let x=0;x<cols;x++) {
        const jitterX = (Math.random()-0.5)*cellW*0.25;
        const jitterY = (Math.random()-0.5)*cellH*0.25;
        this.graph.addNode(margin + x*cellW + jitterX, margin + y*cellH + jitterY);
      }
    }

    // Соединяем соседей с вероятностью, затем усиливаем связность
    const idx = (x,y)=> y*cols+x;
    for (let y=0;y<rows;y++) {
      for (let x=0;x<cols;x++) {
        const id = idx(x,y);
        const right = x+1<cols ? idx(x+1,y) : -1;
        const down = y+1<rows ? idx(x,y+1) : -1;
        const diag = (x+1<cols && y+1<rows) ? idx(x+1,y+1) : -1;
        if (right>=0 && Math.random()<0.85) this.graph.connect(id,right);
        if (down>=0 && Math.random()<0.85) this.graph.connect(id,down);
        if (diag>=0 && Math.random()<0.3) this.graph.connect(id,diag);
      }
    }
    // Добавим случайных мостиков
    const N = this.graph.nodes.length;
    for (let k=0;k<Math.floor(N*0.2);k++) {
      const a = randInt(0,N-1), b = randInt(0,N-1);
      if (dist(this.graph.nodes[a], this.graph.nodes[b]) < 80) continue;
      this.graph.connect(a,b);
    }

    // Светофоры на узлах степени >=3
    for (const n of this.graph.nodes) {
      if (n.neighbors.size >= 3) {
        n.light = new TrafficLight(n.id);
        n.light.autoCycle = this.rules.autoCycle;
        this.intersections.push(n.id);
      }
    }
  }

  _spawnPlayer() {
    // Две машины игрока на произвольных узлах
    const spawns = [...Array(2)].map(()=> randInt(0, this.graph.nodes.length-1));
    spawns.forEach((nid, i)=>{
      const car = new Car(`P${i}`, 'player', nid);
      car.route = [nid];
      car.routeIndex = 0;
      this.cars.push(car);
      this.playerCars.push(car);
    });
  }

  _assignTargets() {
    // Для каждой машины игрока определить цель
    for (const car of this.playerCars) {
      car.targetId = this._randomFarNode(car.nodeId, 6, 18);
      car.totalRouteLen = 0;
      car.travelTime = 0;
      car.lastPlannedLenPaid = 0;
    }
  }

  _randomFarNode(from, minL, maxL) {
    // Выбираем узел, у которого эвклидово расстояние в верхнем квартиле
    const candidates = this.graph.nodes
      .map(n=>({id:n.id, d: dist(this.graph.nodes[from], n)}))
      .sort((a,b)=> b.d-a.d)
      .slice(0, Math.max(6, Math.floor(this.graph.nodes.length*0.2)));
    return candidates[randInt(0, candidates.length-1)].id;
  }

  _updateHUD() {
    this.turnEl.textContent = this.turn;
    this.turnLimitEl.textContent = this.turnLimit;
    this.moneyEl.textContent = Math.floor(this.money);
    this.tripsEl.textContent = this.trips;
    this.penaltiesEl.textContent = Math.floor(this.penalties);
  }

  // -------------------- Вход и действия --------------------
  _canvasToWorld(x, y) { return {x, y}; }

  _nearestNode(x, y, maxDist=18) {
    let best = null, bd = maxDist;
    for (const n of this.graph.nodes) {
      const d = Math.hypot(n.x-x, n.y-y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _findEdgeNear(x, y, maxDist=8) {
    // Вернем ближайшее ребро как [a,b] если точка близко к отрезку
    let best = null, bd = maxDist;
    for (const e of this.graph.edges.values()) {
      const A = this.graph.nodes[e.a], B = this.graph.nodes[e.b];
      const d = pointSegDist(x,y, A.x,A.y, B.x,B.y);
      if (d<bd) { bd=d; best=[e.a,e.b]; }
    }
    return best;
    function pointSegDist(px,py, x1,y1, x2,y2){
      const vx=x2-x1, vy=y2-y1;
      const wx=px-x1, wy=py-y1;
      const t = clamp((vx*wx + vy*wy)/(vx*vx+vy*vy), 0,1);
      const cx = x1 + vx*t, cy = y1 + vy*t;
      return Math.hypot(px-cx, py-cy);
    }
  }

  _updateHover(x, y) {
    const node = this._nearestNode(x,y, 14);
    const edge = this._findEdgeNear(x,y, 8);
    // Кар
    let carId = null, cd = 12;
    for (const car of this.cars) {
      const n = this.graph.nodes[car.nodeId];
      const d = Math.hypot(n.x-x, n.y-y);
      if (d < cd) { cd = d; carId = car.id; }
    }
    this.hover = {nodeId: node?node.id:null, edge, carId};
  }

  _handleClick(x, y) {
    if (this.tool === 'light') {
      // Переключение светофора
      const node = this._nearestNode(x,y, 14);
      if (node && node.light) {
        const cost = this._lightManualCost(node.id);
        if (this.money >= cost && node.light.cooldown===0) {
          // Очередь на применение через 1 ход
          this.money -= cost;
          this._bumpManualCost(node.id);
          this.actionsQueued.push({type:'switchLight', nodeId: node.id});
        }
      }
      return;
    }
    if (this.tool === 'oneway') {
      const e = this._findEdgeNear(x,y, 8);
      if (e) {
        const edge = this.graph.edge(e[0],e[1]);
        if (edge.cd<=0 && this.money>=this.rules.oneWayCost) {
          this.money -= this.rules.oneWayCost;
          this.actionsQueued.push({type:'oneway', a:e[0], b:e[1]});
        }
      }
      return;
    }
    if (this.tool === 'wait') {
      const node = this._nearestNode(x,y, 14);
      if (node) {
        // попробуем найти машину игрока, у которой в маршруте есть этот узел
        const car = this.playerCars[0]; // одна машина для простоты выбора
        const idx = car.route.indexOf(node.id);
        if (idx>=0) {
          const v = prompt("Сколько ходов ждать на этом узле? (0..3)", "1");
          if (v!=null) {
            const w = clamp(parseInt(v)||0, 0, 3);
            // Сохраняем как «точечное» ожидание: создадим карту ожиданий
            if (!car.waitMap) car.waitMap = new Map();
            car.waitMap.set(node.id, w);
            // применение через 1 ход не требуется — ожидание вступит при проходе узла
          }
        }
      }
      return;
    }
    // route
    const node = this._nearestNode(x,y, 14);
    if (node) {
      // редактируем маршрут первой машины игрока
      const car = this.playerCars[0];
      // если клик по соседу последнего, добавим
      const last = car.route[car.route.length-1];
      if (car.route.length===1 && last===car.nodeId && this.graph.nodes[car.nodeId].neighbors.has(node.id)) {
        car.route.push(node.id);
      } else {
        const lastNode = this.graph.nodes[last];
        if (lastNode && lastNode.neighbors.has(node.id)) {
          car.route.push(node.id);
        } else {
          // если клик по текущему — сбросим хвост до него
          const idx = car.route.indexOf(node.id);
          if (idx>=0) car.route = car.route.slice(0, idx+1);
        }
      }
      // Стоимость правки: берем число измененных ребер по сравнению с последней оплатой
      const changed = Math.max(0, car.route.length-1 - car.lastPlannedLenPaid);
      const cost = this.rules.routeBaseRecalc + changed*this.rules.routePerEdge;
      if (cost>0) {
        if (this.money >= cost) {
          this.money -= cost;
          car.lastPlannedLenPaid = car.route.length-1;
        } else {
          // откатим последнее изменение
          car.route.pop();
          alert("Недостаточно денег для правки маршрута.");
        }
      }
    }
  }

  _lightManualCost(nodeId) {
    // базовая 10₵, накапливаем удорожание если повтор в окне
    const base = this.rules.lightManualCostBase;
    // для простоты: если за последние 10 ходов переключали этот узел, +10 за каждый раз
    const bumps = this.manualCostsBump.get(nodeId) || 0;
    return base + 10*bumps;
  }
  _bumpManualCost(nodeId) {
    const b = (this.manualCostsBump.get(nodeId) || 0) + 1;
    this.manualCostsBump.set(nodeId, b);
    // Через 10 ходов снимем 1
    this.actionsQueued.push({type:'decBump', nodeId});
  }

  recalcPlayerRoutes() {
    const car = this.playerCars[0];
    // Находим путь A* до цели
    if (car.targetId == null) return;
    const path = this._shortestPath(car.nodeId, car.targetId);
    if (path && path.length>=2) {
      // рассчитать стоимость
      const newLen = path.length-1;
      const changed = Math.max(0, newLen - car.lastPlannedLenPaid);
      const cost = this.rules.routeBaseRecalc + changed*this.rules.routePerEdge;
      if (this.money >= cost) {
        this.money -= cost;
        car.route = path.slice();
        car.routeIndex = 0;
        car.lastPlannedLenPaid = newLen;
      } else {
        alert("Недостаточно денег для пересчета маршрута.");
      }
    }
  }

  // -------------------- Алгоритмы --------------------
  _shortestPath(startId, goalId) {
    // Простая Dijkstra по количеству ребер + легкая оценка задержек от светофоров/очередей
    const N = this.graph.nodes.length;
    const distArr = Array(N).fill(Infinity);
    const prev = Array(N).fill(-1);
    distArr[startId] = 0;
    const visited = new Set();
    while (true) {
      let u = -1, best = Infinity;
      for (let i=0;i<N;i++) if (!visited.has(i) && distArr[i]<best) { best=distArr[i]; u=i; }
      if (u === -1 || u===goalId) break;
      visited.add(u);
      const node = this.graph.nodes[u];
      for (const v of node.neighbors) {
        const e = this.graph.edge(u,v);
        if (e.oneWay && e.oneWay.ttl>0) {
          // если односторонний не позволяет из u в v для NPC, для игрока можно — оставим, но чуть увеличим вес
        }
        let w = 1;
        // штраф за светофор (ожидание), если у цели узла есть свет
        const n2 = this.graph.nodes[v];
        if (n2.light) w += 0.2;
        const nd = distArr[u] + w;
        if (nd < distArr[v]) { distArr[v] = nd; prev[v] = u; }
      }
    }
    if (!isFinite(distArr[goalId])) return null;
    const path = [];
    for (let cur=goalId; cur!=-1; cur=prev[cur]) path.push(cur);
    path.reverse();
    return path;
  }

  // -------------------- Ход игры --------------------
  endTurn() {
    // 1) применить отложенные действия прошлого хода
    this._applyQueued();

    // 2) тики светофоров и TTL/CD на ребрах
    for (const nid of this.intersections) {
      this.graph.nodes[nid].light.tick();
    }
    for (const e of this.graph.edges.values()) {
      if (e.oneWay) {
        if (e.oneWay.ttl>0) e.oneWay.ttl--;
        if (e.oneWay.ttl===0) e.oneWay = null;
      }
      if (e.cd>0) e.cd--;
    }

    // 3) спаун NPC
    this._spawnNPC();

    // 4) перемещение: собираем заявки перемещений
    const intents = [];
    for (const car of this.cars) {
      if (car.crashHold>0) { car.crashHold--; continue; }

      // ожидание на узле
      let waitHere = 0;
      if (car.wait>0) { waitHere = car.wait; car.wait--; }
      if (car.waitMap && car.waitMap.has(car.nodeId) && car.routeIndex < car.route.length-1) {
        // если в карте ожиданий прописано ожидание на этом узле — взять разово
        const w = car.waitMap.get(car.nodeId);
        if (w>0) { car.wait = w; car.waitMap.delete(car.nodeId); }
      }
      if (car.wait>0 || waitHere>0) continue;

      // цель достигнута?
      if (car.owner==='player' && car.atTarget()) continue;

      // определить следующий узел
      let nextId = null;
      if (car.owner==='player') {
        // идти по маршруту, если есть
        if (car.routeIndex < car.route.length-1) {
          nextId = car.route[car.routeIndex+1];
        } else {
          // нет маршрута — стоим
          nextId = null;
        }
      } else {
        // NPC: если пути нет или дошли до цели — выберем новую цель и путь
        if (!car.predictedPath || car.routeIndex >= car.predictedPath.length-1) {
          const target = this._randomFarNode(car.nodeId, 6, 18);
          const path = this._shortestPath(car.nodeId, target);
          car.predictedPath = path ? path : [car.nodeId];
          car.routeIndex = 0;
        }
        if (car.routeIndex < car.predictedPath.length-1) nextId = car.predictedPath[car.routeIndex+1];
      }

      if (nextId==null) continue;

      // проверка светофора и одностороннего знак
      const can = this._canEnter(car, car.nodeId, nextId);
      if (!can.allowed) {
        // блокировка на перекрестке штрафует только игрока, если он перекресток и мы стоим тут
        const node = this.graph.nodes[car.nodeId];
        if (car.owner==='player' && node.light && node.neighbors.size>=3) {
          this.money -= this.rules.fineBlock;
          this.penalties += this.rules.fineBlock;
        }
        continue;
      }

      intents.push({car, from: car.nodeId, to: nextId, priority: can.priority});
    }

    // 5) разрешение конфликтов: на узле может войти только один
    const bucket = new Map(); // toId -> list of intents
    for (const it of intents) {
      if (!bucket.has(it.to)) bucket.set(it.to, []);
      bucket.get(it.to).push(it);
    }
    for (const [toId, list] of bucket) {
      if (list.length===1) {
        this._applyMove(list[0]);
      } else {
        // сортируем по приоритету: зелёный, приоритет, меньшая очередь, старшинство
        list.sort((a,b)=> b.priority - a.priority);
        const winner = list[0];
        // столкновение, если приоритеты равны и обе машины имели зеленый? В упрощении — ничья = вежливый стоп
        if (list.length>=2 && list[0].priority===list[1].priority && list[0].priority>=2) {
          // вежливый стоп: никто не двигается
        } else {
          this._applyMove(winner);
          // остальные стояли, если среди проигравших есть игрок и у него был красный — штраф
          for (let i=1;i<list.length;i++) {
            const looser = list[i];
            // нет отдельного штрафа за красный, потому что мы вообще-то не пропускаем красный
          }
        }
      }
    }

    // 6) Выплаты/задания
    for (const car of this.playerCars) {
      if (car.atTarget()) {
        // рассчитать выплату
        const L = car.totalRouteLen;
        const T = car.travelTime;
        const pay = this.rules.basePay + this.rules.perEdge * L + Math.max(0, this.rules.speedBonusCap - T)*this.rules.speedBonusPer;
        // Проверка чистоты: здесь без учета «красного», применим если не было crashHold и блокировки накопленной
        const clean = (car.blockingPenalty<=0);
        const total = clean ? pay * this.rules.cleanMult : pay;
        this.money += total;
        this.trips += 1;
        // сброс
        car.totalRouteLen = 0;
        car.travelTime = 0;
        car.blockingPenalty = 0;
        // новая цель
        car.targetId = this._randomFarNode(car.nodeId, 6, 18);
        // сброс оплаченной длины планирования
        car.lastPlannedLenPaid = Math.max(0, car.route.length-1);
      }
    }

    // 7) Конец хода
    this.turn++;
    if (this.turn > this.turnLimit) {
      alert(`Партия окончена. Доход: ${Math.floor(this.money)}₵, рейсов: ${this.trips}`);
      this.turn = 1; this.money = 0; this.trips = 0; this.penalties = 0;
      this._assignTargets();
      for (const car of this.playerCars) {
        car.route = [car.nodeId];
        car.routeIndex = 0;
      }
      // очистка NPC
      this.cars = this.playerCars.slice();
      this.npcCars = [];
    }

    this._updateHUD();
  }

  _applyQueued() {
    const pending = this.actionsQueued.slice();
    this.actionsQueued = [];
    for (const act of pending) {
      if (act.type==='switchLight') {
        const n = this.graph.nodes[act.nodeId];
        if (n && n.light) n.light.manualSwitch(this.turn);
      } else if (act.type==='oneway') {
        const e = this.graph.edge(act.a, act.b);
        if (e && e.cd<=0) {
          // выберем направление случайно для запрета NPC, игрокам разрешим оба, но NPC будут избегать
          e.oneWay = { allowFrom: Math.random()<0.5? act.a : act.b, ttl: this.rules.oneWayTTL, cd: this.rules.oneWayCD };
          e.cd = this.rules.oneWayCD;
        }
      } else if (act.type==='decBump') {
        // через 10 ходов снимем один bump — реализуем задержкой повторно
        setTimeout(()=>{
          const b = (this.manualCostsBump.get(act.nodeId)||0);
          if (b>0) this.manualCostsBump.set(act.nodeId, b-1);
        }, 0);
      }
    }
  }

  _canEnter(car, fromId, toId) {
    const toNode = this.graph.nodes[toId];
    const fromNode = this.graph.nodes[fromId];
    const edge = this.graph.edge(fromId, toId);
    let green = true;
    // Правило светофора: если в to узле есть светофор, половина направлений красная
    if (toNode.light) {
      // Простая эвристика: разделим входящие направления по углу относительно центра.
      const angle = Math.atan2(fromNode.y-toNode.y, fromNode.x-toNode.x); // направление въезда
      const deg = (angle*180/Math.PI + 360)%360;
      const phase = toNode.light.state; // 0 или 1
      // группа 0: [ -45..45 ] U [135..225], группа 1: остальные
      const inGroup0 = (deg<=45 || deg>=315) || (deg>=135 && deg<=225);
      green = (phase===0 && inGroup0) || (phase===1 && !inGroup0);
    }
    // односторонний: NPC не могут, игрок может
    if (edge.oneWay && edge.oneWay.ttl>0) {
      if (car.owner==='npc') {
        if (edge.oneWay.allowFrom !== fromId) return {allowed:false, priority:0};
      }
    }
    if (!green) return {allowed:false, priority:0};
    // приоритет: зелёный = 2, без светофора = 1
    const pr = toNode.light ? 2 : 1;
    return {allowed:true, priority:pr};
  }

  _applyMove(intent) {
    const {car, from, to} = intent;
    if (car.owner==='player') {
      car.totalRouteLen += 1;
      car.travelTime += 1;
      // удалить голову маршрута если совпала
      if (car.routeIndex < car.route.length-1 && car.route[car.routeIndex+1]===to) {
        car.routeIndex++;
      } else {
        // если ушли не по маршруту (например после пересчета NPC перекрыл), просто перезапишем голову
        car.route = [to];
        car.routeIndex = 0;
      }
    } else {
      car.travelTime += 1;
      if (car.predictedPath && car.routeIndex < car.predictedPath.length-1 && car.predictedPath[car.routeIndex+1]===to) {
        car.routeIndex++;
      } else {
        car.predictedPath = [to];
        car.routeIndex = 0;
      }
    }
    car.nodeId = to;
  }

  _spawnNPC() {
    const Nnodes = this.graph.nodes.length;
    const targetNPC = Math.floor(Nnodes * this.rules.npcMaxFactor);
    if (this.npcCars.length >= targetNPC) return;
    const toSpawn = Math.max(0, Math.floor(Nnodes * this.rules.npcSpawnRate));
    for (let i=0;i<toSpawn;i++) {
      const nid = randInt(0, this.graph.nodes.length-1);
      const car = new Car(`N${Date.now()}_${Math.floor(Math.random()*10000)}`, 'npc', nid);
      car.predictedPath = null;
      car.routeIndex = 0;
      this.cars.push(car);
      this.npcCars.push(car);
    }
  }

  // -------------------- Рендер --------------------
  _loop() {
    requestAnimationFrame(()=>this._loop());
    this._render();
    this._updateHUD();
  }

  _render() {
    const ctx = this.ctx; const w = this.w, h = this.h;
    ctx.clearRect(0,0,w,h);

    // edges
    ctx.lineWidth = 4;
    for (const e of this.graph.edges.values()) {
      const A = this.graph.nodes[e.a], B = this.graph.nodes[e.b];
      ctx.strokeStyle = "#2c3443";
      ctx.beginPath();
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();

      if (e.oneWay && e.oneWay.ttl>0) {
        // рисуем стрелку по направлению allowFrom -> другой
        ctx.strokeStyle = "#f39c12";
        ctx.lineWidth = 2;
        const from = e.oneWay.allowFrom===e.a ? A : B;
        const to = e.oneWay.allowFrom===e.a ? B : A;
        const vx = (to.x - from.x), vy = (to.y - from.y);
        const len = Math.hypot(vx,vy);
        const ux = vx/len, uy = vy/len;
        const cx = from.x + ux*(len*0.5), cy = from.y + uy*(len*0.5);
        ctx.beginPath();
        ctx.moveTo(cx-uy*6, cy+ux*6);
        ctx.lineTo(cx+uy*6, cy-ux*6);
        ctx.stroke();
        ctx.lineWidth = 4;
      }
    }

    // nodes
    for (const n of this.graph.nodes) {
      // светофорная индикация
      if (n.light) {
        const green = n.light.state===0 ? "#2ecc71" : "#e74c3c";
        ctx.fillStyle = green;
        ctx.beginPath(); ctx.arc(n.x, n.y, 4, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = "#6b7280";
        ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, Math.PI*2); ctx.fill();
      }
    }

    // targets
    for (const car of this.playerCars) {
      const t = this.graph.nodes[car.targetId];
      if (t) {
        ctx.strokeStyle = "#3a7afe";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, 11, 0, Math.PI*2); ctx.stroke();
      }
    }

    // routes
    for (const car of this.playerCars) {
      if (car.route.length>=2) {
        ctx.strokeStyle = "#3a7afe";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i=0;i<car.route.length;i++) {
          const n = this.graph.nodes[car.route[i]];
          if (i===0) ctx.moveTo(n.x, n.y); else ctx.lineTo(n.x, n.y);
        }
        ctx.stroke();
      }
      // ожидания
      if (car.waitMap) {
        ctx.fillStyle = "#ffd166";
        for (const [nid, w] of car.waitMap.entries()) {
          const n = this.graph.nodes[nid];
          ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI*2); ctx.fill();
        }
      }
    }

    // cars
    for (const car of this.cars) {
      const n = this.graph.nodes[car.nodeId];
      ctx.fillStyle = car.owner==='player' ? "#3498db" : "#bdc3c7";
      ctx.beginPath(); ctx.arc(n.x, n.y, car.owner==='player'?6:4, 0, Math.PI*2); ctx.fill();
    }

    // hover info
    if (this.hover.carId) {
      const car = this.cars.find(c=>c.id===this.hover.carId);
      if (car && car.owner==='npc' && car.predictedPath) {
        const path = car.predictedPath;
        this._drawPreview(path, 5, "#bdc3c7");
      }
    }

    // HUD overlays
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(6, this.h-26, 320, 20);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Инструмент: ${this.tool}`, 12, this.h-12);
  }

  _drawPreview(path, k, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6,6]);
    ctx.beginPath();
    for (let i=0;i<Math.min(path.length, k);i++) {
      const n = this.graph.nodes[path[i]];
      if (i===0) ctx.moveTo(n.x, n.y); else ctx.lineTo(n.x, n.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// -------------------- Старт --------------------
window.addEventListener('DOMContentLoaded', ()=>{
  const cv = document.getElementById('game');
  const game = new Game(cv);

  // Экспорт в window для отладки
  window.__game = game;
});
