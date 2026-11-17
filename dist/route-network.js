/* Fictional, illustration-coordinate network. No GPS, real roads or live conditions. */
(function () {
  'use strict';
  const nodes = [
    { id: 'west', x: 100, y: 380, label: '云桥路西侧人行道' },
    { id: 'junction', x: 250, y: 380, label: '云桥路西路口' },
    { id: 'eastJunction', x: 430, y: 380, label: '云桥路中段' },
    { id: 'eastSquare', x: 620, y: 380, label: '云桥路东侧广场' },
    { id: 'hospitalSouth', x: 700, y: 380, label: '医院路南侧过街口' },
    { id: 'hospitalForecourt', x: 700, y: 260, label: '医院前广场' },
    { id: 'hospital', x: 700, y: 140, label: '云桥社区医院无台阶入口' },
    { id: 'liftSouth', x: 430, y: 300, label: 'E4 升降连接南侧' },
    { id: 'liftNorth', x: 430, y: 220, label: 'E4 升降连接北侧' },
    { id: 'mallApproach', x: 430, y: 180, label: '商场入口前通道' },
    { id: 'mall', x: 430, y: 100, label: '星河商场无台阶入口' },
    { id: 'northCross', x: 250, y: 180, label: '公园东侧路口' },
    { id: 'park', x: 110, y: 180, label: '云桥公园东入口' },
    { id: 'rampSouth', x: 560, y: 300, label: '东侧坡道南端' },
    { id: 'rampNorth', x: 560, y: 220, label: '东侧坡道北端' }
  ];
  const edges = [
    { id: 'west-path', from: 'west', to: 'junction', distance: 150, label: '云桥路西段人行道', kind: 'path', known: true, width: 180 },
    { id: 'central-path', from: 'junction', to: 'eastJunction', distance: 180, label: '云桥路中段人行道', kind: 'path', known: true, width: 160 },
    { id: 'east-path', from: 'eastJunction', to: 'eastSquare', distance: 190, label: '云桥路东段人行道', kind: 'path', known: true, width: 160 },
    { id: 'north-link', from: 'junction', to: 'northCross', distance: 200, label: '公园东侧人行通道', kind: 'path', known: true, width: 140 },
    { id: 'park-path', from: 'northCross', to: 'park', distance: 140, label: '公园东入口通道', kind: 'path', known: true, width: 180 },
    { id: 'narrow-gallery', from: 'northCross', to: 'mallApproach', distance: 180, label: '商场西侧窄通道', kind: 'path', known: true, width: 90 },
    { id: 'mall-entry', from: 'mallApproach', to: 'mall', distance: 80, label: '商场平层入口通道', kind: 'path', known: true, width: 180 },
    { id: 'lift-approach', from: 'eastJunction', to: 'liftSouth', distance: 80, label: '升降设施南侧通道', kind: 'path', known: true, width: 150 },
    { id: 'lift-E4', from: 'liftSouth', to: 'liftNorth', distance: 30, label: 'E4 无障碍升降连接', kind: 'lift', known: true, width: 110, closedIn: ['liftClosed'] },
    { id: 'lift-exit', from: 'liftNorth', to: 'mallApproach', distance: 40, label: '升降设施北侧通道', kind: 'path', known: true, width: 150 },
    { id: 'ramp-approach', from: 'liftSouth', to: 'rampSouth', distance: 130, label: '东侧坡道引道', kind: 'path', known: true, width: 160 },
    { id: 'east-ramp', from: 'rampSouth', to: 'rampNorth', distance: 100, label: '东侧无台阶坡道', kind: 'ramp', known: true, width: 140 },
    { id: 'ramp-exit', from: 'rampNorth', to: 'liftNorth', distance: 130, label: '坡道北侧连接通道', kind: 'path', known: true, width: 150 },
    { id: 'hospital-bottom', from: 'eastSquare', to: 'hospitalSouth', distance: 80, label: '医院路口人行道', kind: 'path', known: true, width: 160 },
    { id: 'hospital-crossing', from: 'hospitalSouth', to: 'hospitalForecourt', distance: 120, label: '医院路标注过街通道', kind: 'crossing', known: true, width: 140 },
    { id: 'hospital-entry', from: 'hospitalForecourt', to: 'hospital', distance: 120, label: '医院门诊入口连接通道', kind: 'path', known: true, width: 150, closedIn: ['works'] },
    { id: 'stairs-shortcut', from: 'northCross', to: 'mall', distance: 25, label: '商场台阶捷径', kind: 'stairs', known: true, width: 160 },
    { id: 'unknown-link', from: 'rampNorth', to: 'hospital', distance: 160, label: '待核验的医院侧通道', kind: 'path', known: false, width: null }
  ];
  const destinations = [
    { id: 'mall', name: '星河商场', nodeId: 'mall' },
    { id: 'hospital', name: '云桥社区医院', nodeId: 'hospital' },
    { id: 'park', name: '云桥公园', nodeId: 'park' }
  ];
  const scenarios = {
    normal: { label: '设施正常', closedEdges: [] },
    liftClosed: { label: 'E4 电梯停运', closedEdges: ['lift-E4'] },
    works: { label: '医院入口通道施工', closedEdges: ['hospital-entry'] }
  };
  const nodeById = new Map(nodes.map(function (node) { return [node.id, node]; }));
  const snapTolerance = 18;
  const own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  const round = function (value) { return Math.round(value * 1000) / 1000; };

  function project(x, y, edge) {
    const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
    const dx = to.x - from.x, dy = to.y - from.y;
    const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy)));
    const px = from.x + t * dx, py = from.y + t * dy;
    return { edge: edge, t: t, x: px, y: py, gap: Math.hypot(x - px, y - py) };
  }

  function exclusion(edge, scenario, minWidth) {
    if (!edge.known || edge.width === null) return 'unknown';
    if (edge.kind === 'stairs') return 'stairs';
    if (edge.width < minWidth) return 'width';
    if (scenarios[scenario].closedEdges.indexOf(edge.id) !== -1) return scenario;
    return null;
  }

  function failure(status, message, origin, destination, reason) {
    return { status: status, origin: origin || null, destination: destination || null, distance: null,
      edges: [], points: [], steps: [], excludedReason: reason, message: message };
  }

  function plan(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return failure('invalid', '请提供演示起点坐标、目的地和通行需求。', null, null, 'invalid-input');
    }
    const allowedParameters = ['x', 'y', 'destinationId', 'scenario', 'minWidth'];
    if (Object.keys(input).some(function (key) { return allowedParameters.indexOf(key) === -1; })) {
      return failure('invalid', '存在无法识别的规划参数，请检查起点和通行需求。', null, null, 'invalid-input');
    }
    const x = input.x, y = input.y;
    const scenario = input.scenario === undefined ? 'normal' : input.scenario;
    const minWidth = input.minWidth === undefined ? 80 : input.minWidth;
    const destination = destinations.find(function (item) { return item.id === input.destinationId; });
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) ||
      x < 0 || y < 0 || x > 800 || y > 520 || !destination || !own(scenarios, scenario) ||
      (minWidth !== 80 && minWidth !== 100)) {
      return failure('invalid', '演示坐标、目的地或筛选参数无效。请在图内选择起点。', null, destination, 'invalid-input');
    }

    const projections = edges.map(function (edge) { return project(x, y, edge); })
      .filter(function (candidate) { return candidate.gap <= snapTolerance + 1e-9; })
      .sort(function (a, b) { return a.gap - b.gap; });
    const pickedOrigin = { x: x, y: y, label: '尚未确认的演示位置', edgeId: null };
    if (!projections.length) {
      return failure('off-network', '此处没有可确认的模拟人行路径。请直接选择图中通道，不会把起点跨越街区吸附到远处。', pickedOrigin, destination, 'off-network');
    }
    // Starting inside a lift or on stairs is not a walking origin. Only a known,
    // currently passable path/crossing/ramp corridor may accept a point selection.
    const snap = projections.find(function (candidate) {
      return candidate.edge.kind !== 'lift' && !exclusion(candidate.edge, scenario, minWidth);
    });
    if (!snap) {
      const nearest = projections[0];
      const reason = exclusion(nearest.edge, scenario, minWidth) || 'lift-origin';
      if (reason === 'unknown') return failure('unknown', '这段通道的信息不足，无法确认通行条件。请选择已有资料的人行路径。', pickedOrigin, destination, reason);
      const messages = {
        width: '所选通道宽度不符合当前需求，请选择其他已知人行路径。',
        stairs: '所选位置在台阶通道上，不能作为无台阶路线的起点。',
        liftClosed: '所选位置依赖停运设施，请在可通行的人行通道上确认起点。',
        works: '所选通道正在模拟施工封闭，请在可通行通道上确认起点。',
        'lift-origin': '请在电梯外的已知人行通道上确认起点，不能从升降连接内部开始。'
      };
      return failure('no-route', messages[reason] || '此处目前无法确认可通行的起点。', pickedOrigin, destination, reason);
    }

    const origin = { x: round(snap.x), y: round(snap.y), label: snap.edge.label + ' · 演示起点',
      edgeId: snap.edge.id, snapDistance: round(snap.gap) };
    const originNode = { id: '@origin', x: origin.x, y: origin.y, label: '已确认的演示起点' };
    const adjacency = new Map(nodes.map(function (node) { return [node.id, []]; }));
    adjacency.set(originNode.id, []);
    const add = function (edge, fromNode, toNode, distance, partial) {
      const arc = Object.assign({}, edge, { from: fromNode.id, to: toNode.id, fromNode: fromNode,
        toNode: toNode, distance: distance, originalDistance: edge.distance, partial: !!partial });
      adjacency.get(fromNode.id).push(arc);
    };
    edges.forEach(function (edge) {
      if (edge.id === snap.edge.id || exclusion(edge, scenario, minWidth)) return;
      const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
      add(edge, from, to, edge.distance, false); add(edge, to, from, edge.distance, false);
    });
    // Split the selected edge at the projection, preserving its distance ratio.
    // Both directions remain candidates in the shortest-path search.
    const start = nodeById.get(snap.edge.from), end = nodeById.get(snap.edge.to);
    add(snap.edge, originNode, start, snap.edge.distance * snap.t, true);
    add(snap.edge, start, originNode, snap.edge.distance * snap.t, true);
    add(snap.edge, originNode, end, snap.edge.distance * (1 - snap.t), true);
    add(snap.edge, end, originNode, snap.edge.distance * (1 - snap.t), true);

    const distances = new Map([[originNode.id, 0]]), previous = new Map(), settled = new Set();
    while (true) {
      let current = null, best = Infinity;
      distances.forEach(function (distance, id) {
        if (!settled.has(id) && distance < best) { current = id; best = distance; }
      });
      if (current === null || current === destination.nodeId) break;
      settled.add(current);
      adjacency.get(current).forEach(function (arc) {
        const next = best + arc.distance;
        if (next < (distances.get(arc.to) === undefined ? Infinity : distances.get(arc.to))) {
          distances.set(arc.to, next); previous.set(arc.to, arc);
        }
      });
    }
    if (!distances.has(destination.nodeId)) {
      const works = scenario === 'works' && destination.id === 'hospital';
      return failure('no-route', works ? '医院入口连接通道正在模拟施工，其他连接尚未核验，当前没有可用路线。' :
        '当前起点与目的地之间没有满足需求的已知路线。不会使用台阶、未知通道或跨越未连接的街区。', origin, destination,
      works ? 'works' : 'no-connected-accessible-route');
    }
    let cursor = destination.nodeId;
    const traversed = [];
    while (cursor !== originNode.id) {
      const arc = previous.get(cursor);
      if (!arc) return failure('no-route', '当前无法建立连续通行路径，请重新确认起点。', origin, destination, 'disconnected');
      if (arc.distance > 1e-9) traversed.unshift(Object.assign({}, arc, { distance: round(arc.distance) }));
      cursor = arc.from;
    }
    const points = [{ x: origin.x, y: origin.y }];
    traversed.forEach(function (arc) { points.push({ x: arc.toNode.x, y: arc.toNode.y }); });
    const steps = traversed.map(function (arc) {
      const prefix = arc.kind === 'lift' ? '使用' : arc.kind === 'crossing' ? '通过标注的' : '沿';
      return { text: prefix + arc.label + '，约 ' + Math.round(arc.distance) + ' 米，到达' + arc.toNode.label + '。',
        distance: arc.distance, kind: arc.kind };
    });
    steps.push({ text: '已到达' + destination.name + '的演示无台阶入口。', distance: 0, kind: 'path' });
    return { status: 'ok', origin: origin, destination: destination, distance: round(distances.get(destination.nodeId)),
      edges: traversed, points: points, steps: steps,
      message: '已根据确认起点动态规划。距离、宽度、设施和状态均为虚构演示数据，不能用于真实出行。' };
  }

  window.ACCESS_NETWORK = { demo: true, coordinateSystem: 'illustration',
    notice: '仅覆盖虚构云桥街区；坐标为示意图像素，不是真实经纬度。请勿将设备位置映射到此路网。',
    viewBox: { width: 800, height: 520 }, snapTolerance: snapTolerance,
    nodes: nodes, edges: edges, destinations: destinations, scenarios: scenarios, plan: plan };
})();
