# 题库管理界面滚动问题修复 Spec

## Why
题库管理界面在题目列表展开后，用户无法完整下滑浏览所有题目，导致底部题目被截断无法查看。这是由于页面布局缺少正确的滚动区域划分和高度控制所致。

## What Changes
- 修复题库管理页面（QuestionBankPage）的滚动区域布局
- 确保三下拉选择器固定在顶部，题目列表区域可独立滚动
- 修复题目卡片列表的溢出和高度计算问题
- 确保移动端底部导航栏不遮挡题目内容

## Impact
- Affected specs: question-bank-chapter-ui
- Affected code: `src/pages/QuestionBankPage.jsx`, `src/index.css`

## ADDED Requirements

### Requirement: 题库页面可完整滚动
系统 SHALL 确保题库管理界面的题目列表区域可以完整滚动，所有题目均可查看。

#### Scenario: 题目列表可滚动
- **WHEN** 用户在题库管理页面选择一个单元并展开题目列表
- **THEN** 题目列表区域可以完整上下滑动
- **AND** 最后一张题目卡片完全可见，不被截断
- **AND** 底部导航栏不遮挡题目内容

#### Scenario: 多题目场景
- **WHEN** 一个单元包含大量题目（超过一屏）
- **THEN** 用户可以通过下滑浏览所有题目
- **AND** 滚动到底部时最后一张卡片的底部完全可见

## MODIFIED Requirements

### Requirement: 页面布局结构
系统 SHALL 使用正确的滚动容器结构，将固定区域和滚动区域分离。

#### Scenario: 固定头部 + 滚动内容
- **WHEN** 题库管理页面渲染
- **THEN** 三下拉选择器固定在页面顶部（不随滚动移动）
- **AND** 下方的题目列表/空状态区域独立滚动
- **AND** 整个页面高度正确计算，不出现双重滚动条或滚动截断
