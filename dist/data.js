/* AccessAI demonstration data. All places, measurements and verification records are fictional. */
(function () {
  'use strict';

  const sharedSteps = [
    {
      id: 'find-e1',
      title: '沿站台找到 E1 电梯',
      floor: 'B2 · 站台层',
      landmark: '深绿色 E1 电梯标识 · 站台中部',
      instruction: '面向站台中部的服务标识，沿平坦通道前行。找到标有 E1 的直梯后，在电梯门前确认到达。',
      asset: 'assets/platform.svg',
      facility: 'E1',
      nodeFrom: 'platform',
      nodeTo: 'platform',
      tip: '这是地标示意图；演示中请手动确认位置。'
    },
    {
      id: 'ride-e1',
      title: '乘 E1 电梯到站厅',
      floor: 'B2 → B1 · 站台到站厅',
      landmark: 'E1 电梯 · 选择 B1 层',
      instruction: '进入 E1 电梯，选择 B1 站厅层。出电梯后留在服务台一侧，确认已到达站厅，再查看下一步。',
      asset: 'assets/platform.svg',
      facility: 'E1',
      nodeFrom: 'platform',
      nodeTo: 'hall',
      tip: 'E1 是站台与站厅之间各条演示路线共用的电梯。'
    }
  ];

  const routes = {
    A: {
      id: 'A',
      destination: 'mall',
      name: 'A 出口 · 南入口路线',
      exit: 'A 出口',
      entrance: '星河商场南入口',
      distance: 380,
      minutes: 8,
      summary: '经过 E1、E2 两部直梯，从 A 出口抵达商场南入口。全程无台阶，样例条件下无需人工协助。',
      tags: ['全程无台阶', '2 部直梯', '入口较近'],
      verification: '虚构核验记录 · 2026-11-17 09:30',
      source: 'AccessAI 演示团队 · 合成样例',
      steps: sharedSteps.map(function (step) { return Object.assign({}, step); }).concat([
        {
          id: 'find-e2',
          title: '通过宽闸机，找到 E2 电梯',
          floor: 'B1 · 站厅层',
          landmark: '服务台右侧 · A 出口指示牌',
          instruction: '面向服务台，沿右侧通道通过宽闸机。继续跟随 A 出口指示牌，找到标有 E2 的直梯。',
          asset: 'assets/hall.svg',
          facility: 'E2',
          nodeFrom: 'hall',
          nodeTo: 'hall',
          tip: '确认是 E2 直梯，旁边的自动扶梯不属于本路线。'
        },
        {
          id: 'ride-e2',
          title: '乘 E2 电梯到 A 出口街面',
          floor: 'B1 → 1F · 站厅到地面',
          landmark: 'E2 电梯 · 选择 1F 层',
          instruction: '乘 E2 到 1F 地面层。出电梯后可见云桥广场与商场南侧立面，请在街面出口确认到达。',
          asset: 'assets/elevator.svg',
          facility: 'E2',
          nodeFrom: 'hall',
          nodeTo: 'streetA',
          tip: '此步完成后，当前位置更新为 A 出口街面。'
        },
        {
          id: 'south-approach',
          title: '沿广场平坦通道前往南入口',
          floor: '1F · 街面',
          landmark: '广场花池 · 连续平坦通道',
          instruction: '沿花池外侧的连续平坦通道前行，到达商场南侧入口前的小广场。遵循示意图中的入口方向。',
          asset: 'assets/street.svg',
          facility: 'path-south',
          nodeFrom: 'streetA',
          nodeTo: 'streetA',
          tip: '街面通道与开放时间均为演示设定，未经实际勘测。'
        },
        {
          id: 'enter-south',
          title: '从南入口自动门进入商场',
          floor: '1F · 商场入口',
          landmark: '「星河商场」门头 · 南入口自动门',
          instruction: '找到南入口的平层自动门，确认门已开启后进入一层大厅。到达后点击确认，完成本次演示。',
          asset: 'assets/entrance.svg',
          facility: 'entrance-south',
          nodeFrom: 'streetA',
          nodeTo: 'mall',
          tip: '样例开放时间 10:00–22:00；此信息不是实时营业信息。'
        }
      ])
    },
    B: {
      id: 'B',
      destination: 'mall',
      name: 'C 出口 · 东入口路线',
      exit: 'C 出口',
      entrance: '星河商场东入口',
      distance: 560,
      minutes: 12,
      summary: '经过 E1、E3 两部直梯，沿东侧通道抵达商场东入口。距离稍长，可绕开 E2 电梯。',
      tags: ['全程无台阶', '2 部直梯', '可绕开 E2'],
      verification: '虚构核验记录 · 2026-11-17 09:30',
      source: 'AccessAI 演示团队 · 合成样例',
      steps: sharedSteps.map(function (step) { return Object.assign({}, step); }).concat([
        {
          id: 'find-e3',
          title: '通过宽闸机，找到 E3 电梯',
          floor: 'B1 · 站厅层',
          landmark: '服务台左侧 · C 出口指示牌',
          instruction: '面向服务台，沿左侧通道通过宽闸机。跟随 C 出口指示牌，找到标有 E3 的直梯。',
          asset: 'assets/hall-c.svg',
          facility: 'E3',
          nodeFrom: 'hall',
          nodeTo: 'hall',
          tip: '从站厅改道可直接前往 E3，无需返回站台。'
        },
        {
          id: 'ride-e3',
          title: '乘 E3 电梯到 C 出口街面',
          floor: 'B1 → 1F · 站厅到地面',
          landmark: 'E3 电梯 · 选择 1F 层',
          instruction: '乘 E3 到 1F 地面层。出电梯后可见商场东侧通道，请在 C 出口街面确认到达。',
          asset: 'assets/elevator.svg',
          facility: 'E3',
          nodeFrom: 'hall',
          nodeTo: 'streetC',
          tip: '此步完成后，当前位置更新为 C 出口街面。'
        },
        {
          id: 'east-approach',
          title: '沿东侧平坦通道前往商场',
          floor: '1F · 街面',
          landmark: '东侧绿化带 · 缓坡衔接处',
          instruction: '沿绿化带旁的平坦通道前行，经示意图中的缓坡衔接处，到达商场东入口前。',
          asset: 'assets/street.svg',
          facility: 'path-east',
          nodeFrom: 'streetC',
          nodeTo: 'streetC',
          tip: '坡道条件为合成样例，不代表任何真实地点的通行条件。'
        },
        {
          id: 'enter-east',
          title: '从东入口自动门进入商场',
          floor: '1F · 商场入口',
          landmark: '「星河商场」门头 · 东入口自动门',
          instruction: '找到东入口的平层自动门，确认门已开启后进入一层大厅。到达后点击确认，完成本次演示。',
          asset: 'assets/entrance.svg',
          facility: 'entrance-east',
          nodeFrom: 'streetC',
          nodeTo: 'mall',
          tip: '样例开放时间 10:00–22:00；此信息不是实时营业信息。'
        }
      ])
    }
  };

  const destinations = {
    mall: { id: 'mall', name: '星河商场', kind: '商场', routeIds: ['A', 'B'], asset: 'assets/entrance.svg', summary: '从地铁站台到商场无台阶入口，体验主路线与备用入口切换。' },
    hospital: { id: 'hospital', name: '云桥社区医院', kind: '就医', routeIds: ['H'], asset: 'assets/hospital.svg', summary: '经 C 出口抵达门诊无台阶入口；进入后由服务台确认就诊楼层与后续通道。' },
    park: { id: 'park', name: '云桥公园', kind: '公园', routeIds: ['P'], asset: 'assets/park.svg', summary: '经 A 出口沿公园通道抵达平层入口，体验雨天积水影响通行的场景。' }
  };

  // The hospital and park share verified-for-demo station segments, while each
  // keeps its own final approach, destination and entrance dependencies.
  routes.H = {
    id: 'H',
    destination: 'hospital',
    name: 'C 出口 · 社区医院路线',
    exit: 'C 出口',
    entrance: '云桥社区医院门诊入口',
    distance: 680,
    minutes: 14,
    summary: '经过 E1、E3 两部直梯，从 C 出口抵达社区医院门诊无台阶入口。进入后请向服务台确认就诊楼层与通行路径。',
    tags: ['全程无台阶', '门诊入口', '楼层需服务台确认'],
    verification: '虚构核验记录 · 2026-11-17 09:30',
    source: 'AccessAI 演示团队 · 合成样例',
    steps: routes.B.steps.slice(0, 4).map(function (step) { return Object.assign({}, step); }).concat([
      {
        id: 'hospital-approach',
        title: '沿东侧通道前往社区医院',
        floor: '1F · 街面',
        landmark: 'C 出口外 · 社区医院方向标识',
        instruction: '确认 C 出口标识后，沿东侧连续平坦通道前行，找到「云桥社区医院」门头与门诊入口方向标识。',
        asset: 'assets/hospital.svg',
        facility: 'path-hospital',
        nodeFrom: 'streetC',
        nodeTo: 'streetC',
        tip: '本步骤只描述虚构的到达路径，不提供诊疗或科室选择建议。'
      },
      {
        id: 'enter-hospital',
        title: '从门诊无台阶入口进入医院',
        floor: '1F · 门诊入口',
        landmark: '「云桥社区医院」门头 · 门诊平层自动门',
        instruction: '找到门诊无台阶入口，确认自动门开启后进入一层大厅。请向服务台确认就诊楼层、电梯位置与后续通道。',
        asset: 'assets/hospital.svg',
        facility: 'entrance-hospital',
        nodeFrom: 'streetC',
        nodeTo: 'hospital',
        tip: '本演示止于一层入口。楼层与科室位置未核验，不提供医疗建议或就诊预约服务。'
      }
    ])
  };
  routes.H.steps[3].instruction = '乘 E3 到 1F 地面层。出电梯后确认 C 出口标识，在街面出口确认到达，再查看社区医院方向。';

  routes.P = {
    id: 'P',
    destination: 'park',
    name: 'A 出口 · 云桥公园路线',
    exit: 'A 出口',
    entrance: '云桥公园东入口',
    distance: 460,
    minutes: 10,
    summary: '经过 E1、E2 两部直梯，从 A 出口沿公园通道抵达东侧平层入口。雨天积水场景下暂停使用公园通道。',
    tags: ['全程无台阶', '公园入口', '关注路面积水'],
    verification: '虚构核验记录 · 2026-11-17 09:30',
    source: 'AccessAI 演示团队 · 合成样例',
    steps: routes.A.steps.slice(0, 4).map(function (step) { return Object.assign({}, step); }).concat([
      {
        id: 'park-approach',
        title: '沿公园通道前往东入口',
        floor: '1F · 街面',
        landmark: '云桥公园指示牌 · 绿化带旁通道',
        instruction: '从 A 出口外沿公园指示牌前行，经过绿化带旁的连续平坦通道，到达公园东入口前。若发现积水或封闭，请先确认通行条件。',
        asset: 'assets/park.svg',
        facility: 'path-park',
        nodeFrom: 'streetA',
        nodeTo: 'streetA',
        tip: '“雨天积水”是预设演示事件，表示此通道不可用，不代表实时天气。'
      },
      {
        id: 'enter-park',
        title: '从平层东入口进入公园',
        floor: '地面 · 公园入口',
        landmark: '「云桥公园」入口牌 · 平层通道',
        instruction: '找到公园东入口的平层通道，通过入口后确认到达。本演示到此结束，园内游览路径尚未纳入指引。',
        asset: 'assets/park.svg',
        facility: 'entrance-park',
        nodeFrom: 'streetA',
        nodeTo: 'park',
        tip: '入口与地面状况均为虚构样例；园内路径与设施需另行核验。'
      }
    ])
  };
  routes.P.steps[3].instruction = '乘 E2 到 1F 地面层。出电梯后确认 A 出口标识，在街面出口确认到达，再查看云桥公园方向。';

  // Positions are intentionally coarse and explicitly confirmed by the user.
  // No unverified street-A / street-C connection is invented when changing routes.
  const startIndices = {
    A: { platform: 0, hall: 2, streetA: 4, mall: 6 },
    B: { platform: 0, hall: 2, streetC: 4, mall: 6 },
    H: { platform: 0, hall: 2, streetC: 4, hospital: 6 },
    P: { platform: 0, hall: 2, streetA: 4, park: 6 }
  };
  const scenarios = {
    normal: { label: '设施正常', unavailable: [] },
    e2: { label: 'E2 电梯停运', unavailable: ['E2'] },
    e1: { label: 'E1 电梯停运', unavailable: ['E1'] },
    e3: { label: 'E3 电梯停运', unavailable: ['E3'] },
    southClosed: { label: '商场南入口关闭', unavailable: ['entrance-south'] },
    rain: { label: '公园通道积水', unavailable: ['path-park'] }
  };

  function hasStart(routeId, position) {
    return Object.prototype.hasOwnProperty.call(startIndices, routeId) &&
      Object.prototype.hasOwnProperty.call(startIndices[routeId], position);
  }

  function getRemainingSteps(routeId, position) {
    if (!hasStart(routeId, position)) return [];
    return routes[routeId].steps.slice(startIndices[routeId][position]);
  }

  function isAvailable(routeId, position, scenario) {
    if (!hasStart(routeId, position) || !Object.prototype.hasOwnProperty.call(scenarios, scenario)) return false;
    const blocked = scenarios[scenario].unavailable;
    return getRemainingSteps(routeId, position).every(function (step) {
      return blocked.indexOf(step.facility) === -1;
    });
  }

  function routeIdsForDestination(destinationId) {
    if (!Object.prototype.hasOwnProperty.call(destinations, destinationId)) return [];
    return destinations[destinationId].routeIds.slice();
  }

  function getAlternatives(routeId, position, scenario) {
    if (!Object.prototype.hasOwnProperty.call(routes, routeId)) return [];
    return routeIdsForDestination(routes[routeId].destination).filter(function (candidateId) {
      return candidateId !== routeId && isAvailable(candidateId, position, scenario) &&
        getRemainingSteps(candidateId, position).length > 0;
    });
  }

  window.ACCESS_DATA = {
    demo: true,
    notice: '全部地点、路线、距离、开放时间及核验记录均为虚构演示数据，请勿用于实际出行。',
    places: [
      { id: 'station', name: '云桥地铁站', kind: '地铁站', subtitle: '演示地点 · 站台、站厅与街面出口' },
      { id: 'mall', name: '星河商场', kind: '商场', subtitle: '演示地点 · 南入口 / 东入口' },
      { id: 'hospital', name: '云桥社区医院', kind: '就医', subtitle: '演示地点 · 门诊无台阶入口' },
      { id: 'park', name: '云桥公园', kind: '公园', subtitle: '演示地点 · 东侧平层入口' }
    ],
    destinations: destinations,
    routes: routes,
    facilities: [
      { id: 'E1', name: 'E1 无障碍电梯', floor: 'B2 / B1', connects: ['platform', 'hall'], description: '连接站台与站厅，是各条演示路线共用的设施。' },
      { id: 'E2', name: 'E2 无障碍电梯', floor: 'B1 / 1F', connects: ['hall', 'streetA'], description: '连接站厅与 A 出口街面，位于服务台右侧通道。' },
      { id: 'E3', name: 'E3 无障碍电梯', floor: 'B1 / 1F', connects: ['hall', 'streetC'], description: '连接站厅与 C 出口街面，可从站厅绕开 E2。' },
      { id: 'path-south', name: '南侧平坦通道', floor: '1F', connects: ['streetA'], description: '连接 A 出口前广场与商场南入口的演示通道。' },
      { id: 'path-east', name: '东侧缓坡通道', floor: '1F', connects: ['streetC'], description: '连接 C 出口与商场东入口的演示通道。' },
      { id: 'entrance-south', name: '商场南入口', floor: '1F', connects: ['streetA', 'mall'], description: '样例平层自动门；样例开放时间 10:00–22:00。' },
      { id: 'entrance-east', name: '商场东入口', floor: '1F', connects: ['streetC', 'mall'], description: '样例平层自动门；样例开放时间 10:00–22:00。' },
      { id: 'path-hospital', name: '医院门诊入口通道', floor: '1F', connects: ['streetC'], description: '连接 C 出口与社区医院门诊入口的演示平坦通道。' },
      { id: 'entrance-hospital', name: '医院门诊入口', floor: '1F', connects: ['streetC', 'hospital'], description: '样例无台阶自动门；进入后需要向服务台确认就诊楼层和后续路径。' },
      { id: 'path-park', name: '公园东侧通道', floor: '地面', connects: ['streetA'], description: '连接 A 出口与公园东入口的演示通道；积水场景下不可用。' },
      { id: 'entrance-park', name: '公园东入口', floor: '地面', connects: ['streetA', 'park'], description: '演示平层入口；园内路径未纳入本次指引。' }
    ],
    positions: {
      platform: '云桥站 · B2 站台',
      hall: '云桥站 · B1 站厅',
      streetA: 'A 出口 · 街面',
      streetC: 'C 出口 · 街面',
      mall: '星河商场 · 一层大厅',
      hospital: '云桥社区医院 · 一层门诊大厅',
      park: '云桥公园 · 东入口内'
    },
    scenarios: scenarios,
    getRemainingSteps: getRemainingSteps,
    isAvailable: isAvailable,
    routeIdsForDestination: routeIdsForDestination,
    getAlternatives: getAlternatives
  };
})();
