/* Real geolocation never enters the synthetic network. Coordinates live only in memory. */
(() => {
  'use strict';
  const G=window.ACCESS_NETWORK;
  const root=document.getElementById('navigator');
  const state={mode:location.hash==='#demo'?'demo':'current',location:null,locationStatus:'idle',error:'',point:null,plan:null,confirmed:false,destination:'mall',scenario:'normal',minWidth:80,guidance:false,step:0,complete:false};
  let requestSerial=0,geoTimer=null,speaking=false;
  let importedNotice='';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const scenarios={normal:'设施正常',liftClosed:'升降设施停运',works:'医院通道施工'};
  const icons={pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',back:'<path d="M20 12H4m6-6-6 6 6 6"/>',target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',check:'<path d="m5 12 4 4L19 6"/>'};
  const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.info}</svg>`;
  const nodes=()=>Array.isArray(G.nodes)?G.nodes:Object.values(G.nodes);
  const destinations=()=>Array.isArray(G.destinations)?G.destinations:Object.values(G.destinations);
  const node=id=>nodes().find(n=>n.id===id);
  const announce=text=>{document.getElementById('nav-status').textContent=text};
  function invalidateLocation(){requestSerial++;clearTimeout(geoTimer);state.location=null;state.locationStatus='idle';state.error=''}
  function switchToDemo(){stopSpeech();importedNotice='';invalidateLocation();state.mode='demo';state.point=null;state.plan=null;state.confirmed=false;state.guidance=false;state.complete=false;render();announce('已进入虚构路网。请在地图上的人行路径选择起点。')}
  function recalculate(){stopSpeech();state.guidance=false;state.complete=false;state.step=0;state.confirmed=false;state.plan=state.point?G.plan({x:state.point.x,y:state.point.y,destinationId:state.destination,scenario:state.scenario,minWidth:state.minWidth}):null;render()}
  function choosePoint(x,y){if(state.mode!=='demo')return;state.point={x,y};recalculate();announce(state.plan.status==='ok'?'已选起点，请确认投影到的通道。':state.plan.message)}
  function locate(){
    stopSpeech();importedNotice='';invalidateLocation();const serial=requestSerial;state.mode='current';state.plan=null;state.point=null;state.confirmed=false;state.guidance=false;state.complete=false;state.locationStatus='loading';render();
    const fail=(message,status='error')=>{if(serial!==requestSerial||state.locationStatus!=='loading')return;clearTimeout(geoTimer);state.locationStatus=status;state.error=message;render();announce(message)};
    if(!window.isSecureContext){fail('当前环境不支持安全定位。请通过 HTTPS 或本机受支持的环境打开，也可以使用图上选点。');return}
    if(!navigator.geolocation){fail('此浏览器没有提供定位接口。可以使用图上选点体验。');return}
    geoTimer=setTimeout(()=>fail('定位等待超时。可以重试，或改用图上选点。','timeout'),14000);
    try{navigator.geolocation.getCurrentPosition(position=>{
      if(serial!==requestSerial||state.locationStatus!=='loading')return;
      clearTimeout(geoTimer);const {latitude,longitude,accuracy}=position.coords;
      if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0){fail('定位返回的信息不完整，暂不能确定位置。');return}
      state.location={latitude,longitude,accuracy,time:Number.isFinite(position.timestamp)?position.timestamp:Date.now()};state.locationStatus='located';render();announce('已获取位置，但此版本没有已核验的真实路网，暂不能生成路线。')
    },error=>fail(({1:'你没有允许获取位置。可以重试，或使用图上选点。',2:'设备暂时无法确定位置。请检查系统定位服务，或使用图上选点。',3:'定位超时。可以重试，或使用图上选点。'})[error?.code]||'定位失败，请重试。',error?.code===1?'denied':error?.code===3?'timeout':'error'),{enableHighAccuracy:false,timeout:10000,maximumAge:0})}catch{fail('浏览器暂时无法发起定位。可以重试，或使用图上选点。')}
  }
  function locationContent(){
    if(state.locationStatus==='loading')return `<div class="start-status"><strong>正在获取位置…</strong><p>请在浏览器提示中选择是否允许。应用不会自动授予定位权限。</p><button class="btn" data-action="cancel-location">取消</button></div>`;
    if(state.location){const l=state.location;return `<section class="location-panel"><div class="start-status"><strong>位置已获取 · 路线覆盖不足</strong><p>此版本没有接入与你的位置对应的已核验无障碍路网，暂不能生成路线。</p></div><dl class="source-dl"><dt>位置来源</dt><dd>浏览器定位</dd><dt>精度范围</dt><dd>约 ${Math.ceil(l.accuracy)} 米${l.accuracy>100?'，需要进一步确认位置':''}</dd><dt>获取时间</dt><dd>${esc(new Date(l.time).toLocaleString('zh-CN'))}</dd></dl><details><summary>查看坐标</summary><p>纬度 ${l.latitude.toFixed(5)}，经度 ${l.longitude.toFixed(5)}</p></details><div class="coverage-note">定位结果无法自动确定你所在的人行道、楼层，以及沿途是否有台阶。真实站点的设施清单也不足以证明整条路线可走。</div><a class="btn primary full" href="index.html?view=real">查看已收录的真实站点 ${icon('arrow')}</a><button class="text-btn" data-action="clear-location">清除本页位置信息</button></section>`}
    return `<div class="start-status"><strong>${state.error?'暂未确定位置':'从你所在的位置开始'}</strong><p>${esc(state.error||'点击“使用当前位置”后，由浏览器申请定位权限。定位结果仅在本页临时使用。')}</p></div><div class="planner-actions"><button class="btn primary full" data-action="locate">${icon('target')}${state.error?'重新获取位置':'使用当前位置'}</button><button class="btn full" data-action="demo">在虚构路网中体验选点</button></div><div class="coverage-note">本版尚未接入真实人行路网和动态设施状态。获取位置后，会明确提示覆盖情况。</div>`;
  }
  function demoContent(){const p=state.plan;return `<div class="form-field"><label for="destination">目的地</label><select id="destination">${destinations().map(d=>`<option value="${d.id}" ${d.id===state.destination?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div><div class="form-field"><label for="origin-node">选择起点</label><select id="origin-node"><option value="">在图上点选，或选择一个地标</option>${nodes().filter(n=>n.label).map(n=>`<option value="${n.id}" ${state.point&&state.point.x===n.x&&state.point.y===n.y?'selected':''}>${esc(n.label)}</option>`).join('')}</select><small>可在已知路段中间选点，无需先知道出口。</small></div><div class="form-field"><label for="width">通道最小净宽需求</label><select id="width"><option value="80" ${state.minWidth===80?'selected':''}>至少 80 厘米（演示设定）</option><option value="100" ${state.minWidth===100?'selected':''}>至少 100 厘米（演示设定）</option></select><small>仅演示路径筛选，不是通行安全阈值。实际需求应结合轮椅尺寸与现场条件。</small></div><div class="form-field"><label for="scenario">模拟通行条件</label><select id="scenario">${Object.entries(scenarios).map(([id,title])=>`<option value="${id}" ${id===state.scenario?'selected':''}>${title}</option>`).join('')}</select></div>${!p?'<div class="start-status"><strong>请先选一个起点</strong><p>点击地图中绿色的已知通道，系统会根据起点和目的地重新计算路线。</p></div>':p.status!=='ok'?`<div class="start-status blocked" role="status"><strong>${{'off-network':'起点尚未接入路网',unknown:'此路段通行信息不足','no-route':'没有满足条件的路径',invalid:'无法使用这个起点'}[p.status]||'暂不能规划'}</strong><p>${esc(p.message)}</p><p>可以重新选点或调整演示条件；系统不会跨越没有连接的数据区域。</p></div>`:routeContent(p)}`}
  function routeContent(p) {
    const summary = `<span class="tag">动态计算 · 虚构路径</span><h3>${esc(p.origin.label||'所选通道')} → ${esc(p.destination.name)}</h3><p><strong>${Math.round(p.distance)} 米</strong> · 演示路网距离</p>`;
    let content;
    if (!state.confirmed) {
      content = `<p>起点已贴合到附近的已知通道，请确认蓝色起点位置。地图点位不等于现实位置。</p><button class="btn primary full" data-action="confirm-origin">确认这个模拟起点</button>`;
    } else if (state.complete) {
      content = `<div class="start-status"><strong>已查看全部路段</strong><p>已到达演示终点。没有使用真实定位跟踪行程。</p></div><button class="btn full" data-action="review">重新查看路径</button><a class="text-btn" href="assistant.html">返回出行助手</a>`;
    } else if (state.guidance) {
      const step = p.steps[state.step], arc = p.edges[state.step];
      const landmark = arc ? arc.toNode.label : p.destination.name + '入口';
      content = `<div class="route-steps"><p class="muted">路段 ${state.step+1} / ${p.steps.length}</p><h3 id="current-step" tabindex="-1">${esc(step.text)}</h3><p>约 ${Math.round(step.distance)} 米 · 路段示意</p><div class="nav-landmark"><strong>下一处地标</strong><p>${esc(landmark)}</p><small>按示意路网辨认；没有使用现场照片或实时位置。</small></div><div class="planner-actions"><button class="btn" data-action="previous" ${state.step===0?'disabled':''}>上一路段</button><button class="btn primary" data-action="next">${state.step===p.steps.length-1?'完成查看':'下一路段'}</button></div><button class="btn full" data-action="speak-step">${speaking?'停止朗读':'朗读这一路段'}</button><details class="nav-feedback"><summary>这一步有问题</summary><form id="nav-feedback-form"><label for="nav-feedback-note">记录不清楚的地方</label><textarea id="nav-feedback-note" maxlength="500" required placeholder="例如：地标名称不够清楚"></textarea><p>仅保存到当前浏览器，不会通知运营方。</p><button class="btn" type="submit">保存本机反馈</button><p id="feedback-status" role="status"></p></form></details><button class="text-btn" data-action="review">返回路径概览</button></div>`;
    } else {
      content = `<p>起点已确认。路径排除了台阶、资料不足、宽度不足和当前停用的路段。</p><button class="btn primary full" data-action="guide" ${!p.steps.length?'disabled':''}>逐段查看 ${icon('arrow')}</button><ol class="route-steps">${p.steps.map(step=>`<li><span>${esc(step.text)}</span><small>${Math.round(step.distance)} 米</small></li>`).join('')}</ol>`;
    }
    return `<section class="route-summary">${summary}${content}</section>`;
  }
  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speaking=false;
    const button=root.querySelector('[data-action="speak-step"]');
    if(button) button.textContent='朗读这一路段';
  }
  function speakStep() {
    if(speaking){stopSpeech();return;}
    if(!state.guidance||!state.plan?.steps[state.step])return;
    if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)){
      announce('当前浏览器不支持朗读，请查看文字指引。');return;
    }
    const voice=window.speechSynthesis.getVoices().find(v=>/^zh/i.test(v.lang)&&v.localService);
    if(!voice){announce('未检测到本地中文语音，请查看文字指引或安装中文语音包。');return;}
    const utterance=new SpeechSynthesisUtterance(state.plan.steps[state.step].text);
    utterance.voice=voice;utterance.lang='zh-CN';utterance.rate=.9;
    utterance.onend=()=>{speaking=false;const button=root.querySelector('[data-action="speak-step"]');if(button)button.textContent='朗读这一路段';};
    utterance.onerror=()=>{utterance.onend();announce('朗读未能完成，文字指引仍可使用。');};
    speaking=true;root.querySelector('[data-action="speak-step"]').textContent='停止朗读';
    window.speechSynthesis.speak(utterance);
  }
  // Only explicit illustration coordinates can be imported. GPS is never read here.
  function importPlan() {
    const query=new URLSearchParams(location.search);
    const fields=['x','y','destinationId','minWidth','scenario'];
    if(!fields.some(key=>query.has(key)))return;
    if(location.hash!=='#demo'||fields.some(key=>!query.has(key)||!query.get(key)?.trim()||query.getAll(key).length!==1)){
      importedNotice='路线链接不完整，请重新选择起点与目的地。';return;
    }
    const input={x:Number(query.get('x')),y:Number(query.get('y')),destinationId:query.get('destinationId'),minWidth:Number(query.get('minWidth')),scenario:query.get('scenario')};
    const result=G.plan(input);
    if(result.status==='invalid') {importedNotice='路线链接参数无效，请重新选择起点与目的地。';return;}
    state.mode='demo';state.point={x:input.x,y:input.y};state.destination=input.destinationId;
    state.minWidth=input.minWidth;state.scenario=input.scenario;state.plan=result;state.confirmed=false;
    importedNotice='已载入规划条件并重新计算。请确认模拟起点后查看指引。';
  }
  // Short map labels keep adjacent facilities readable. Full labels remain in forms and steps.
  const mapLabels={
    west:['西侧人行道',100,410,'middle'],junction:['西路口',250,410,'middle'],
    eastJunction:['云桥路中段',430,410,'middle'],eastSquare:['东广场',610,360,'middle'],
    hospitalSouth:['过街口',700,410,'middle'],hospitalForecourt:['院前广场',682,266,'end'],
    hospital:['医院入口',700,115,'middle'],mall:['商场入口',430,72,'middle'],
    mallApproach:['前通道',415,184,'end'],northCross:['公园路口',250,160,'middle'],
    park:['公园东入口',110,210,'middle'],liftSouth:['E4 南侧',415,306,'end'],
    liftNorth:['E4 北侧',415,236,'end'],rampSouth:['坡道南侧',575,306,'start'],
    rampNorth:['坡道北侧',575,226,'start']
  };
  function graph(){
    const p=state.plan,nmap=Object.fromEntries(nodes().map(n=>[n.id,n]));
    const path=p?.status==='ok'?p.points.map(pt=>pt.x+','+pt.y).join(' '):'';
    const edges=G.edges.map(e=>{
      const a=nmap[e.from],b=nmap[e.to],closed=(e.closedIn||[]).includes(state.scenario);
      return `<g><title>${esc(e.label)}</title><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="network-edge ${e.kind} ${!e.known?'unknown':''} ${closed?'closed':''}"/></g>`;
    }).join('');
    const labels=nodes().map(n=>{
      const [label,x,y,anchor]=mapLabels[n.id]||[n.label,n.x,n.y+23,'middle'];
      return `<g class="network-node"><title>${esc(n.label)}</title><circle cx="${n.x}" cy="${n.y}" r="5"/><text x="${x}" y="${y}" text-anchor="${anchor}" class="network-label">${esc(label)}</text></g>`;
    }).join('');
    const destinationsMarkup=destinations().map(d=>{const n=nmap[d.nodeId];return `<g class="network-destination"><rect x="${n.x-11}" y="${n.y-12}" width="22" height="22" rx="4"/><text x="${n.x}" y="${n.y+4}" text-anchor="middle" font-size="13">${d.id==='mall'?'商':d.id==='hospital'?'医':'园'}</text></g>`}).join('');
    const origin=p?.status==='ok'?`<g class="network-origin"><circle cx="${p.origin.x}" cy="${p.origin.y}" r="13"/><text x="${p.origin.x}" y="${p.origin.y+5}" text-anchor="middle">起</text></g>`:state.point?`<g stroke="#b46e25" stroke-width="3"><path d="M${state.point.x-7} ${state.point.y-7}l14 14m-14 0 14-14"/></g>`:'';
    return `<div class="network-map-scroll" tabindex="0" aria-label="虚构路网，可横向滚动。也可使用起点选择框。"><svg id="network" class="network-map" viewBox="0 0 800 520" role="img" aria-label="虚构人行路网。可以点选路径作为起点；键盘用户可通过起点下拉框选择地标。"><rect width="800" height="520" fill="#f4f6f8"/><defs><pattern id="network-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" stroke="#e4e9ee" fill="none"/></pattern></defs><rect width="800" height="520" fill="url(#network-grid)"/><text x="28" y="35" fill="#6a7787" font-size="13">云桥片区 · 虚构路网</text>${edges}${path?`<polyline points="${path}" class="network-route ${state.confirmed?'':'pending'}"/>`:''}${labels}${destinationsMarkup}${origin}</svg></div><p class="map-scroll-hint">左右滑动查看完整路网；也可在起点选择框中选择地标。</p>`;
  }
  function render(focusSelector){
    const active=document.activeElement;
    const previousFocus=root.contains(active)?(active.id?'#'+active.id:active.dataset.action?'[data-action="'+active.dataset.action+'"]':null):null;
    const scrollLeft=root.querySelector('.network-map-scroll')?.scrollLeft||0;
    let large=false;try{large=JSON.parse(localStorage.getItem('accessai:settings')||'{}').large===true}catch{}document.body.classList.toggle('large-text',large);root.innerHTML=`<div class="nav-shell"><header class="nav-header"><a class="brand" href="index.html"><img src="assets/favicon.svg" alt="">AccessAI.</a><div class="nav-header-actions"><a class="text-btn" href="assistant.html">出行助手</a><a class="text-btn" href="index.html">${icon('back')}返回首页</a></div></header><main class="nav-main"><div class="nav-intro"><h1>从这里出发</h1><p>先确定起点，再按通行需求选择路径。</p></div><div class="start-tabs" role="group" aria-label="起点方式"><button class="${state.mode==='current'?'active':''}" aria-pressed="${state.mode==='current'}" data-action="locate">${icon('target')}使用当前位置</button><button class="${state.mode==='demo'?'active':''}" aria-pressed="${state.mode==='demo'}" data-action="demo">${icon('pin')}图上选点 · 模拟体验</button></div>${importedNotice?`<p class="start-status" role="status">${esc(importedNotice)}</p>`:''}<div class="navigator-grid"><aside id="planner" class="planner-panel"><h2>${state.mode==='current'?'当前位置':'起点与目的地'}</h2>${state.mode==='current'?locationContent():demoContent()}</aside><section class="network-panel"><div class="network-toolbar"><h2>${state.mode==='current'?'数据覆盖':'点选起点'}</h2><span class="map-hint">${state.mode==='current'?'真实位置与演示路网不混用':'点击绿色通道，可从路段中间出发'}</span></div>${state.mode==='current'?`<div class="network-placeholder">${icon('target')}<h3>${state.location?'已定位，尚无可用路网':'先确定你的位置'}</h3><p>${state.location?'附近尚无已核验的连续无障碍路径。本版不会把你放到虚构地图中。':'定位可以提供起点，但一条可走的路线还需要连续的人行通道、出入口、电梯及状态数据。'}</p><button class="btn" data-action="demo">体验有路网时的规划方式</button></div>`:graph()}<div class="network-legend">${state.mode==='demo'?'<span><i class="legend-path"></i>已知通道</span><span><i class="legend-route"></i>计算路径</span><span><i class="legend-unknown"></i>信息不足</span><span><i class="closed"></i>停用</span><span><i class="legend-stairs"></i>台阶</span>':'<span>当前尚未接入真实路网</span>'}</div><p class="network-caption">${state.mode==='current'?'应用不上传或持久化本页的定位结果。浏览器及系统定位服务按照它们自己的设置工作。':'演示路网没有对应的真实地理坐标。台阶、净宽、设备状态与距离均为合成数据；不用于实际出行。'}</p></section></div><section class="coverage-note"><strong>真实产品需要怎样的数据？</strong><p>从起点所在的人行道，连接到路缘坡道、过街通道、电梯、入口，再到目的地。每段都需要通行条件与来源；只有设施清单，还不足以判断整条路能否走通。</p><a class="text-btn" href="index.html?view=real">查看已收录的真实站点资料 ${icon('arrow')}</a></section></main></div>`;
    const scrollArea=root.querySelector('.network-map-scroll');if(scrollArea)scrollArea.scrollLeft=scrollLeft;
    const target=focusSelector||previousFocus;if(target)root.querySelector(target)?.focus({preventScroll:!focusSelector});
  }
  root.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button){const action=button.dataset.action;if(action!=='speak-step')stopSpeech();if(action==='speak-step')speakStep();else if(action==='locate')locate();else if(action==='demo')switchToDemo();else if(action==='clear-location'||action==='cancel-location'){invalidateLocation();render();announce('本页位置已清除')}else if(action==='confirm-origin'){state.confirmed=true;render('[data-action="guide"]');announce('模拟起点已确认，可以逐段查看路径')}else if(action==='guide'){state.guidance=true;state.step=0;state.complete=false;render('[data-action="next"]')}else if(action==='previous'){state.step=Math.max(0,state.step-1);render();announce(state.plan.steps[state.step]?.text)}else if(action==='next'){if(state.step+1>=state.plan.steps.length){state.complete=true;state.guidance=false}else state.step++;render(state.complete?'[data-action="review"]':undefined);announce(state.complete?'已查看全部路段':state.plan.steps[state.step]?.text)}else if(action==='review'){state.guidance=false;state.complete=false;render('[data-action="guide"]')}return}const svg=event.target.closest('#network');if(svg){const m=svg.getScreenCTM();if(!m)return;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());choosePoint(p.x,p.y)}});
  root.addEventListener('change',event=>{const id=event.target.id;if(id==='origin-node'){const n=node(event.target.value);if(n)choosePoint(n.x,n.y)}else if(id==='destination'){state.destination=event.target.value;recalculate();announce('目的地已更改，请重新确认模拟起点')}else if(id==='scenario'){state.scenario=event.target.value;recalculate();announce('通行条件已更改，路径已重新计算，请确认起点')}else if(id==='width'){state.minWidth=Number(event.target.value);recalculate();announce('宽度需求已更改，路径已重新计算')}});
  window.addEventListener('pagehide',()=>{stopSpeech();invalidateLocation();state.plan=null;state.point=null});
  root.addEventListener('submit', event=>{
    if(event.target.id!=='nav-feedback-form')return;
    event.preventDefault();
    const note=root.querySelector('#nav-feedback-note').value.trim();
    const status=root.querySelector('#feedback-status');
    if(!note){status.textContent='请填写需要改进的地方。';return;}
    try{
      const stored=JSON.parse(localStorage.getItem('accessai:reports')||'[]');
      const reports=Array.isArray(stored)?stored:[];
      reports.unshift({id:Date.now().toString(36),type:'动态规划：指引反馈',note:note.slice(0,500),location:state.plan.steps[state.step].text,time:new Date().toLocaleString('zh-CN')});
      localStorage.setItem('accessai:reports',JSON.stringify(reports.slice(0,100)));
      status.textContent='已保存到本机；可在首页的反馈记录中查看或删除。';
      root.querySelector('#nav-feedback-note').value='';
    }catch{status.textContent='浏览器无法保存，请复制记录；此反馈尚未保存。';}
  });
  importPlan();
  if('speechSynthesis' in window)window.speechSynthesis.getVoices();
  render();
})();
