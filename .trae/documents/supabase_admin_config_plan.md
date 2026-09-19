# Supabase 配置修复 + 管理员保护方案

## 问题现状

1. `.env` 中的 `VITE_SUPABASE_ANON_KEY` 疑似被截断（仅 30 字符，正常为 500+ 字符的 JWT），导致所有 auth 请求返回 `Failed to fetch` / `Invalid JWT`
2. 应用显示「云端同步已启用」但实际上请求根本发不通，有误导性
3. 错误提示为原始英文 `"Failed to fetch"`，对用户无帮助
4. 用户希望在应用内可配置 Supabase，但**不能让所有人随意修改**

---

## 核心设计决策

### 管理员保护机制

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 首次启动设置"设备管理密码" | 简单，无需外部依赖，每台设备独立 | 懂技术的人可通过 localStorage 绕过（但本场景够用） |
| B. 代码写死固定密码 | 更简单 | 反编译可获取，无法更换 |
| ✅ **C. 首次启动让用户设置管理密码 + 密码哈希存储** | 用户可控、可重置、可在设置页修改 | 需要额外的 UI 流程 |

**选择：方案 C**

- 首次进入设置页的「高级配置」时 → 提示用户**设置管理密码**（6 位以上）
- 之后每次进入高级配置 → 要求输入密码验证
- 支持「忘记密码 → 清空本地 Supabase 配置并重置管理密码」流程（清空后自动降级到本地模式，保证不锁死）
- 密码用 SHA-256 哈希存储（不存明文），防止手机被借用时不小心看到

### 运行时配置架构

```
┌─────────────────────────────────────────────────────┐
│  优先级（从高到低）                                    │
│                                                       │
│  1️⃣ localStorage 中的运行时配置（管理员设置的）       │
│  2️⃣ .env 中的构建时配置（VITE_SUPABASE_URL / _KEY）  │
│  3️⃣ 本地模式（无云端同步）                           │
└─────────────────────────────────────────────────────┘
```

**关键改动**：`supabase.js` 在初始化时，优先从 localStorage 读取配置。这样：
- 在手机/浏览器中，不需要重新构建 APK 即可更换 Supabase 项目
- `.env` 作为默认值/初始值存在
- 管理员设置的配置保存在设备本地，不会泄露到代码仓库

---

## 需修改的文件清单

| 文件 | 修改内容 | 复杂度 |
|------|---------|-------|
| `src/services/supabase.js` | 运行时配置 + URL 校验 + 连通性预检 + 友好错误翻译 | 中 |
| `src/pages/Account.jsx` | 错误提示中文化 + 「切换到本地模式」回退按钮 + 注册失败时提示 | 中 |
| `src/pages/Settings.jsx` | 新增「🔒 高级配置」入口 + 密码设置/验证流程 + Supabase URL/Key 配置 UI | 中高 |
| `src/context/AppContext.jsx` | 增加 `supabaseConfig` 状态与 `setSupabaseConfig`、`verifyAdmin`、`setAdminPassword` actions | 中 |
| `src/utils/constants.js` | 增加新的 STORAGE_KEYS（管理密码哈希、Supabase 运行时配置、连通性状态） | 低 |
| `src/utils/helpers.js` | 增加 `sha256` 哈希工具函数 | 低 |

---

## 详细修改方案

### 1. constants.js — 新增存储键

```js
export const STORAGE_KEYS = {
  API_KEY: 'deepseek_api_key',
  MODEL: 'deepseek_model',
  FONT_SIZE: 'app_font_size',
  EYE_PROTECTION: 'app_eye_protection',
  // 新增
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  SUPABASE_RUNTIME_URL: 'supabase_runtime_url',
  SUPABASE_RUNTIME_ANON_KEY: 'supabase_runtime_anon_key',
  SUPABASE_LAST_HEALTH: 'supabase_last_health_check',  // 'ok' | 'fail' | null
}
```

### 2. helpers.js — 新增 SHA-256 哈希

```js
export async function sha256(text) {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

### 3. supabase.js — 运行时配置 + 连通性检查

**改动要点**：
- 增加 `getEffectiveConfig()`：优先 localStorage → 回退 .env
- `isSupabaseConfigured()`：不仅检查字符串非空，还要检查 URL 格式（必须以 `https://` 开头，以 `.supabase.co` 结尾）
- 增加 `checkConnectivity()`：启动时发送一个轻量 GET 请求到 Supabase，检测是否可达；将结果存到 `SUPABASE_LAST_HEALTH`
- `isSupabaseOperational()`：返回「配置完整 + 连通性良好」才为 true，用于 UI 显示「云端同步已启用」
- 导出 `translateSupabaseError(error)`：将 Supabase 常见错误转为中文提示
  - `Failed to fetch` → "无法连接到 Supabase 服务器，请检查网络或服务器地址"
  - `Invalid JWT` → "API Key 无效，可能被截断或复制不完整"
  - `Email not confirmed` → "请先前往邮箱完成验证"
  - `Invalid login credentials` → "邮箱或密码错误"
  - `User already registered` → "该邮箱已注册，请直接登录"

### 4. AppContext.jsx — 管理员状态

**新增 actions**：
- `hasAdminPassword()` → 检查是否已设置管理密码
- `setAdminPassword(newPassword)` → 设置密码（存哈希）
- `verifyAdminPassword(input)` → 验证密码（用于进入配置页前）
- `setRuntimeSupabaseConfig(url, anonKey)` → 保存运行时配置到 localStorage

### 5. Account.jsx — 友好错误 + 回退

**改动要点**：
- 使用 `translateSupabaseError()` 显示中文错误
- 云端模式注册/登录失败时，按钮下方显示「🖥️ 暂时不想配置，使用本地模式」按钮 → 点击后清空运行时 Supabase 配置，刷新状态
- `isSupabaseOperational()` 为 false 时，「云端同步已启用」改为「⚠️ 云端暂不可用，请检查配置」

### 6. Settings.jsx — 🔒 高级配置（核心 UI）

流程如下：

```
设置页
├── ...（现有字体/护眼/模型等设置保持不变）
└── 🔒 高级配置（受管理员密码保护）
    │
    ├── [点击入口]
    │   ├── 尚未设置密码 → "设置管理密码（6位以上）" 输入框 + 确认
    │   └── 已设置密码 → "请输入管理密码" 输入框 + 「忘记密码？」
    │
    └── [验证通过] 进入配置面板
        ├── Supabase 项目 URL
        │   （输入框，默认显示 .env 中值或为空）
        ├── Supabase anon key
        │   （多行输入框，粘贴大段 JWT）
        ├── [测试连接] 按钮 → 调用 checkConnectivity()，显示"✓ 连通性正常"或"✗ 无法访问"
        ├── [保存配置并重启] 按钮
        ├── [清空运行时配置，使用 .env 默认值] 按钮
        └── [修改管理密码] 按钮
```

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 用户忘记管理密码 | 无法修改 Supabase 配置 | 在密码验证页提供「忘记密码 → 清空本地 Supabase 配置并重置管理密码」流程；清空后自动降级到本地模式，保证不锁死 |
| anon key 被截断粘贴 | auth 请求全部失败 | 配置保存前校验长度（至少 100 字符），提示"看起来不是完整的 anon key" |
| URL 格式错误 | CORS / DNS 失败 | 校验 URL 格式（`^https://.+\.supabase\.co$`） |
| Supabase 项目暂停（免费版 7 天无活动） | 云端功能不可用 | 连通性预检失败时不显示「已启用」，给出项目暂停提示；不阻断本地模式使用 |
| localStorage 被用户清缓存 | 运行时配置丢失 | 提示"清除浏览器数据/缓存会重置 Supabase 配置，需重新设置"；.env 中始终保留默认值作为兜底 |

---

## 验证清单

- [ ] `npm run build` 构建成功，exit code 0
- [ ] 设置页显示「🔒 高级配置」入口
- [ ] 首次点击需设置管理密码（6 位以上），再次点击需验证密码
- [ ] 密码输入错误 3 次后显示「忘记密码？」醒目入口
- [ ] 通过验证后可填写/修改 Supabase URL 和 anon key
- [ ] 「测试连接」按钮可真实发起请求并显示结果
- [ ] 保存后 Account 页自动切换到新的 Supabase 配置
- [ ] 错误提示全部为中文，且包含可行的下一步建议（如"请检查 Key 是否完整" / "切换到本地模式"）
- [ ] 本地模式（未配置 Supabase）时流程不受影响
- [ ] 忘记密码流程可清空配置并降级到本地模式，不丢失卡片数据
