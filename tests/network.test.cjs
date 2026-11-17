const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/route-network.js'), 'utf8'), sandbox);
const net = sandbox.window.ACCESS_NETWORK;
const plan = (x, y, destinationId = 'mall', scenario = 'normal', minWidth = 80) => net.plan({ x, y, destinationId, scenario, minWidth });
const ids = result => Array.from(result.edges, edge => edge.id);
const nearly = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} should equal ${expected}`);

test('different edge-midpoint origins produce different paths with genuine partial-edge distances', () => {
  const west = plan(175, 380, 'park'), north = plan(250, 280, 'park');
  assert.equal(west.status, 'ok'); assert.equal(north.status, 'ok');
  nearly(west.distance, 415); nearly(north.distance, 240);
  assert.notDeepEqual(ids(west), ids(north));
  assert.equal(west.edges[0].partial, true); nearly(west.edges[0].distance, 75);
  assert.equal(west.edges[0].fromNode.x, 175); assert.equal(west.edges[0].toNode.id, 'junction');
});

test('an origin inside one edge can choose either direction instead of a fixed endpoint', () => {
  const nearNorth = plan(250, 240), nearSouth = plan(250, 370);
  assert.equal(nearNorth.edges[0].toNode.id, 'northCross');
  assert.equal(nearSouth.edges[0].toNode.id, 'junction');
  nearly(nearNorth.distance, 320); nearly(nearSouth.distance, 420);
});

test('the 25m stair shortcut is rejected in favor of a continuous step-free path', () => {
  const result = plan(250, 180);
  assert.equal(result.status, 'ok'); nearly(result.distance, 260);
  assert.ok(!ids(result).includes('stairs-shortcut'));
  assert.equal(plan(340, 140).status, 'no-route');
});

test('origin snapping stays within the 18px walking corridor and never invents a connector', () => {
  const accepted = plan(175, 390, 'park');
  assert.equal(accepted.status, 'ok'); assert.equal(accepted.origin.y, 380);
  nearly(accepted.origin.snapDistance, 10); nearly(accepted.distance, 415);
  assert.equal(accepted.points[0].y, 380);
  assert.equal(plan(175, 398).status, 'ok');
  assert.equal(plan(175, 398.01).status, 'off-network');
  assert.equal(plan(40, 40).status, 'off-network');
  assert.equal(plan(430, 260).status, 'no-route'); // Inside a lift is not a walking origin.
});

test('unknown geometry and coordinates outside the drawing are blocked', () => {
  assert.equal(plan(630, 180).status, 'unknown');
  assert.equal(plan(-1, 380).status, 'invalid');
  assert.equal(plan(801, 380).status, 'invalid');
  assert.equal(plan(100, 521).status, 'invalid');
});

test('minimum-width filtering changes the route and excludes the 90cm passage', () => {
  const narrow = plan(250, 180, 'mall', 'normal', 80);
  const wide = plan(250, 180, 'mall', 'normal', 100);
  nearly(narrow.distance, 260); nearly(wide.distance, 610);
  assert.ok(ids(narrow).includes('narrow-gallery'));
  assert.ok(!ids(wide).includes('narrow-gallery'));
  assert.ok(wide.edges.every(edge => edge.width >= 100));
  assert.equal(plan(340, 180, 'mall', 'normal', 100).status, 'no-route');
});

test('closing E4 computes a longer alternative, including the ramp for wider requirements', () => {
  const normal = plan(100, 380), closed = plan(100, 380, 'mall', 'liftClosed');
  const wideClosed = plan(100, 380, 'mall', 'liftClosed', 100);
  nearly(normal.distance, 560); nearly(closed.distance, 610); nearly(wideClosed.distance, 890);
  assert.ok(ids(normal).includes('lift-E4'));
  assert.ok(!ids(closed).includes('lift-E4')); assert.ok(!ids(wideClosed).includes('lift-E4'));
  assert.ok(ids(wideClosed).includes('east-ramp'));
});

test('hospital construction disconnects the entrance and never uses the unknown shortcut', () => {
  const normal = plan(100, 380, 'hospital'), closed = plan(100, 380, 'hospital', 'works');
  assert.equal(normal.status, 'ok'); nearly(normal.distance, 840);
  assert.ok(!ids(normal).includes('unknown-link'));
  assert.equal(closed.status, 'no-route'); assert.equal(closed.excludedReason, 'works');
  assert.equal(closed.points.length, 0); assert.equal(closed.edges.length, 0);
  assert.equal(plan(100, 380, 'park', 'works').status, 'ok');
});

test('successful routes remain continuous, bidirectional and account for every distance', () => {
  for (const destination of ['mall', 'hospital', 'park']) {
    for (const [x, y] of [[100, 380], [175, 380], [250, 240], [700, 260], [560, 300]]) {
      const result = plan(x, y, destination);
      assert.equal(result.status, 'ok');
      let last = result.origin;
      for (const edge of result.edges) {
        nearly(last.x, edge.fromNode.x); nearly(last.y, edge.fromNode.y);
        assert.equal(edge.known, true); assert.notEqual(edge.kind, 'stairs');
        last = edge.toNode;
      }
      const target = net.nodes.find(node => node.id === result.destination.nodeId);
      nearly(last.x, target.x); nearly(last.y, target.y);
      nearly(result.distance, result.edges.reduce((sum, edge) => sum + edge.distance, 0));
      nearly(result.distance, result.steps.reduce((sum, step) => sum + step.distance, 0));
      assert.equal(result.points.length, result.edges.length + 1);
    }
  }
  assert.equal(plan(700, 260, 'park').edges[0].toNode.id, 'hospitalSouth');
});

test('steps are generated from the chosen path and same-entrance selection is already arrived', () => {
  const nearby = plan(430, 140), far = plan(100, 380);
  assert.notEqual(nearby.steps.length, far.steps.length);
  nearly(nearby.distance, 40);
  const arrived = plan(430, 100);
  assert.equal(arrived.status, 'ok'); assert.equal(arrived.distance, 0);
  assert.equal(arrived.edges.length, 0); assert.equal(arrived.points.length, 1);
  assert.match(arrived.steps[0].text, /已到达星河商场/);
  const fractional = plan(175.053, 380, 'park');
  nearly(fractional.edges[0].distance, 74.947);
  assert.match(fractional.steps[0].text, /约 75 米/);
  assert.equal(fractional.steps[0].distance, 74.947);
});

test('unsupported parameters never silently coerce into usable routes', () => {
  for (const input of [null, [], {}, { x: '100', y: 380, destinationId: 'mall' },
    { x: Infinity, y: 380, destinationId: 'mall' }, { x: 100, y: NaN, destinationId: 'mall' },
    { x: 100, y: 380, destinationId: '__proto__' }, { x: 100, y: 380, destinationId: 'mall', scenario: 'toString' },
    { x: 100, y: 380, destinationId: 'mall', scenario: 'unknown' }, { x: 100, y: 380, destinationId: 'mall', minWidth: 90 },
    { x: 100, y: 380, destinationId: 'mall', minWidth: '80' },
    { x: 100, y: 380, destinationId: 'mall', minwidth: 100 },
    { x: 100, y: 380, destinationId: 'mall', allowStairs: true }]) {
    assert.equal(net.plan(input).status, 'invalid');
  }
  assert.equal(net.demo, true); assert.equal(net.coordinateSystem, 'illustration');
  assert.match(net.notice, /不是真实经纬度/);
});
