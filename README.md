# OpenPivot Web

OpenPivot Web 是 OpenPivot 的消费者级 IM 前端。它把传统即时通信、AI 参与者和低代码协作编排放在同一个产品结构里，让用户可以像使用 QQ / 微信一样进入最近会话，同时在需要时把协作过程沉淀为可编排的流程。

当前版本面向 `feature/agentim` 后端协议开发，既可以连接真实 Rust 后端，也可以使用本地演示数据预览产品形态。

## 产品定位

OpenPivot Web 不是后台管理面板，也不是普通聊天测试页。它的核心信息架构由三个同层级入口组成：

- **协作空间**：IM 主入口。协作空间和参与者对话按最近时间统一排列，不再拆分传统聊天分类或测试通道。
- **协作流程**：Dify 风格的低代码编排界面。用于把消息触发、参与者动作、模型调用、条件分支、人工审批等节点组织成可执行流程。
- **参与者**：替代传统好友列表。人员、AI 成员和未来的协作能力都以参与者形式进入通讯录，身份属性放在资料页中展示。

## 功能概览

- 最近会话列表：统一展示协作空间与参与者对话记录。
- IM 会话界面：支持消息阅读、输入、附件/提及/代码/流程入口的交互预留。
- 参与者目录：以角色、职责、能力标签组织成员。
- 协作流程画布：包含流程列表、节点组件库、节点画布和右侧配置面板。
- 真实后端模式：对接 Rust HTTP API，展示当前协议已实现能力。
- 演示模式：使用本地数据展示 OpenPivot 的目标产品体验。
- 响应式布局：支持桌面与移动端视图。
- 明暗主题：支持轻量主题切换。

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

当前测试重点覆盖：

- Rust HTTP Adapter 的请求封装、刷新令牌和重试逻辑
- Demo Adapter 的本地数据行为

## 运行模式

### 演示模式

演示模式使用本地数据，不依赖后端服务。它用于展示目标产品体验，包括协作空间、参与者和协作流程画布。

### 真实后端模式

真实后端模式只展示当前 Rust 后端已经实现的能力：

- 注册
- 登录
- 刷新令牌
- 登出
- 当前用户
- 搜索用户
- 好友请求
- 好友列表
- 会话列表
- 消息收发
- 健康检查

尚未由后端协议正式支持的能力会保留为产品预览或交互占位，不会伪装成真实可用功能。

## 项目结构

```text
.
├── public/
│   ├── app-icon.svg
│   ├── favicon.svg
│   └── brand/
├── src/
│   ├── adapters/
│   │   ├── demoAdapter.ts
│   │   ├── rustHttpAdapter.ts
│   │   └── tokenStore.ts
│   ├── data/
│   │   └── demo.ts
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
- 后端能力先沉淀到 `RustHttpAdapter` 和 `DemoAdapter`，再通过 React Query 接入 UI。
- 真实能力与演示能力必须明确区分。
- IM 入口保持日常通讯产品的语义，避免引入意义不清的管理入口。
- 参与者是统一命名，不在主界面强行区分人员与 AI。
- 协作流程使用低代码编排语义，不做普通任务看板或后台表单。

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
