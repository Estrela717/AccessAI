'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute only the two checked-in, browser-compatible data modules. No user code.
const sandbox = { window: {} };
for (const file of ['route-network.js', 'real-data.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8'), sandbox, { timeout: 1000, filename: file });
}
const network = sandbox.window.ACCESS_NETWORK;
const stations = JSON.parse(JSON.stringify(sandbox.window.ACCESS_REAL.stations));
const chunks = stations.flatMap(station => {
  const facts = [
    ...station.streetAccess.map(entry => `${entry.label}：${entry.detail}`),
    `站内连接：${station.platformAccess}`,
    ...(station.otherFacilities.length ? [`其他设施：${station.otherFacilities.join(' ')}`] : [])
  ];
  return facts.map((fact, index) => ({
    id: `${station.id}-${index + 1}`,
    stationId: station.id,
    title: `${station.city} ${station.name} · ${station.source.name}`,
    url: station.source.url,
    excerpt: `${station.name}（${station.lines.join('、')}）。${fact} 待确认：${station.unknowns.join(' ')}`,
    retrievedAt: station.retrievedAt,
    accessMethod: station.source.accessMethod,
    publishedAt: station.source.publishedAt
  }));
});

function terms(text) {
  const normalized = text.toLowerCase().replace(/升降机/g, '电梯').replace(/洗手间/g, '卫生间');
  const latin = normalized.match(/[a-z0-9]+/g) || [];
  const chinese = normalized.match(/[\u4e00-\u9fff]+/g) || [];
  return [...new Set([...latin, ...chinese.flatMap(word => word.length < 2 ? [] : Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)))])];
}

/** Small-corpus lexical RAG: station/city filtering then character-bigram scoring.
 * It is intentionally not described as semantic/vector retrieval or live search. */
function searchKnowledge(query, limit = 4) {
  const text = query.trim();
  // Match each explicit “…站” separately, before considering bare short names.
  // Non-greedy matching also catches an unknown station alongside a known one:
  // “罗湖东站和中环站” must not borrow either station's data for 罗湖东站.
  const stationWords = text.match(/[\u4e00-\u9fff]{1,20}?站(?!厅|台|内|外|点|务)/g) || [];
  const genericNames = ['车站', '地铁站', '哪些站', '各个站', '所有站', '真实站', '已收录站', '这些站'];
  if (stationWords.some(word => !stations.some(station => word.endsWith(station.name)) && !genericNames.some(generic => word.endsWith(generic)))) return [];
  const fullNamed = stations.filter(station => stationWords.some(word => word.endsWith(station.name)));
  const named = fullNamed.length ? fullNamed : stations.filter(station => {
    const short = station.name.replace(/站$/, '');
    // “香港中环站” names Central, not both Central and Hong Kong station.
    return short !== station.city && text.includes(short);
  });
  const cities = ['深圳', '香港'].filter(city => text.includes(city));
  const queryTerms = terms(text);
  if (!queryTerms.length) return [];
  return chunks.filter(chunk => {
    const station = stations.find(item => item.id === chunk.stationId);
    return named.length ? named.some(item => item.id === station.id) : !cities.length || cities.includes(station.city);
  }).map(chunk => {
    const searchable = `${chunk.title} ${chunk.excerpt.split('待确认：')[0]}`;
    const tokenSet = new Set(terms(searchable));
    const score = queryTerms.reduce((sum, token) => sum + (tokenSet.has(token) ? 1 : 0), 0);
    return { chunk, score };
  }).filter(item => item.score >= (named.length ? 1 : 2)).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, limit).map(item => ({ ...item.chunk }));
}

module.exports = { network, stations, chunks, searchKnowledge };
