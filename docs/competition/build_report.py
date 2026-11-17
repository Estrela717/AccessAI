"""Build the competition preparation PDF. Run with Python and reportlab/pypdf.

Examples:
  python -m pip install reportlab pypdf
  python docs/competition/build_report.py

This report deliberately separates implementation validation from live-model and
field validation. Update verification.json only from observed test results.
"""
from pathlib import Path
import json
import sys
from html import escape

HERE = Path(__file__).resolve().parent
if (HERE / '.build-deps').exists():
    sys.path.insert(0, str(HERE / '.build-deps'))
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable

OUT = HERE / 'AccessAI-technical-report.pdf'
FONT_PATH = Path('C:/Windows/Fonts/simhei.ttf')
if not FONT_PATH.exists():
    raise RuntimeError('Provide a CJK TrueType font by changing FONT_PATH in build_report.py.')
pdfmetrics.registerFont(TTFont('CN', str(FONT_PATH)))
BLUE = colors.HexColor('#2459A8')
NAVY = colors.HexColor('#102B4B')
INK = colors.HexColor('#21354B')
MUTED = colors.HexColor('#607287')
PALE = colors.HexColor('#F0F5FC')
LINE = colors.HexColor('#DCE5EF')
WHITE = colors.white
PAGE_W, PAGE_H = A4
WIDTH = PAGE_W - 92
verify = json.loads((HERE / 'verification.json').read_text(encoding='utf-8'))
STYLES = {
    'body': ParagraphStyle('body', fontName='CN', fontSize=10.2, leading=17, textColor=INK, spaceAfter=8, wordWrap='CJK'),
    'small': ParagraphStyle('small', fontName='CN', fontSize=8.7, leading=14, textColor=MUTED, spaceAfter=6, wordWrap='CJK'),
    'h1': ParagraphStyle('h1', fontName='CN', fontSize=22, leading=29, textColor=NAVY, spaceAfter=15, wordWrap='CJK'),
    'h2': ParagraphStyle('h2', fontName='CN', fontSize=13.4, leading=20, textColor=BLUE, spaceBefore=10, spaceAfter=7, wordWrap='CJK'),
    'hero': ParagraphStyle('hero', fontName='CN', fontSize=36, leading=46, textColor=NAVY, spaceAfter=10, wordWrap='CJK'),
    'subtitle': ParagraphStyle('subtitle', fontName='CN', fontSize=18, leading=28, textColor=BLUE, spaceAfter=16, wordWrap='CJK'),
    'cell': ParagraphStyle('cell', fontName='CN', fontSize=9.1, leading=15, textColor=INK, wordWrap='CJK'),
    'headcell': ParagraphStyle('headcell', fontName='CN', fontSize=9.1, leading=15, textColor=WHITE, wordWrap='CJK'),
}
story = []
def para(text, style='body'):
    return Paragraph(text, STYLES[style])
def p(text, style='body'):
    story.append(para(text, style))
def title(number, heading):
    p(f'{number} / ACCESSAI', 'small')
    p(heading, 'h1')
def h(text): p(text, 'h2')
def bullet(text): p('- ' + text)
def table(headers, rows, widths=None):
    widths = widths or [WIDTH / len(headers)] * len(headers)
    cells = [[para(escape(str(x)), 'headcell') for x in headers]]
    cells.extend([[para(escape(str(x)), 'cell') for x in row] for row in rows])
    t = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,0), NAVY),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE,PALE]),
        ('LINEBELOW',(0,0),(-1,0),0.5,NAVY),
        ('LINEBELOW',(0,1),(-1,-1),0.4,LINE),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),10), ('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),9), ('BOTTOMPADDING',(0,0),(-1,-1),9),
    ]))
    story.extend([t,Spacer(1,10)])
def callout(label, text):
    t = Table([[para(label,'h2')],[para(text)]], colWidths=[WIDTH])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),0.7,LINE),('LEFTPADDING',(0,0),(-1,-1),14),('RIGHTPADDING',(0,0),(-1,-1),14),('BOTTOMPADDING',(0,-1),(-1,-1),10)]))
    story.extend([t,Spacer(1,12)])
def page(): story.append(PageBreak())

class Architecture(Flowable):
    def __init__(self): super().__init__(); self.width=WIDTH; self.height=184
    def draw(self):
        c=self.canv
        items=[('用户需求与可选条件','自然语言 / 起点 / 净宽 / 模拟状态'),('AI 接入与工具编排','模型 API / 有限轮次 / 参数验证'),('确定性工具与知识资料','连续路网规划 / 官方资料检索'),('可信结果与可执行界面','路线卡片 / 来源 / 分步指引')]
        boxw=(WIDTH-24)/2; boxh=73
        positions=[(0,105),(boxw+24,105),(boxw+24,0),(0,0)]
        for i,((label,sub),(x,y)) in enumerate(zip(items,positions)):
            c.setFillColor(PALE); c.setStrokeColor(LINE); c.roundRect(x,y,boxw,boxh,8,fill=1,stroke=1)
            c.setFillColor(BLUE); c.setFont('CN',11); c.drawString(x+13,y+46,label)
            c.setFillColor(MUTED); c.setFont('CN',8.6); c.drawString(x+13,y+23,sub)
        c.setStrokeColor(BLUE); c.setLineWidth(1.4)
        for x1,y1,x2,y2 in [(boxw+4,141,boxw+20,141),(boxw+24+boxw/2,100,boxw+24+boxw/2,78),(boxw+20,36,boxw+4,36)]:
            c.line(x1,y1,x2,y2)
            if x1==x2: c.line(x2,y2,x2-3,y2+5); c.line(x2,y2,x2+3,y2+5)
            else:
                s=1 if x2>x1 else -1
                c.line(x2,y2,x2-s*5,y2-3); c.line(x2,y2,x2-s*5,y2+3)

# 1. Cover and project overview.
p('2026 第九届传智杯 · AI WEB 网页开发挑战赛', 'small')
story.append(Spacer(1,35))
p('AccessAI', 'hero')
p('面向轮椅出行的\n可解释 AI 规划助手'.replace('\n','<br/>'), 'subtitle')
p('技术文档 · 参赛准备版', 'h2')
p('版本：v4 工作版本  |  文档日期：2026-11-17', 'small')
story.append(Spacer(1,12))
callout('当前状态：模型待配置', '本版本实现模型接入、工具调用、资料检索及前端交互；尚未配置模型 API，不能将规则演示或模拟上游测试作为真实模型效果。真实路线、实时设施状态与现场用户验证仍待补全。')
p('项目围绕轮椅使用者出行最后一段的实际困难展开：入口难找、设施信息分散、路径条件不清，以及受阻后缺少可解释的下一步。系统让自然语言需求进入已有的确定性寻路与资料查询流程，并将结果转化为来源清楚、可继续操作的网页卡片。')
table(['提交信息','填写内容'],[
    ['参赛学校 / 组别','待团队填写并核对资格'],
    ['团队成员 / 指导教师','待团队填写'],
    ['代码仓库 / 演示地址','待团队填写；线上演示为可选加分项'],
    ['材料状态','本报告为准备稿；完成模型实测与团队信息后更新再提交'],
],[130,WIDTH-130])
p('本文不包含未经验证的准确率、用户增长、现场可达性或获奖承诺。', 'small')
page()

# 2. Requirements.
title('02','问题定义与需求边界')
p('目标用户为轮椅使用者及同行协助者。产品以“能否走通、下一步在哪里、受阻怎么办”为主要任务，减少在地图、设施表和文字说明之间来回切换的负担。')
table(['场景','用户需要','本版本支持'],[
    ['表达出行需求','用自然语言表达目的地及通行条件','AI 接口提取意图并调用工具；模型效果待实测'],
    ['判断路径可通行','避开台阶、宽度不足、停用及未知路段','虚构连续路网内动态计算和过滤'],
    ['查询设施资料','找到车站电梯、出口与资料来源','检索六个真实车站的官方资料摘要'],
    ['遇到阻断','保持原目的地并解释不可达原因','演示路网重算；没有连接时明确拒绝生成路径'],
    ['执行路线','看清每一步并按需朗读','路线结果进入分段指引；兼容键盘和移动布局'],
],[88,164,WIDTH-252])
h('两类数据必须明确区分')
bullet('模拟路径：云桥片区使用示意图坐标，节点、距离、净宽、设施和停运状态均为合成数据，只用于算法和交互演示。')
bullet('真实站点资料：深圳老街、大剧院、科学馆、罗湖，以及香港中环、香港站的设施摘要；保留来源与检索日期，不包含完整路线或实时状态。')
h('明确不承诺的能力')
p('浏览器定位不等于真实路网覆盖；设施存在不等于当前可用；路线测试通过不等于实际道路可通行。系统不会将真实经纬度放入虚构地图，也不会用未知连接拼出一条“可达”路线。')
page()

# 3. Architecture.
title('03','系统架构与数据流')
story.extend([Architecture(),Spacer(1,15)])
p('前端采用原生 HTML、CSS 与 JavaScript，保留现有离线体验；Node.js 服务提供静态资源与 AI 接入层。AI 通过限定工具访问路网和资料，工具输出作为路线卡片与来源卡片的依据。')
table(['层次','职责','主要文件 / 接口'],[
    ['交互层','需求输入、状态反馈、取消重试、结果和来源展示','dist/assistant.html、assistant.js、assistant.css'],
    ['接入层','配置检测、请求校验、模型调用和工具执行编排','server.cjs、lib/；/api/health、/api/assistant'],
    ['路径层','起点投影、双向寻路、通行约束过滤','dist/route-network.js'],
    ['资料层','从站点记录生成可检索片段，返回出处与未知项','dist/real-data.js 与服务端检索模块'],
    ['指引层','参数交接、再次确认起点、逐段查看与朗读','dist/navigate.html、navigator.js'],
],[67,221,WIDTH-288])
h('运行模式')
p('live 模式调用用户配置的模型服务。缺少配置时明确返回不可用状态。reference 模式由用户主动选择，执行本地规则及工具，界面持续标明“规则演示（非 AI）”。两种模式不互相伪装。')
page()

# 4. AI.
title('04','AI 技术方案与可控性')
h('模型接入：兼容接口，选型后实测')
p('通过 AI_BASE_URL、AI_MODEL、AI_API_KEY 配置支持 Function Calling 的 OpenAI 兼容接口。当前未绑定或评价某个具体模型。正式选型应比较中文意图理解、工具调用正确率、延迟、价格与部署可用性。')
h('工具工作流：模型表达意图，算法验证路径')
p('模型可调用 plan_accessible_route 和 search_station_knowledge。服务端验证工具名称及参数，限制循环轮次，并保留实际执行记录。路径工具只接受已有演示节点及合法条件；缺少起点或通行条件不明确时应补问，不能猜测现实位置。')
h('RAG：小规模资料检索增强生成')
p('将六个真实车站的记录组织为资料片段，使用站名、城市、设施与查询文本进行词法检索，向模型提供命中的摘要、未知事项和出处。该方案是词法检索 RAG，未使用向量数据库，也不声称具备大规模语义检索能力。检索无匹配时应说明覆盖不足。')
table(['风险','控制措施'],[
    ['模型编造路线','只由确定性路径工具返回路线结构；模型不能直接填写新的节点和连接'],
    ['把静态资料说成实时','保留检索日期、读取方式和未知事项；不把设施清单转换成实时运行结论'],
    ['参数与工具滥用','白名单工具、输入验证和通行条件校验；不提供模型可随意访问的 URL 工具'],
    ['密钥与错误泄露','密钥仅在服务端环境变量中；对浏览器返回可理解的错误而非上游原始秘密'],
    ['错误与等待失控','有限轮次、请求上限、超时和取消；无配置时不静默切换成假 AI'],
],[104,WIDTH-104])
p('工具执行进度仅展示已发生的查询、计算等步骤，不展示或虚构模型内部思维链。安全措施仍需结合真实模型与部署环境继续验证。','small')
page()

# 5. UI implementation.
title('05','核心功能与前端实现')
h('一条可演示的完整任务')
p('在 AI 助手中明确选择云桥片区的模拟起点，提出“前往商场、需要至少 100 厘米净宽”的需求；正常状态先规划，再设置 E4 停运并重算；结果通过参数交接进入同一路网的分段指引。用户确认起点后继续查看动作和地标。')
table(['交互阶段','前端反馈','实现原则'],[
    ['输入','自然语言、示例问题、可选起点与通行条件','结构化条件清楚显示；避免将空值自动当成真实位置'],
    ['处理中','查询、计算等阶段状态，取消按钮','SSE 传递阶段事件；不宣称逐 token 输出'],
    ['成功','AI 解释、工具路线卡片、资料来源、执行记录','路线数据取自工具结果；解释文本与计算结果分开'],
    ['异常','无配置、超时、拒绝、无可用路径及重试入口','保留用户输入，不以成功样式掩盖失败'],
    ['继续操作','确认模拟起点、分段查看、按需朗读','参数变化重算，避免沿用旧路线或旧状态'],
],[72,215,WIDTH-287])
h('可访问性与移动布局')
bullet('主要任务控件放在地图之前，减少手机端寻找起点和目的地的滚动负担。')
bullet('保留可见键盘焦点与表单标签，分步切换后恢复焦点并播报状态；按钮和结果均可用文字理解。')
bullet('模型及用户文本以纯文本或经过转义的内容呈现；来源链接限定协议，避免把模型输出作为 HTML 执行。')
bullet('语音依赖浏览器能力；不可用时保留完整文字指引。对话仅在当前页面会话中保留，界面提供清除入口。')
page()

# 6. Validation.
title('06','测试证据与评测计划')
p('测试需要分别回答三类问题：程序是否按约定工作、模型是否稳定使用工具，以及真实使用者能否完成任务。三类证据不能相互替代。')
table(['验证类别','当前记录'],[
    ['领域规则',verify['domain']],
    ['AI 接入与工具',verify['backend']],
    ['浏览器交互',verify['browser']],
    ['真实模型',verify['live_model']],
    ['现场与目标用户',verify['field']],
],[108,WIDTH-108])
p('重点回归场景：多轮对话保留已表达的净宽需求；资料命中不能覆盖路径失败；未收录的“罗湖东站”不能误匹配罗湖站。', 'small')
h('配置模型后应执行的最小评测')
table(['测试组','示例与观测指标'],[
    ['正常与缺参','明确起终点、缺起点、模糊目的地；记录意图字段正确率和补问是否必要'],
    ['约束与故障','80/100 厘米净宽、E4 停运、医院施工；记录工具调用及路由约束一致性'],
    ['资料与出处','已收录站点、未收录站点、实时状态追问；记录引用覆盖和无依据回答比例'],
    ['异常与诱导','强行要求走台阶、编造出口、超时与取消；记录无依据路径拒绝情况'],
    ['性能与成本','记录首个阶段反馈时间、总耗时、模型请求次数及实际用量'],
],[108,WIDTH-108])
p('建议固定一组含正常与失败场景的评测题，保留输入、工具参数、来源、结果和人工判定。不得用模拟提供商返回的固定答案计算真实模型准确率。','small')
page()

# 7. Setup.
title('07','安装运行与部署准备')
h('本机运行')
table(['步骤','操作'],[
    ['1. 环境','使用 Node.js 20.12 或更高版本，需支持原生 fetch、环境文件加载和 node:test。应用运行不依赖第三方 npm 包。'],
    ['2. 配置','复制 .env.example 为 .env，按模板填写 AI_BASE_URL、AI_MODEL、AI_API_KEY。密钥只保存在本机或服务端。'],
    ['3. 启动','在项目根目录运行 node server.cjs；默认打开 http://127.0.0.1:4173。'],
    ['4. 未配置时','AI 助手显示待配置。可主动运行规则演示验证流程；原有静态页面仍可独立浏览。'],
    ['5. 验证','运行 node --test tests/*.test.cjs，并执行项目提供的浏览器检查；结果以本次运行输出为准。'],
],[86,WIDTH-86])
h('接口约定')
p('GET /api/health 返回是否配置和模型标识，不返回密钥。POST /api/assistant 接收消息、有限历史、结构化上下文及运行模式；通过 SSE 返回 stage、result 或 error 事件。result 中的路线、来源和工具记录用于前端卡片。')
h('部署前补齐')
p('当前默认仅监听本机。公网部署需配置 HTTPS、服务端环境变量、请求用量控制、访问策略和评审期可用性；正式上线前验证取消、代理超时与跨域限制。在线演示是比赛可选加分项，不把本地预览地址作为公网交付。')
h('数据与隐私')
p('对话发送至用户选择的模型服务；使用者应在提交前知晓这一点。应用不自动获取定位，不把真实坐标用于模拟寻路。当前本地反馈不等于向运营方提交工单；未来真实反馈流程需要单独建设接收、核验和处理机制。')
page()

# 8. Innovation and references.
title('08','创新点、限制与提交核对')
h('可解释的无障碍任务流程')
p('应用创新在于将入口、设施状态与通行条件集中到轮椅出行的具体任务中。技术方案将语言理解、资料检索、确定性路由和可操作界面连接起来：用户可表达需求，系统可解释选择依据，并在缺数据时停止推断。创新程度与效果仍应通过对比任务和目标用户验证证明。')
h('后续优先验证')
p('先在一个车站或校园片区采集连续路径、方向、门宽、坡度和核验时间；邀请轮椅使用者完成找入口与受阻改道任务。随后接入有来源、有有效期的设施事件。扩大城市覆盖应建立在可维护的数据与验证流程之上。')
table(['必须材料','提交前动作'],[
    ['代码仓库','提供 GitHub/Gitee 评审访问权限；保留真实提交历史，清除密钥与临时依赖。'],
    ['README / 配置','补团队、架构、运行、依赖和环境变量模板；用干净环境试运行。'],
    ['演示视频','录制 5-8 分钟、MP4、至少 1080p、普通话讲解；包含真实 AI 技术链路。'],
    ['技术 PDF','不超过 30 页；填写团队信息并更新模型选型、实测与最终版本。'],
    ['时间与入口','官网列 2026-11-18；作品指导与最终提交表述并存，以个人中心当前通知核对。'],
],[100,WIDTH-100])
h('参考资料与实现依据')
p('1. 传智杯 AI WEB 网页开发挑战赛：选题、评分、技术环境及提交要求。<br/><link href="https://www.boxuegu.com/matchTrack/detail/?id=10037" color="#2459A8">https://www.boxuegu.com/matchTrack/detail/?id=10037</link>', 'small')
p('2. 深圳地铁与港铁官方设施资料：详细原文 URL、读取方式与检索日期见项目 REAL-DATA-SOURCES.md 和 dist/real-data.js。检索日期为 2026-11-17，不代表源更新时间或现场核验时间。', 'small')
p('3. 项目实现与验证：server.cjs、lib/、dist/route-network.js、tests/；本文测试记录读取同目录 verification.json，须随最终验收更新。','small')

def decorate(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BLUE); canvas.rect(0,PAGE_H-8,PAGE_W,8,fill=1,stroke=0)
    canvas.setFont('CN',8); canvas.setFillColor(MUTED)
    canvas.drawString(46, PAGE_H-31, 'ACCESSAI  /  技术文档 · 参赛准备版')
    canvas.setStrokeColor(LINE); canvas.line(46,42,PAGE_W-46,42)
    canvas.drawString(46,27,'模型待配置 · 模拟路径不可用于真实导航')
    canvas.drawRightString(PAGE_W-46,27,str(doc.page))
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=46,leftMargin=46,topMargin=57,bottomMargin=57,
                        title='AccessAI 技术文档 - 参赛准备版',author='AccessAI 项目团队（信息待填写）',pageCompression=1)
doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
from pypdf import PdfReader
reader=PdfReader(str(OUT))
assert len(reader.pages)<=10, f'Expected at most 10 pages, got {len(reader.pages)}'
print(json.dumps({'output':str(OUT),'pages':len(reader.pages),'bytes':OUT.stat().st_size},ensure_ascii=False))
