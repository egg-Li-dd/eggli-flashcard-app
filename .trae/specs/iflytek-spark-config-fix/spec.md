# 讯飞星火配置与语音听写共用配置修复 Spec

## Why
用户反馈：讯飞语音听写测试连接成功，但讯飞星火测试连接失败。UI 显示"与语音识别共用下方「讯飞语音听写」配置区的 APPID 和 APISecret"，但实际代码中讯飞星火和讯飞语音听写使用了不同的状态变量，导致配置并未真正共用。

## What Changes
- 修复讯飞星火测试连接逻辑，使其能够读取讯飞语音听写(IAT)配置区的 APPID 和 APISecret
- 当讯飞星火独立配置为空时，自动回退使用 IAT 配置
- 优化 UI 提示，明确说明配置共用逻辑

## Impact
- Affected specs: 讯飞星火 AI 服务、讯飞语音听写服务
- Affected code: `Settings.jsx`、`iflytekAi.js`、`AppContext.jsx`

## ADDED Requirements

### Requirement: 配置共用逻辑
讯飞星火测试连接 SHALL 在自身配置为空时，自动使用讯飞语音听写(IAT)配置区的 APPID 和 APISecret。

#### Scenario: 星火配置为空，IAT配置已填写
- **WHEN** 用户在讯飞语音听写配置区填写了 APPID、APIKey、APISecret
- **AND** 讯飞星火独立配置区（iflytekAppId/iflytekApiSecret）为空
- **AND** 用户点击"测试连接"按钮
- **THEN** 系统自动使用 IAT 配置区的 APPID 和 APISecret 进行星火测试

#### Scenario: 星火配置已填写
- **WHEN** 用户在旧的 iflytekAppId/iflytekApiSecret 字段填写了值
- **AND** 用户点击"测试连接"按钮
- **THEN** 系统使用星火独立配置进行测试

## MODIFIED Requirements

### Requirement: 讯飞星火测试连接函数
`handleSparkTest` 函数 SHALL 优先使用 IAT 配置区的值作为回退。

**修改点**：
- 测试时读取 `localIflytekIatAppId` 和 `localIflytekIatApiSecret` 作为回退
- 测试按钮禁用条件：星火配置为空且 IAT 配置的 APPID/APISecret 也为空

### Requirement: UI 提示准确性
Settings.jsx 中讯飞星火配置区的提示 SHALL 准确反映配置共用逻辑。

**修改点**：
- 提示文案改为："若下方讯飞语音听写配置已填写，测试时将自动使用其 APPID 和 APISecret"