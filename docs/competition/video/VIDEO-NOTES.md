# AccessAI 参赛演示视频

团队：云南大学，A 组，曲珈莹，单人参赛，无指导教师。

成片为 `AccessAI-demo-1080p.mp4`。以 `video-verification.json` 记录的成片时长、分辨率、编码及检查结果为准。

旁白使用本机 Windows 的 Microsoft Huihui 普通话合成语音，不是曲珈莹本人录音。片头和章节页均有标注。字幕在视频中直接显示，同时提供 `AccessAI-subtitles.srt`。`narration.txt` 是完整讲解稿。

核心功能段来自实际浏览器录屏，真实提交模型请求，保留等待时间，没有使用模拟提供商冒充真实 AI。开头、架构和结尾是编辑制作的讲解页。路线为虚构云桥街区；六站资料来自保存的官方来源，不能证明实时设备状态或真实路线可达性。未采集真实 GPS。

`recording-evidence.json` 记录本次录屏时间、章节时段、浏览器请求数量、应用 HTTP 状态、路线卡片和工具状态。它不是长期稳定性评测。前两次录制均未完成，历史诊断保存在 `recording-attempts.json`，原始帧在本地 `artifacts/video-build`，不作为成功演示材料。最终录制使用同一进程内的临时服务；这不证明长期稳定性。

## 重新生成

在项目根目录运行。需要 Node、Puppeteer、Edge，以及 Python 的 Pillow 和 imageio_ffmpeg；系统须安装 Windows 普通话语音和 Microsoft YaHei 字体。录制脚本默认在同一进程中启动随机本机端口的临时服务，完成后关闭，不影响 4173 服务。真实 AI 配置从项目本机 `.env` 读入内存，不写日志。也可用 `ACCESSAI_DEMO_URL` 指定已启动的本机服务。

```powershell
python docs/competition/video/prepare-video.py
node docs/competition/video/record-video.cjs
python docs/competition/video/build-video.py
```

第一步只在本机合成语音；第二步录屏约七分钟，并向已配置模型提交四次功能请求；第三步按原始帧时间合成画面、旁白和字幕。不得在未完成或失败录制后强行生成成功成片。重录会另建带时间标记的原始帧目录，不覆盖之前的帧。

原始帧、PCM 音频、复制到本机供渲染使用的字体、编码日志和抽帧检查图均位于忽略目录 `artifacts/video-build`，不需要向代码仓库提交。旁白未使用外部语音服务；密钥、浏览器个人资料和系统设置不出现在视频里。
