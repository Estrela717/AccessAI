const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/data.js'), 'utf8'), sandbox);
const data = sandbox.window.ACCESS_DATA;
const scenarios = ['normal', 'e2', 'e1', 'e3', 'southClosed', 'rain'];
const positions = ['platform', 'hall', 'streetA', 'streetC', 'mall', 'hospital', 'park'];
const list = values => Array.from(values);

test('all 168 route/location/scenario combinations match explicit journey expectations', () => {
  // Six bits per row, in scenario order above. Arrived users have no remaining
  // dependency; an unrelated destination or exit is never a usable origin.
  const expected = {
    A: { platform: '100101', hall: '101101', streetA: '111101', streetC: '000000', mall: '111111', hospital: '000000', park: '000000' },
    B: { platform: '110011', hall: '111011', streetA: '000000', streetC: '111111', mall: '111111', hospital: '000000', park: '000000' },
    H: { platform: '110011', hall: '111011', streetA: '000000', streetC: '111111', mall: '000000', hospital: '111111', park: '000000' },
    P: { platform: '100110', hall: '101110', streetA: '111110', streetC: '000000', mall: '000000', hospital: '000000', park: '111111' }
  };
  for (const [routeId, rows] of Object.entries(expected)) {
    for (const position of positions) {
      scenarios.forEach((scenario, index) => {
        assert.equal(data.isAvailable(routeId, position, scenario), rows[position][index] === '1', `${routeId}/${position}/${scenario}`);
      });
    }
  }
});

test('all route suffixes start at an actual confirmed origin, with no cross-exit or cross-destination jumps', () => {
  const expectedLengths = {
    A: [6, 4, 2, 0, 0, 0, 0], B: [6, 4, 0, 2, 0, 0, 0],
    H: [6, 4, 0, 2, 0, 0, 0], P: [6, 4, 2, 0, 0, 0, 0]
  };
  for (const [routeId, lengths] of Object.entries(expectedLengths)) {
    positions.forEach((position, index) => {
      const remaining = data.getRemainingSteps(routeId, position);
      assert.equal(remaining.length, lengths[index], `${routeId}/${position}`);
      if (remaining.length) assert.equal(remaining[0].nodeFrom, position);
    });
  }
  assert.deepEqual(list(data.getRemainingSteps('H', 'streetC').map(step => step.id)), ['hospital-approach', 'enter-hospital']);
  assert.deepEqual(list(data.getRemainingSteps('P', 'streetA').map(step => step.id)), ['park-approach', 'enter-park']);
});

test('alternative routes retain the selected destination in every scenario and location', () => {
  const expected = {
    A: {
      platform: ['B', 'B', '', '', 'B', 'B'], hall: ['B', 'B', 'B', '', 'B', 'B'],
      streetA: ['', '', '', '', '', ''], streetC: ['B', 'B', 'B', 'B', 'B', 'B'],
      mall: ['', '', '', '', '', ''], hospital: ['', '', '', '', '', ''], park: ['', '', '', '', '', '']
    },
    B: {
      platform: ['A', '', '', 'A', '', 'A'], hall: ['A', '', 'A', 'A', '', 'A'],
      streetA: ['A', 'A', 'A', 'A', '', 'A'], streetC: ['', '', '', '', '', ''],
      mall: ['', '', '', '', '', ''], hospital: ['', '', '', '', '', ''], park: ['', '', '', '', '', '']
    }
  };
  for (const routeId of ['A', 'B', 'H', 'P']) {
    for (const position of positions) {
      scenarios.forEach((scenario, index) => {
        const want = expected[routeId] ? expected[routeId][position][index] : '';
        assert.deepEqual(list(data.getAlternatives(routeId, position, scenario)), want ? [want] : [], `${routeId}/${position}/${scenario}`);
      });
    }
  }
});

test('destination registry exposes the correct routes and returns defensive route-ID arrays', () => {
  const expected = { mall: ['A', 'B'], hospital: ['H'], park: ['P'] };
  assert.deepEqual(Object.keys(data.destinations).sort(), ['hospital', 'mall', 'park']);
  for (const [destination, routes] of Object.entries(expected)) {
    assert.deepEqual(list(data.routeIdsForDestination(destination)), routes);
    const copy = data.routeIdsForDestination(destination);
    copy.push('invalid');
    assert.deepEqual(list(data.routeIdsForDestination(destination)), routes);
    for (const id of routes) {
      assert.equal(data.routes[id].destination, destination);
      assert.equal(data.routes[id].steps.at(-1).nodeTo, destination);
    }
  }
  assert.equal(data.destinations.hospital.asset, 'assets/hospital.svg');
  assert.equal(data.destinations.park.asset, 'assets/park.svg');
  assert.equal(data.routes.H.steps.at(-1).asset, 'assets/hospital.svg');
  assert.equal(data.routes.P.steps.at(-1).asset, 'assets/park.svg');
});

test('entry closures and ponding block only the affected remaining path', () => {
  assert.equal(data.isAvailable('A', 'streetA', 'southClosed'), false);
  assert.equal(data.isAvailable('B', 'hall', 'southClosed'), true);
  assert.equal(data.isAvailable('P', 'streetA', 'southClosed'), true);
  assert.equal(data.isAvailable('P', 'streetA', 'rain'), false);
  assert.equal(data.isAvailable('A', 'streetA', 'rain'), true);
  assert.equal(data.isAvailable('H', 'streetC', 'rain'), true);
  assert.equal(data.isAvailable('P', 'park', 'rain'), true);
  assert.equal(data.isAvailable('H', 'streetC', 'e3'), true);
  assert.deepEqual(list(data.getAlternatives('H', 'hall', 'e3')), []);
  assert.deepEqual(list(data.getAlternatives('P', 'streetA', 'rain')), []);
});

test('unknown IDs and inherited object properties never become valid destinations or routes', () => {
  for (const id of ['missing', '__proto__', 'constructor', 'toString', null, undefined]) {
    assert.deepEqual(list(data.routeIdsForDestination(id)), []);
    assert.deepEqual(list(data.getAlternatives(id, 'hall', 'normal')), []);
    assert.deepEqual(list(data.getRemainingSteps(id, 'hall')), []);
    assert.equal(data.isAvailable(id, 'hall', 'normal'), false);
  }
  assert.deepEqual(list(data.getAlternatives('A', 'unknown', 'normal')), []);
  assert.deepEqual(list(data.getAlternatives('A', 'hall', 'unknown')), []);
});

test('hospital guidance stops at the entrance and directs floor questions to the service desk', () => {
  const lastStep = data.routes.H.steps.at(-1);
  assert.match(lastStep.instruction, /服务台确认就诊楼层/);
  assert.match(lastStep.tip, /不提供医疗建议/);
  assert.equal(lastStep.nodeTo, 'hospital');
  assert.match(data.routes.P.steps.at(-1).instruction, /园内游览路径尚未纳入/);
});
