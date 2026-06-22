# OpenPivot Web

OpenPivot Web 是 OpenPivot 的消费者级 IM 前端。它把个人收件箱、协作空间、参与者和空间内协作流程放在同一个产品结构里，让用户先看到需要处理什么，再回到准确的协作上下文。

当前版本面向 `feature/agentim` 后端协议开发，既可以连接真实 Rust 后端，也可以使用本地演示数据预览产品形态。演示数据和真实后端数据完全分离。

## 产品模型

OpenPivot Web 不再把聊天、好友、机器人和流程拆成后台式模块。核心关系是：

- **参与者加入协作空间**：参与者可以是人、AI 成员或未来的外部能力，但身份属性只在资料页展示。
- **消息发生在协作空间中**：一对一对话只是成员更少的协作空间，最近对话统一来自空间。
- **协作流程属于协作空间**：流程从空间消息或空间上下文发起，请求参与者、等待回复或审批，并把结果写回空间时间线。
- **收件箱指向具体上下文**：联系请求、提及、未读动态和流程审批都进入收件箱，处理后回到对应参与者、空间或流程。

## 主要入口

- **收件箱**：个人注意力入口，优先展示需要我处理的请求和审批。
- **协作空间**：IM 主入口，统一承载一对一和多人空间。
- **参与者**：替代传统通讯录，用于搜索、建立联系、查看资料和开始协作。
- **协作流程**：跨空间流程概览，进入详情后使用纵向脚本视图表达触发、请求、并行、审批和写回。

## 路由

```text
/inbox
/spaces
/spaces/new
/spaces/:spaceId
/spaces/:spaceId/participants
/spaces/:spaceId/flows
/spaces/:spaceId/flows/:flowId
/participants
/participants/:participantId
/flows
/settings
/login
/register
```

旧入口会重定向到新模型：

```text
/messages -> /inbox 或按旧 chat 参数映射到对应协作空间
/workflows -> /flows
/contacts -> /participants
/requests -> /inbox
/connections -> /settings
```

## 运行模式

### 演示模式

演示模式使用本地领域数据，不依赖后端服务。它覆盖收件箱、协作空间、参与者、消息发送、联系请求和空间内协作流程。

### 真实后端模式

真实后端模式只展示当前 Rust 后端协议已经支持的能力：

- 注册、登录、刷新令牌、登出、当前用户
- 搜索用户
- 联系请求
- 联系人列表
- 会话列表
- 消息收发
- 健康检查

尚未由后端协议正式支持的能力会显示明确不可用原因，不会伪装成真实可用功能。

## 技术栈

- React 18
- TypeScript
- Vite
- React Router
- TanStack Query
- React Hook Form
- Zod
- Lucide React
- Vitest
- Tailwind CSS / PostCSS

## 快速开始

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

开发服务默认监听：

```text
0.0.0.0:5173
```

本机访问：

```text
http://127.0.0.1:5173
```

局域网设备可通过宿主机 IP 访问，例如：

```text
http://10.0.0.214:5173
```

## 后端配置

默认情况下，前端请求同源 `/v1`。Vite 会把 `/v1` 代理到：

```text
http://10.0.0.214:3000
```

可以通过 `.env` 或命令行覆盖代理目标：

```bash
VITE_OPENPIVOT_PROXY_TARGET=http://127.0.0.1:3000 npm run dev
```

如果后端已经开启浏览器 CORS，也可以直接设置 API 地址：

```bash
VITE_OPENPIVOT_API_URL=http://10.0.0.214:3000 npm run dev
```

生产环境推荐将前端和后端放在同源下，通过反向代理转发 `/v1` 到 OpenPivot Rust 服务。

## 构建与预览

类型检查和生产构建：

```bash
npm run build
```

本地预览构建产物：

```bash
npm run preview
```

预览服务默认监听：

```text
0.0.0.0:4173
```

## 测试

```bash
npm run test
```

当前沙箱如果阻止 Vitest/esbuild 读取工作区父目录，可以先运行不加载浏览器依赖的领域烟测：

```bash
npm run test:smoke
```

Connected Mode 的 HTTP 协议链路可以用本地 mock 后端验证：

```bash
npm run test:connected
```

UI 层能力门控和流程创建表单可以用无浏览器 smoke 验证：

```bash
npm run test:ui
```

当前测试重点覆盖：

- Rust HTTP Adapter 的请求封装、刷新令牌和重试逻辑
- Session Bootstrap 的 Refresh Token 恢复和失败匿名状态
- 工作区领域模型在 Demo 与 Connected 模式下的数据映射
- Connected Mode 的登录恢复、参与者搜索、联系请求、收件箱处理、一对一空间和消息收发协议链路
- Connected Mode 会区分发出和收到的待处理联系请求；已建立联系会覆盖残留 pending 状态，发出的请求不会进入收件箱
- Demo Mode 的 App 路由级核心旅程：收件箱、空间消息、参与者、从消息创建流程和审批处理
- 收件箱中的消息上下文链接会落到协作空间里的真实消息锚点
- 异步加载完成后，消息上下文链接会滚动并聚焦到目标时间线项
- 收件箱中的联系请求会落到对应参与者资料页，且不会重复展示建立联系动作
- 未识别的旧消息入口参数会回到收件箱，不会伪装成某个空间
- 缺失协作空间的时间线路由不会继续加载消息上下文
- 缺失协作空间的参与者/流程子路由会明确停止在“未找到”状态，不暴露创建或编辑假上下文
- Demo Mode 的失败消息会保留在协作空间时间线，并可通过重试恢复为已发送状态
- Demo 消息发送、联系请求和流程审批状态联动
- 空间内创建流程草稿会直接绑定当前协作空间
- 流程详情页的审批按钮必须绑定到匹配的收件箱审批项，没有匹配项时会禁用并说明原因
- Connected Mode 不支持的空间/流程入口不会渲染成可跳转假按钮
- 新建菜单和命令搜索只展示真实可达的动作与搜索域
- 当前身份的参与者资料页不会提供一对一空间或联系请求假动作
- 后端地址保存会清理旧工作区缓存；演示模式不会展示假退出动作
- 邀请参与者加入已有协作空间会更新空间成员和时间线
- Composer 的 Enter、Shift+Enter 和中文输入法组合输入行为
- 新建协作空间只允许已建立联系的参与者，页面和 adapter 都会拒绝未连接参与者

## 项目结构

```text
.
├── docs/
│   └── ux-first-principles-refactor.md
├── public/
│   └── brand/
├── src/
│   ├── adapters/
│   │   ├── rustHttpAdapter.ts
│   │   └── tokenStore.ts
│   ├── app/
│   │   ├── AppContext.ts
│   │   ├── AppRouter.tsx
│   │   ├── AppShell.tsx
│   │   ├── sessionBootstrap.ts
│   │   └── sessionBootstrap.test.ts
│   ├── components/
│   │   ├── avatar/
│   │   ├── composer/
│   │   ├── feedback/
│   │   ├── message/
│   │   └── Composer.test.tsx
│   ├── domain/
│   │   ├── capabilities.ts
│   │   ├── connectedWorkspaceAdapter.ts
│   │   ├── demoWorkspaceAdapter.ts
│   │   ├── models.ts
│   │   ├── workspaceAdapter.ts
│   │   └── workspaceModel.test.ts
│   ├── features/
│   │   ├── auth/
│   │   ├── flows/
│   │   ├── inbox/
│   │   ├── participants/
│   │   ├── settings/
│   │   └── spaces/
│   ├── shared/
│   │   └── format.ts
│   ├── App.tsx
│   ├── config.ts
│   ├── main.tsx
│   ├── styles.css
│   └── types.ts
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

## 开发约定

- 页面层不要直接调用 `fetch`。
- 后端能力先沉淀到 `RustHttpAdapter` 和工作区 adapter，再通过 React Query 接入 UI。
- Demo Mode 与 Connected Mode 必须使用不同数据源，不能混合数据。
- IM 入口保持日常通讯产品语义，避免意义不清的管理入口。
- 参与者是统一命名，不在主界面强行区分人员与 AI。
- 协作流程属于协作空间，默认使用纵向脚本视图，不默认进入全局画布。
- 后端暂未支持的能力必须禁用并给出原因。

## 部署建议

1. 执行 `npm run build`。
2. 将 `dist/` 交给静态服务或网关托管。
3. 将 `/v1` 反向代理到 OpenPivot Rust 后端。
4. 如果前后端不同源，确认后端已正确配置 CORS。

Nginx 示例：

```nginx
server {
  listen 80;
  server_name openpivot.example.com;

  root /var/www/openpivot-web/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /v1/ {
    proxy_pass http://127.0.0.1:3000/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 许可证

请根据 OpenPivot 主项目的许可证策略补充。
