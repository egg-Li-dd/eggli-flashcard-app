# Vosk 模型验证容错修复计划

## 问题分析

从用户截图中发现以下问题：

1. **错误信息显示 `words.txt.txt`**：代码中写的是 `words.txt`，但错误信息显示 `words.txt.txt`，说明模型目录中可能存在文件名被修改的情况（如下载或解压过程中自动添加了 `.txt` 后缀）

2. **graph 目录存在异常文件名**：`word_HCLr.fst` 而非标准的 `HCLr.fst`，说明 ZIP 文件可能存在问题

3. **根本问题**：当前的 `validateModelFiles()` 做了过于严格的文件验证，导致即使 Vosk SDK 可能能加载的模型也被拒绝

## 修复方案

### 1. 增强 words.txt 验证的容错性
- 同时检查 `words.txt`、`words.txt.txt`、`WORDS.TXT` 等变体
- 检查时忽略大小写和重复后缀

### 2. 增强解码图验证的容错性
- 检查 `HCLr.fst`、`HCLG.fst`、`Gr.fst` 时忽略前缀（如 `word_HCLr.fst`）
- 使用文件名匹配而非精确匹配

### 3. 提供更详细的诊断信息
- 在错误信息中列出所有已存在的文件，帮助用户确认问题

### 4. 添加智能文件名修复
- 如果检测到 `words.txt.txt`，自动复制为 `words.txt`
- 如果检测到 `word_HCLr.fst`，自动复制为 `HCLr.fst`

## 修改文件

1. **VoskASRPlugin.java**（主要修改）
   - 修改 `validateModelFiles()` 方法，增强容错性
   - 添加 `findFileWithVariants()` 辅助方法，支持文件名变体匹配
   - 添加 `fixModelFilename()` 辅助方法，修复常见文件名问题

## 风险评估

- **低风险**：修改仅涉及验证逻辑，不影响核心功能
- **兼容性**：所有现有模型仍能通过验证
- **测试建议**：用户需重新导入模型并测试语音识别功能

## 实施步骤

1. 修改 `validateModelFiles()` 方法
2. 添加辅助方法 `findFileWithVariants()` 和 `fixModelFilename()`
3. 重新编译 Java 代码
4. 重新打包 APK
5. 用户安装测试