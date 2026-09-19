# 照片拍摄后编辑功能 - 产品需求文档

## Overview

* **Summary**: 在用户拍摄照片或从相册选择图片后，提供一个图片编辑界面，支持裁剪、旋转、缩放等基本编辑功能，编辑完成后再进行OCR文字识别。

* **Purpose**: 用户拍摄的照片可能存在角度不正、包含多余内容等问题，需要在OCR识别前进行编辑，以提高识别准确率和用户体验。

* **Target Users**: 使用拍照功能进行OCR识别的用户

## Goals

* 拍摄照片后自动进入图片编辑界面

* 支持从相册选择图片后进入编辑界面

* 提供基本的图片编辑功能：裁剪、旋转、缩放

* 编辑完成后进行OCR识别

* 支持取消编辑，重新选择图片

## Non-Goals (Out of Scope)

* 不支持复杂的图片滤镜效果

* 不支持图片涂鸦功能

* 不支持多张图片同时编辑

## Background & Context

当前项目的拍照流程：点击拍照按钮 → 选择照片 → 直接进行OCR识别 → 将识别结果填入输入框。用户希望在OCR识别前能够编辑照片，以确保识别质量。

## Functional Requirements

* **FR-1**: 拍摄照片后，显示图片编辑界面，而非直接进行OCR识别

* **FR-2**: 从相册选择图片后，显示图片编辑界面，而非直接进行OCR识别

* **FR-3**: 图片编辑界面支持裁剪功能（自由裁剪，可拖动调整裁剪框）

* **FR-4**: 图片编辑界面支持旋转功能（顺时针90度旋转）

* **FR-5**: 图片编辑界面支持缩放功能（双指缩放）

* **FR-6**: 编辑完成后点击确认按钮，进行OCR识别

* **FR-7**: 点击取消按钮，关闭编辑界面，不进行OCR识别

## Non-Functional Requirements

* **NFR-1**: 图片编辑界面必须适配移动端屏幕，所有按钮可见可用

* **NFR-2**: 编辑操作响应流畅，无明显卡顿

* **NFR-3**: 界面风格简洁大方，符合移动端APP标准

* **NFR-4**: 支持触摸操作（拖拽、缩放）

## Constraints

* **Technical**: 使用Canvas API实现图片编辑，不引入额外的图片编辑库

* **Dependencies**: 基于React + Vite构建，需保持与现有代码风格一致

## Assumptions

* 用户设备支持触摸操作（移动端）

* 用户拍摄的图片格式为常见格式（JPEG、PNG等）

## Acceptance Criteria

### AC-1: 拍照后进入编辑界面

* **Given**: 用户在输入栏点击拍照按钮

* **When**: 用户拍摄照片并确认

* **Then**: 显示图片编辑界面，展示拍摄的照片

* **Verification**: `human-judgment`

### AC-2: 从相册选择后进入编辑界面

* **Given**: 用户在输入栏点击相册按钮

* **When**: 用户从相册选择一张图片

* **Then**: 显示图片编辑界面，展示选择的图片

* **Verification**: `human-judgment`

### AC-3: 裁剪功能

* **Given**: 用户在图片编辑界面

* **When**: 用户拖动裁剪框的边缘或角

* **Then**: 裁剪框跟随拖动调整大小和位置

* **Verification**: `human-judgment`

### AC-4: 旋转功能

* **Given**: 用户在图片编辑界面

* **When**: 用户点击旋转按钮

* **Then**: 图片顺时针旋转90度

* **Verification**: `human-judgment`

### AC-5: 缩放功能

* **Given**: 用户在图片编辑界面

* **When**: 用户使用双指进行缩放操作

* **Then**: 图片按照手势进行缩放

* **Verification**: `human-judgment`

### AC-6: 确认编辑后进行OCR

* **Given**: 用户在图片编辑界面完成编辑

* **When**: 用户点击确认按钮

* **Then**: 关闭编辑界面，进行OCR识别，识别结果填入输入框

* **Verification**: `human-judgment`

### AC-7: 取消编辑

* **Given**: 用户在图片编辑界面

* **When**: 用户点击取消按钮

* **Then**: 关闭编辑界面，不进行OCR识别

* **Verification**: `human-judgment`

## Open Questions

* [x] 是否需要支持固定比例裁剪（如1:1、4:3等）？

* [ ] 是否需要添加亮度/对比度调整功能？

