/* Official-source facility examples, retrieved 2026-11-17. Not live status or surveyed routes. */
(function () {
  'use strict';

  const retrievedAt = '2026-11-17';
  const szLine1 = 'https://www.szmc.net/szmc_m/shentieyunying/yunyingzixun/wuzhangaichengchezhinan/line1/';
  const szLine5 = 'https://www.szmc.net/szmc_m/shentieyunying/yunyingzixun/wuzhangaichengchezhinan/line5/';
  const commonUnknowns = [
    '未接入电梯实时状态；是否停运、封闭或受施工影响仍需向运营方确认。',
    '未现场核验门宽、坡度、站台间隙或从当前位置到设施的连续通行条件。',
    '不包含地图坐标、现场照片、商场入口连接或可用于导航的完整路线。'
  ];

  function source(name, url, accessMethod) {
    return { name: name, url: url, publishedAt: null, accessMethod: accessMethod };
  }

  function station(record) {
    record.retrievedAt = retrievedAt;
    record.unknowns = (record.unknowns || []).concat(commonUnknowns);
    return record;
  }

  window.ACCESS_REAL = {
    retrievedAt: retrievedAt,
    notice: '以下为真实车站的官方设施资料摘要，不是实时状态或实测路线。2026-11-17 是检索日期，来源更新时间未确认；请查看读取方式和官方原文。',
    stations: [
      station({
        id: 'sz-laojie',
        city: '深圳',
        name: '老街站',
        lines: ['1号线'],
        summary: '查看官方资料中列出的出入口与站内电梯位置。',
        streetAccess: [
          { label: 'E 出入口', detail: '官方资料列有 1 部连接站厅与站外的电梯。' }
        ],
        platformAccess: '付费区站厅中部列有 1 部连接站台的电梯。',
        otherFacilities: [],
        unknowns: ['本样例以1号线资料为范围，不代表老街站全部换乘线路与通道。'],
        source: source('深圳地铁 · 1号线无障碍设施', szLine1, '搜索引擎索引摘录')
      }),
      station({
        id: 'sz-grand-theater',
        city: '深圳',
        name: '大剧院站',
        lines: ['1号线', '2号线', '5号线'],
        summary: '查看多个出入口和线路的设施资料，具体衔接仍需核验。',
        streetAccess: [
          { label: 'F 出入口', detail: '资料列有 1 部站厅至站外电梯。' },
          { label: 'G 出入口', detail: '资料列有 1 部站厅至站外电梯。' }
        ],
        platformAccess: '站厅付费区中部的站台连接电梯：1号线、2号线各 1 部，5号线 2 部。',
        otherFacilities: ['资料列有无障碍卫生间：2号线站厅近 F 口、5号线站厅近 G 口，以及5号线往赤湾方向站台中部。'],
        unknowns: ['仅凭设施清单不能确定不同线路站台、F/G 出口间的无台阶连接。'],
        source: source('深圳地铁 · 5号线无障碍设施（大剧院站）', szLine5, '搜索引擎索引摘录')
      }),
      station({
        id: 'sz-science-museum',
        city: '深圳',
        name: '科学馆站',
        lines: ['1号线', '6号线'],
        summary: '分别查看出站电梯与站内连接，避免把不同设施位置混淆。',
        streetAccess: [
          { label: '1号线 A 出入口', detail: '资料列有 1 部出站电梯。' },
          { label: '6号线 F 出入口', detail: '资料列有 1 部出站电梯。' }
        ],
        platformAccess: '1号线和6号线站厅付费区中部各列有 1 部站台连接电梯；6号线换乘通道另列 1 部。',
        otherFacilities: [],
        unknowns: ['换乘通道电梯的存在不等于完整换乘路径已经核验。'],
        source: source('深圳地铁 · 1号线无障碍设施（科学馆站）', szLine1, '搜索引擎索引摘录')
      }),
      station({
        id: 'sz-luohu',
        city: '深圳',
        name: '罗湖站',
        lines: ['1号线'],
        summary: '深圳地铁车站资料示例，不包含口岸及其他运营方的衔接路径。',
        streetAccess: [
          { label: 'D 出入口', detail: '资料列有 1 部站厅至站外电梯。' }
        ],
        platformAccess: '站厅中部付费区列有 3 部连接站台的电梯。',
        otherFacilities: [],
        unknowns: ['没有核验与口岸、国铁车站或港铁罗湖站之间的连续通行条件。'],
        source: source('深圳地铁 · 1号线无障碍设施（罗湖站）', szLine1, '搜索引擎索引摘录')
      }),
      station({
        id: 'hk-central',
        city: '香港',
        name: '中环站',
        lines: ['荃湾线', '港岛线'],
        summary: '官方按闸外与付费区分别列出设施，可据此继续查找位置。',
        streetAccess: [
          { label: 'A 出口', detail: '港铁将此处列为闸外升降机位置。' }
        ],
        platformAccess: '官方列有付费区升降机，但本页没有逐台列出服务楼层或完整站台路径。',
        otherFacilities: ['宽闸机与便携式或活动坡板。', '付费区无障碍洗手间。', '触觉车站布局图、引导径及感应环回系统。'],
        unknowns: ['没有核验往香港站的换乘通道；坡板的使用安排仍需联系车站人员。'],
        source: source('港铁 · 无障碍设施搜寻（中环）', 'https://www.mtr.com.hk/ch/customer/services/free_search.php?query_type=search&station=1', '官方网页')
      }),
      station({
        id: 'hk-hong-kong',
        city: '香港',
        name: '香港站',
        lines: ['东涌线', '机场快线'],
        summary: '官方列出多个闸外电梯位置；站内连续路径仍需另行确认。',
        streetAccess: [
          { label: 'A / E 出口', detail: '英文官方页将两处列为闸外升降机位置。' },
          { label: 'ITCI Drop Off', detail: '官方页另列此位置；保留原标签，不推断具体街面位置。' }
        ],
        platformAccess: '本页付费区升降机栏为“—”，未提供明确的站台连接说明；不能据此推断有或没有无台阶路径。',
        otherFacilities: ['宽闸机与便携式或活动坡板。', '闸外无障碍洗手间。', '电动轮椅充电插座。'],
        unknowns: ['未核验往中环站或周边建筑的连接，也未确定 ITCI Drop Off 的现场位置。'],
        source: source('港铁 · Barrier-free Facilities Search（Hong Kong）', 'https://www.mtr.com.hk/en/customer/services/free_search.php?query_type=search&station=44', '官方网页')
      })
    ]
  };
})();
