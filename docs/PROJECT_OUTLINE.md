# 影氪 · 前端项目大纲

> Electron 桌面端 + Vue 渲染进程。供 AI/开发者快速了解本仓库结构、技术栈与核心流程。

---

## 1. 项目简介

- **产品名**：影氪 (Inklip)
- **本仓库**：桌面壳（Electron 主进程 + 预加载 + 渲染进程 Vue 应用）
- **核心能力**：素材管理、全文搜索、意图识别（搜索/剪辑）、智能剪辑流程（选视频 → 确认 → 成片）、AI 对话式交互；HTTP/WebSocket 直连 **inklip-base-go** 后端。

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 39 + Electron Forge 打包 |
| 构建 | Vite 7 + electron-vite |
| 前端 | Vue 3 (Composition API + script setup) + TypeScript |
| UI | Naive UI + @vicons/ionicons5 |
| 路由 | Vue Router 4 (Hash) |
| 状态 | Pinia（仅 websocket store）、自研 aiChatStore / SmartCutAiService |
| 请求 | Axios（baseURL 由主进程下发后端端口） |
| 后端 | 独立仓库 **inklip-base-go**，HTTP API + WebSocket，本应用主进程负责拉起后端进程 |

---

## 3. 本仓库目录结构（src）

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 窗口、菜单、media 协议、生命周期
│   ├── ipc/handlers.ts      # IPC：后端端口、选文件/目录、下载、配置等
│   ├── services/backend.ts  # 后端进程管理（启动/停止，获取端口）
│   └── utils/               # download、whisperModelDownloader 等
├── preload/
│   ├── index.ts             # contextBridge 暴露给渲染进程的 API
│   └── index.d.ts           # window.api / window.electron 类型声明
└── renderer/                # 前端（Vue 应用）
    └── src/
        ├── main.ts
        ├── App.vue           # 主题、初始化 baseURL/WebSocket、路由出口
        ├── router/index.ts   # / → Splash, /home → Home, /settings → Settings
        ├── api/              # 后端 HTTP 接口封装
        │   ├── aiChat.ts     # AI 对话/消息
        │   ├── video.ts      # 视频、搜索、上传、智能剪辑
        │   ├── intent.ts     # 意图识别
        │   ├── anchor.ts / product.ts / dict.ts
        │   └── config.ts     # 配置、API Key
        ├── stores/
        │   └── websocket.ts  # WebSocket 连接、消息分发、解析进度、用量
        ├── services/
        │   ├── aiChatStore.ts      # AI 对话列表与消息内存状态 + 持久化同步
        │   └── smartCutAiService.ts # 智能剪辑流程编排（意图→选视频→确认→剪辑→WS 更新）
        ├── composables/
        │   ├── useGlobalVideoPreview.ts  # 全局单例视频预览
        │   ├── useVideoUpload.ts         # 上传成功后的消息/对话处理
        │   └── useWebSocketSync.ts       # WS 与消息状态同步（上传/剪辑状态）
        ├── utils/
        │   ├── request.ts    # Axios 实例、setBaseUrl、拦截器
        │   ├── media.ts      # getMediaUrl（path → media:// 或 http）
        │   ├── websocket-client.ts
        │   └── websocket-message-handler.ts
        ├── types/
        │   ├── chat.ts       # Message、MessagePayload、SmartCutTaskPayload 等
        │   └── video.ts     # FileItem
        ├── views/
        │   ├── Splash.vue    # 启动页（资源检查/下载）
        │   ├── Home.vue      # 主界面：侧栏 + 对话 + 播放区 + 右侧栏
        │   └── Settings.vue  # 视频数据目录、API Key
        └── components/
            ├── AppStatusBar.vue
            ├── ChatInput.vue
            ├── VideoPlayer.vue / VideoPreviewPlayer.vue / GlobalFullscreenPlayer.vue
            ├── VideoCard.vue / VideoStatusOverlay.vue
            ├── RenameModal.vue / DeleteModal.vue
            └── home/
                ├── HomeSidebar.vue        # 左侧：锚点/产品/视频树、上传
                ├── HomeChatMessages.vue   # 中间：消息列表 + 各类消息卡片
                ├── HomeVideoPlayer.vue    # 中间：主播放器
                ├── HomeRightSidebar.vue   # 右侧：对话历史、剪辑历史
                ├── VideoUploadChatModal.vue
                └── message-types/         # 按消息类型渲染的卡片
                    ├── ThinkingStepsMessage.vue
                    ├── VideoFilteringTaskMessage.vue
                    ├── TaskCardMessage.vue
                    ├── VideoUploadMessage.vue
                    ├── SearchResultMessage.vue
                    ├── VideoSelectionMessage.vue  # 选视频+确认/取消
                    └── SmartCutResultMessage.vue   # 剪辑结果/进度/导出
```

---

## 4. 架构要点（本仓库）

### 4.1 进程与通信

- **主进程**：创建窗口、注册 `media://` 协议、启动/管理 **inklip-base-go** 后端子进程，提供 IPC（如 `get-backend-port`、`select-video-folder`）。
- **预加载**：通过 `window.api` 暴露安全 API（调用 IPC），通过 `window.electron` 暴露 Electron 工具。
- **渲染进程**：Vue SPA。启动后通过 `window.api.getBackendPort()` 拿到端口，设置 `request.ts` 的 baseURL 和 WebSocket URL，所有 HTTP/WS **直连后端**。

### 4.2 与后端的关系

- 后端为独立可执行文件（**inklip-base-go** 编译产物），由主进程从 `resources/<platform-arch>/inklip-base/` 启动。
- 后端提供 HTTP API（/api/videos、/api/ai_chat、/api/smart-cut 等）和 WebSocket（/api/ws），前端直接请求该地址。

### 4.3 数据流（智能剪辑）

1. 用户在 **ChatInput** 输入 → **Home.vue** 调用 `recognizeIntentApi`（意图：搜索 / 剪辑）。
2. 剪辑意图 → **smartCutAiService.startSmartCut**：请求字典与视频、选品 → 写入 **aiChatStore** 消息，展示 **VideoSelectionMessage**（选视频、时长）。
3. 用户确认 → **smartCutAiService.confirmAndProceed** → 调用 **smartCutApi**，后端创建任务。
4. **WebSocket** 推送任务进度/结果 → **websocket-message-handler** 解析 → 更新 **aiChatStore** 中对应消息的 payload → **SmartCutResultMessage** 展示状态/导出。

---

## 5. 关键模块说明

| 模块 | 作用 |
|------|------|
| **api/*.ts** | 封装后端 REST，统一走 `request.ts`（baseURL 由主进程下发）。 |
| **stores/websocket.ts** | 单例 WebSocket、重连、VideoParseProgress、UsageInfo、isUsageAvailable。 |
| **services/aiChatStore.ts** | 当前对话 ID、消息列表、加载/创建/删除对话、与后端 ai_chat 同步。 |
| **services/smartCutAiService.ts** | 智能剪辑全流程：意图→字典→视频筛选→用户确认→调用 smartCutApi→监听 WS 更新消息。 |
| **composables/useWebSocketSync** | 根据 WS 事件刷新消息中的上传/剪辑状态并调用 updateAiChatMessageApi。 |
| **composables/useVideoUpload** | 上传成功后的新对话/消息写入与展示。 |
| **composables/useGlobalVideoPreview** | 全局单例小窗预览（showPreview/hidePreview），避免多实例。 |
| **types/chat.ts** | Message、MessagePayload、SmartCutTaskPayload、taskCard 步骤等，与后端和 UI 消息类型一致。 |

---

## 6. 路由与页面

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | Splash | 启动页，检查/下载资源后跳转 /home |
| `/home` | Home | 主界面：左栏素材、中间对话+播放器、右栏历史 |
| `/settings` | Settings | 视频数据目录、API Key |

导航：主进程可发 `navigate-to`，渲染进程 `window.api.onNavigate` 里 `router.push(route)`。

---

## 7. 渲染进程与主进程/后端交互摘要

- **拿后端端口**：`window.api.getBackendPort()` → 设置 `setBaseUrl('http://127.0.0.1:{port}')` 和 `wsStore.setBaseUrl('ws://...')`。
- **选文件/目录**：`window.api.selectVideoFile()`、`selectVideoFolder()`、`selectVideoDataDirectory()`。
- **下载视频**：`window.api.downloadVideo(sourcePath, fileName)`。
- **其他**：`getVideoDataDirectory`、`getAppVersion`、`restartBackend`、`checkBackendHealth` 等见 `preload/index.d.ts`。

---

## 8. 开发与构建

```bash
pnpm install
pnpm dev          # 开发（Electron + Vite）
pnpm build        # 构建到 dist/
pnpm lint         # ESLint
pnpm lint:fix     # ESLint 自动修复
pnpm format       # Prettier 格式化
pnpm make         # 打包成安装包（含 make:win）
```

调试后端时可用：`pnpm run debug`（`DEBUG_MODE=true`，固定端口 12698，不拉起内置后端）。

---

## 9. 相关

- **后端仓库**：**inklip-base-go**（与前端通过 HTTP + WebSocket 通信）。
- **本仓库配置**：`eslint.config.mjs`、`.prettierrc.yaml`、`electron.vite.config.ts`、`forge.config.ts`。

---

*文档与代码同步，结构变更时请更新此大纲。*
