# 智能剪辑 AI 服务重构说明

## 概述

已将原有 `Home.vue` 中的智能剪辑流程封装为独立的 `SmartCutAiService` 服务类。同时，将 AI 对话数据（aiChats）提取为全局共享的 `AiChatStore`，以便支持后续的其他 AI 操作。

## 文件结构变化

### 新增文件
- `src/renderer/src/services/aiChatStore.ts` - AI 对话全局共享存储
- `src/renderer/src/services/smartCutAiService.ts` - 智能剪辑 AI 服务

### 修改文件
- `src/renderer/src/views/Home.vue` - 重构为使用新的服务

## 架构设计

```
┌─────────────────────────────────────┐
│         Vue Components              │
│       (Home.vue, etc.)              │
└────────────┬────────────────────────┘
             │
        ┌────┴────┬─────────────────┐
        │          │                 │
        ▼          ▼                 ▼
┌──────────────┐ ┌──────────────────────┐
│ AiChatStore  │ │ SmartCutAiService    │
│ (Shared)     │ │ (Service-specific)   │
├──────────────┤ ├──────────────────────┤
│ createAiChat │ │ isProcessing         │
│ aiChats      │ │ chatSteps            │
│ messages     │ │ startSmartCut()      │
│ currentId    │ │                      │
└──────────────┘ └──────────────────────┘
```

### AiChatStore (全局共享)
管理所有 AI 服务都需要的数据和操作：
- `createAiChat()` - **创建 AI 对话的共享入口，所有 AI 流程都从这里开始**
- `aiChats` - AI 对话列表
- `messages` - 当前对话的消息
- `currentAiChatId` - 当前选中的对话 ID

### SmartCutAiService (服务特定)
管理智能剪辑特定的状态和流程：
- `isProcessing` - 是否正在处理
- `chatSteps` - 剪辑流程步骤
- `startSmartCut()` - 启动智能剪辑流程

## 使用方式

### 在组件中使用

```typescript
import { smartCutAiService } from '../services/smartCutAiService'
import { aiChatStore } from '../services/aiChatStore'

// 获取共享的 AI 对话数据
const messages = computed(() => unref(aiChatStore.getMessages()))
const aiChats = computed(() => unref(aiChatStore.getAiChats()))

// 获取服务的处理状态
const serviceState = smartCutAiService.getState()

// 启动智能剪辑流程
smartCutAiService.startSmartCut('用户输入的提示词', {
  minDuration: 30,      // 最小视频时长（秒）
  maxDuration: 60,      // 最大视频时长（秒）
  maxRetries: 20,       // 最大重试次数
  retryInterval: 3000   // 重试间隔（毫秒）
})

// 加载对话列表
await aiChatStore.loadAiChats()

// 创建新 AI 对话（所有 AI 操作的共同入口）
const aiTopic = await aiChatStore.createAiChat('新建对话')

// 选择对话
await aiChatStore.selectChat(chatTopic)

// 新建对话
aiChatStore.newChat()
```

## 服务接口

### AiChatStore

#### 获取状态方法
- `getAiChats()` - 获取 AI 对话列表的响应式引用
- `getMessages()` - 获取当前对话消息的响应式引用
- `getCurrentAiChatId()` - 获取当前对话 ID 的响应式引用

#### 数据操作方法
- `loadAiChats()` - 从服务器加载对话列表
- `loadAiChatMessages(aiChatId)` - 加载指定对话的消息
- `addMessage(message)` - 添加消息
- `updateMessage(id, updates)` - 更新消息
- `clearMessages()` - 清空消息列表

#### AI 对话创建（共享入口）
- `createAiChat(topic)` - **创建新 AI 对话，这是所有 AI 流程的共同入口**
  - 自动调用 API 创建对话
  - 自动添加到对话列表
  - 自动设置为当前对话
  - 自动清空消息列表

#### 对话管理方法
- `selectChat(chat)` - 选择一个对话（加载其消息）
- `newChat()` - 创建新对话
- `setCurrentAiChatId(id)` - 设置当前对话 ID

### SmartCutAiService

#### 属性
- `getState()` - 获取服务的状态对象

#### 方法

**startSmartCut(prompt, options)**
- 启动智能剪辑流程
- 参数：
  - `prompt`: 用户输入的提示词
  - `options`: 可选的剪辑选项

### SmartCutAiServiceState

```typescript
interface SmartCutAiServiceState {
  messages: Ref<Message[]>      // 对话消息列表（共享）
  isProcessing: Ref<boolean>    // 是否正在处理
  chatSteps: Ref<ChatStep[]>    // 对话步骤
}
```

## 扩展其他 AI 操作

如需支持其他 AI 操作，创建新的服务类，复用 `AiChatStore`：

```typescript
// src/renderer/src/services/otherAiService.ts
import { ref, type Ref } from 'vue'
import { aiChatStore } from './aiChatStore'
import type { Message } from '../types/chat'

export interface OtherAiServiceState {
  messages: Ref<Message[]>
  isProcessing: Ref<boolean>
  // ... 其他服务特定的状态
}

export class OtherAiService {
  private state: OtherAiServiceState

  constructor() {
    this.state = {
      messages: aiChatStore.getMessages(),  // 复用共享的消息引用
      isProcessing: ref(false),
      // ... 初始化其他状态
    }
  }

  getState(): OtherAiServiceState {
    return this.state
  }

  async startOtherOperation(prompt: string, options?: any): Promise<void> {
    // 第一步：创建 AI 对话（所有 AI 流程的共同入口）
    const aiTopic = await aiChatStore.createAiChat(prompt)
    
    // 添加用户消息
    aiChatStore.addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date()
    })
    
    // 使用 aiChatStore 的方法管理对话数据
    aiChatStore.addMessage(...)
    aiChatStore.updateMessage(...)
    
    // 实现其他 AI 操作的逻辑
  }
}

export const otherAiService = new OtherAiService()
```

然后在组件中使用新的服务：

```typescript
import { otherAiService } from '../services/otherAiService'
import { aiChatStore } from '../services/aiChatStore'

// 两个服务共享同样的对话数据
const messages = computed(() => unref(aiChatStore.getMessages()))
const aiChats = computed(() => unref(aiChatStore.getAiChats()))

// 启动不同的 AI 操作
await otherAiService.startOtherOperation('prompt')
```

## 消息展示格式

### 词典解析阶段
成功时：
```
✓ 词典解析成功

找到 3 个相关词典：
• 商品推荐
• 产品介绍
• 品牌宣传
```

失败时：
```
✗ 未找到相关词典
```

### 任务创建阶段
```
📊 智能剪辑任务已创建

任务ID: 12345
视频数量: 5
时长范围: 80s - 100s

⏳ 正在处理中...
```

### 错误提示

未找到字典时：
```
❌ 词典解析失败

无法找到与提示词 "您的提示词" 相关的词典

💡 建议：
• 检查输入的提示词是否准确
• 尝试使用不同的关键词
• 确保词典库中包含相关内容

请调整后重新尝试。
```

流程错误时：
```
⚠️ 流程出错

错误信息: 视频处理失败

请检查日志或重新尝试。
```

## 流程说明

### 智能剪辑 AI 的处理流程

1. **创建对话阶段**（共享）- 调用 `aiChatStore.createAiChat()` 创建新对话
2. **分析阶段** - 分析用户输入，提取字典关键词
   - **检查点**: 如果未找到相关字典，流程终止并记录失败信息
3. **视频选择阶段** - 根据字典关键词过滤符合条件的视频
4. **视频分析阶段** - 分析选定的视频内容
5. **剪辑执行阶段** - 执行智能剪辑任务
6. **完成阶段** - 等待任务完成，保存对话记录

### 错误处理

**未找到相关字典**
- 流程自动终止
- 所有待执行的步骤标记为错误
- 失败信息自动记录到系统对话中
- 提供友好的建议引导用户调整提示词重试

**流程执行错误**
- 清晰的错误信息展示
- 建议用户检查日志或重新尝试
- 完整的错误上下文保存在对话中

每个阶段都会通过 `chatSteps` 更新进度状态。

## 优势

✅ **创建对话共享** - 所有 AI 服务通过统一的 `createAiChat()` 入口创建对话  
✅ **数据共享** - 多个 AI 服务使用同一个 `aiChats` 列表  
✅ **单一数据源** - 避免数据重复和不一致  
✅ **易于扩展** - 新服务只需复用 `AiChatStore`，无需重复实现  
✅ **职责分离** - 共享数据与服务逻辑清晰分离

