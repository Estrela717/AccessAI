const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/data.js'), 'utf8'), sandbox);
const data = sandbox.window.ACCESS_DATA;
const ids = (steps) => Array.from(steps, (step) => step.id);

test('normal, local outage and shared outage respect the user’s confirmed location', () => {
  // Rows: normal, E2 outage, E1 outage. At mall, no remaining facility can block an arrived user.
  const expectations = {
    A: {
      platform: [true, false, false],
      hall: [true, false, true],
      streetA: [true, true, true],
      streetC: [false, false, false],
      mall: [true, true, true]
    },
    B: {
      platform: [true, true, false],
      hall: [true, true, true],
      streetA: [false, false, false],
      streetC: [true, true, true],
      mall: [true, true, true]
    }
  };
  for (const [routeId, positions] of Object.entries(expectations)) {
    for (const [position, values] of Object.entries(positions)) {
      ['normal', 'e2', 'e1'].forEach((scenario, index) => {
        assert.equal(data.isAvailable(routeId, position, scenario), values[index], `${routeId}/${position}/${scenario}`);
      });
    }
  }
});

test('rerouting at the hall skips already-completed platform steps', () => {
  const steps = data.getRemainingSteps('B', 'hall');
  assert.deepEqual(ids(steps), ['find-e3', 'ride-e3', 'east-approach', 'enter-east']);
  assert.ok(!steps.some((step) => step.facility === 'E1' || step.facility === 'E2'));
  assert.equal(steps[0].nodeFrom, 'hall');
});

test('street users continue toward their entrance without returning to an elevator', () => {
  assert.deepEqual(ids(data.getRemainingSteps('A', 'streetA')), ['south-approach', 'enter-south']);
  assert.deepEqual(ids(data.getRemainingSteps('B', 'streetC')), ['east-approach', 'enter-east']);
  assert.deepEqual(ids(data.getRemainingSteps('B', 'streetA')), []);
  assert.deepEqual(ids(data.getRemainingSteps('A', 'streetC')), []);
});

test('every route and reachable suffix is physically continuous and ends at its destination', () => {
  const streetOrigins = { A: 'streetA', B: 'streetC', H: 'streetC', P: 'streetA' };
  const expectedDestinations = { A: 'mall', B: 'mall', H: 'hospital', P: 'park' };
  for (const route of Object.values(data.routes)) {
    for (const origin of ['platform', 'hall', streetOrigins[route.id]]) {
      let position = origin;
      const steps = data.getRemainingSteps(route.id, origin);
      assert.ok(steps.length > 0);
      for (const step of steps) {
        assert.equal(step.nodeFrom, position, `${route.id}: ${step.id} cannot start at ${position}`);
        const facility = data.facilities.find((item) => item.id === step.facility);
        assert.ok(facility, `missing facility ${step.facility}`);
        if (step.nodeFrom !== step.nodeTo) {
          assert.ok(facility.connects.includes(step.nodeFrom), `${step.facility} does not serve ${step.nodeFrom}`);
          assert.ok(facility.connects.includes(step.nodeTo), `${step.facility} does not serve ${step.nodeTo}`);
        }
        position = step.nodeTo;
      }
      assert.equal(position, expectedDestinations[route.id]);
    }
  }
});

test('unknown inputs are rejected rather than treated as verified routes', () => {
  for (const [routeId, position, scenario] of [
    ['C', 'platform', 'normal'], ['A', 'unknown', 'normal'], ['A', 'platform', 'unknown'],
    ['__proto__', 'platform', 'normal'], ['A', 'toString', 'normal'], ['A', 'platform', '__proto__']
  ]) {
    assert.equal(data.isAvailable(routeId, position, scenario), false);
  }
  assert.deepEqual(ids(data.getRemainingSteps('missing', 'platform')), []);
  assert.deepEqual(ids(data.getRemainingSteps('A', 'mall')), []);
});

test('instructions include navigation context and disclose synthetic provenance', () => {
  assert.equal(data.demo, true);
  assert.match(data.notice, /虚构/);
  for (const route of Object.values(data.routes)) {
    assert.match(route.verification, /虚构/);
    for (const step of route.steps) {
      for (const field of ['id', 'title', 'floor', 'landmark', 'instruction', 'asset', 'facility', 'nodeTo']) {
        assert.equal(typeof step[field], 'string', `${step.id}: ${field}`);
        assert.ok(step[field].length > 0);
      }
    }
  }
});
