import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const MAX_IMAGE_DIMENSION = 2048
const MAX_OUTPUT_DIMENSION = 2048

const CROP_RATIOS = [
  { label: '自由', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
]

const DRAW_COLORS = ['#ffffff', '#ff4757', '#ff6348', '#ffa502', '#2ed573', '#1e90ff', '#a55eea', '#000000']
const DRAW_SIZES = [3, 6, 10, 16, 24]
const TEXT_COLORS = ['#ffffff', '#ff4757', '#ff6348', '#ffa502', '#2ed573', '#1e90ff', '#a55eea', '#000000']
const TEXT_SIZES = [14, 18, 22, 28, 36, 48]

export default function ImageEditor({ imageFiles, onComplete, onCancel }) {
  const canvasRef = useRef(null)
  const drawCanvasRef = useRef(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [images, setImages] = useState([])
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [cropRect, setCropRect] = useState(null)
  const [cropRatio, setCropRatio] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialCropRect, setInitialCropRect] = useState(null)
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 })
  const [lastTouchDistance, setLastTouchDistance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [loadStatus, setLoadStatus] = useState('')
  const objectUrlRef = useRef([])
  const [canvasReady, setCanvasReady] = useState(false)
  const panInitialRef = useRef({ x: 0, y: 0 })
  const scaleInitialRef = useRef(1)
  const pinchMidpointRef = useRef({ x: 0, y: 0 })

  const [mode, setMode] = useState('crop')
  const [drawColor, setDrawColor] = useState('#ffffff')
  const [drawSize, setDrawSize] = useState(6)
  const [isErasing, setIsErasing] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [lastDrawPoint, setLastDrawPoint] = useState(null)
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(22)
  const [texts, setTexts] = useState([])
  const [editingTextIndex, setEditingTextIndex] = useState(-1)
  const [editingTextValue, setEditingTextValue] = useState('')
  const [showRatioPanel, setShowRatioPanel] = useState(false)
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const currentImage = images[currentIndex]
  const hasMultipleImages = imageFiles && imageFiles.length > 1

  // --- 图片加载（createImageBitmap 加速）---
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setLoadStatus('')

    const downscaleIfNeeded = (source, srcW, srcH) => {
      if (srcW <= MAX_IMAGE_DIMENSION && srcH <= MAX_IMAGE_DIMENSION) return source
      try {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / srcW, MAX_IMAGE_DIMENSION / srcH)
        const newW = Math.round(srcW * ratio)
        const newH = Math.round(srcH * ratio)
        const offCanvas = document.createElement('canvas')
        offCanvas.width = newW
        offCanvas.height = newH
        const offCtx = offCanvas.getContext('2d')
        offCtx.drawImage(source, 0, 0, newW, newH)
        return offCanvas
      } catch (_) { return source }
    }

    const loadImageFile = async (file) => {
      try {
        setLoadStatus('解码中...')
        const bitmap = await createImageBitmap(file)
        setLoadStatus('处理中...')
        const image = downscaleIfNeeded(bitmap, bitmap.width, bitmap.height)
        bitmap.close()
        return image
      } catch (_) {}
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('图片加载超时')), 10000)
        const url = URL.createObjectURL(file)
        objectUrlRef.current.push(url)
        const img = new Image()
        img.onload = () => { clearTimeout(timeout); resolve(downscaleIfNeeded(img, img.width, img.height)) }
        img.onerror = () => { clearTimeout(timeout); reject(new Error('图片加载失败')) }
        img.src = url
      })
    }

    const loadAllImages = async () => {
      try {
        const fileList = Array.isArray(imageFiles) ? imageFiles : [imageFiles]
        const loadedImages = []
        for (const file of fileList) {
          if (cancelled) break
          loadedImages.push({ image: await loadImageFile(file), file })
        }
        if (!cancelled) { setImages(loadedImages); setLoading(false) }
      } catch (err) {
        if (!cancelled) { setLoadError(err.message || '图片加载失败'); setLoading(false) }
      }
    }
    loadAllImages()
    return () => {
      cancelled = true
      objectUrlRef.current.forEach(url => URL.revokeObjectURL(url))
      objectUrlRef.current = []
      setImages([])
    }
  }, [imageFiles])

  // --- Canvas ready detection ---
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) setCanvasReady(true)
      }
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (canvasReady) return
    const timer = setTimeout(() => setCanvasReady(true), 3000)
    return () => clearTimeout(timer)
  }, [canvasReady])

  const calculateFitScale = useCallback(() => {
    if (!currentImage || !currentImage.image || !canvasRef.current) return 1
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return 1
    const image = currentImage.image
    const imgW = rotation % 180 === 0 ? image.width : image.height
    const imgH = rotation % 180 === 0 ? image.height : image.width
    const margin = 20
    const availableW = rect.width - margin * 2
    const availableH = rect.height - margin * 2
    return Math.min(availableW / imgW, availableH / imgH)
  }, [currentImage, rotation])

  // --- Reset on image switch ---
  useEffect(() => {
    setRotation(0); setScale(1); setPosition({ x: 0, y: 0 })
    setCropRect(null); setCropRatio(null); setShowRatioPanel(false)
    setTexts([]); setHistory([]); setHistoryIndex(-1)
    clearDrawCanvas()
    setMode('crop')
  }, [currentIndex])

  const clearDrawCanvas = () => {
    const dc = drawCanvasRef.current
    if (!dc) return
    const dpr = window.devicePixelRatio || 1
    const rect = dc.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    dc.width = rect.width * dpr
    dc.height = rect.height * dpr
    const ctx = dc.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)
  }

  // --- 渲染主画面 ---
  useEffect(() => {
    if (!currentImage || !currentImage.image || !canvasRef.current || !canvasReady) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const image = currentImage.image
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const canvasWidth = rect.width
    const canvasHeight = rect.height
    let drawWidth, drawHeight
    if (rotation % 180 === 0) {
      drawWidth = image.width * scale
      drawHeight = image.height * scale
    } else {
      drawWidth = image.height * scale
      drawHeight = image.width * scale
    }
    const minSize = Math.min(canvasWidth, canvasHeight) * 0.3
    const maxSize = Math.max(canvasWidth, canvasHeight) * 2
    if (drawWidth < minSize || drawHeight < minSize) {
      const scaleUp = Math.max(minSize / image.width, minSize / image.height)
      drawWidth = image.width * scaleUp; drawHeight = image.height * scaleUp
    }
    if (drawWidth > maxSize || drawHeight > maxSize) {
      const scaleDown = Math.min(maxSize / image.width, maxSize / image.height)
      drawWidth = image.width * scaleDown; drawHeight = image.height * scaleDown
    }
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)
    ctx.save()
    ctx.translate(canvasWidth / 2 + position.x, canvasHeight / 2 + position.y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    ctx.restore()
    if (mode === 'crop') {
      if (!cropRect) {
        const margin = 20
        let cropWidth, cropHeight
        if (rotation % 180 === 0) {
          cropWidth = Math.min(drawWidth, canvasWidth - margin * 2)
          cropHeight = Math.min(drawHeight, canvasHeight - margin * 2)
        } else {
          cropWidth = Math.min(drawHeight, canvasWidth - margin * 2)
          cropHeight = Math.min(drawWidth, canvasHeight - margin * 2)
        }
        if (cropRatio) {
          if (cropWidth / cropHeight > cropRatio) cropWidth = cropHeight * cropRatio
          else cropHeight = cropWidth / cropRatio
        }
        setCropRect({
          x: (canvasWidth - cropWidth) / 2, y: (canvasHeight - cropHeight) / 2,
          width: cropWidth, height: cropHeight,
        })
      }
      if (cropRect) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, canvasWidth, canvasHeight)
        ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height)
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fill('evenodd')
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height)
        let lineDash = [4, 4]
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash(lineDash)
        for (let i = 1; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(cropRect.x + cropRect.width * i / 3, cropRect.y)
          ctx.lineTo(cropRect.x + cropRect.width * i / 3, cropRect.y + cropRect.height); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(cropRect.x, cropRect.y + cropRect.height * i / 3)
          ctx.lineTo(cropRect.x + cropRect.width, cropRect.y + cropRect.height * i / 3); ctx.stroke()
        }
        ctx.setLineDash([])
        const handleSize = 20
        const corners = [
          { x: cropRect.x, y: cropRect.y },
          { x: cropRect.x + cropRect.width, y: cropRect.y },
          { x: cropRect.x, y: cropRect.y + cropRect.height },
          { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
        ]
        corners.forEach(corner => {
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 2
          ctx.stroke()
        })
        ctx.restore()
      }
    }
    // 绘制文字
    if (texts.length > 0) {
      const ctx2 = canvas.getContext('2d')
      texts.forEach(t => {
        const imgCx = canvasWidth / 2 + position.x
        const imgCy = canvasHeight / 2 + position.y
        const angle = (rotation * Math.PI) / 180
        const relX = t.x
        const relY = t.y
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const worldX = imgCx + relX * cos - relY * sin
        const worldY = imgCy + relX * sin + relY * cos
        ctx2.save()
        ctx2.font = `${t.size}px sans-serif`
        ctx2.fillStyle = t.color
        ctx2.textBaseline = 'bottom'
        ctx2.fillText(t.text, worldX, worldY)
        ctx2.restore()
      })
    }
  }, [currentImage, rotation, scale, position, cropRect, canvasReady, mode, cropRatio, texts])

  // --- 同步 drawCanvas 尺寸 ---
  useEffect(() => {
    if (!drawCanvasRef.current || !canvasRef.current || !canvasReady) return
    const canvas = canvasRef.current
    const dc = drawCanvasRef.current

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const dpr = window.devicePixelRatio || 1
      dc.width = rect.width * dpr
      dc.height = rect.height * dpr
      dc.style.width = rect.width + 'px'
      dc.style.height = rect.height + 'px'
      const ctx = dc.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasReady])

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getCanvasPoint = (clientX, clientY) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // ========== CROP HANDLERS ==========
  const handleCropTouchStart = (x, y) => {
    if (cropRatio) {
      if (x >= cropRect.x && x <= cropRect.x + cropRect.width && y >= cropRect.y && y <= cropRect.y + cropRect.height) {
        setIsDragging(true); setDragType('move'); setDragStart({ x, y }); setInitialCropRect({ ...cropRect })
        return
      }
      setIsDragging(true); setDragType('pan'); setDragStart({ x, y }); setInitialPosition({ ...position })
      return
    }
    const hitRadius = 22
    const corners = [
      { x: cropRect.x, y: cropRect.y, type: 'top-left' },
      { x: cropRect.x + cropRect.width, y: cropRect.y, type: 'top-right' },
      { x: cropRect.x, y: cropRect.y + cropRect.height, type: 'bottom-left' },
      { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height, type: 'bottom-right' },
    ]
    for (const corner of corners) {
      if (Math.sqrt((x - corner.x) ** 2 + (y - corner.y) ** 2) < hitRadius) {
        setIsDragging(true); setDragType(corner.type); setDragStart({ x, y }); setInitialCropRect({ ...cropRect })
        return
      }
    }
    if (x >= cropRect.x && x <= cropRect.x + cropRect.width && y >= cropRect.y && y <= cropRect.y + cropRect.height) {
      setIsDragging(true); setDragType('move'); setDragStart({ x, y }); setInitialCropRect({ ...cropRect })
      return
    }
    setIsDragging(true); setDragType('pan'); setDragStart({ x, y }); setInitialPosition({ ...position })
  }

  const handleCropTouchMove = (x, y, dx, dy) => {
    if (dragType === 'pan') {
      setPosition({ x: initialPosition.x + dx, y: initialPosition.y + dy })
    } else if (dragType && initialCropRect) {
      const minSize = 50
      let newRect = { ...initialCropRect }
      if (dragType === 'move' || dragType.startsWith('move')) {
        newRect.x += dx; newRect.y += dy
      } else if (dragType === 'top-left') {
        newRect.x += dx; newRect.y += dy
        newRect.width -= dx; newRect.height -= dy
        if (cropRatio && newRect.width > 0) newRect.height = newRect.width / cropRatio
      } else if (dragType === 'top-right') {
        newRect.y += dy
        newRect.width += dx; newRect.height -= dy
        if (cropRatio && newRect.width > 0) newRect.height = newRect.width / cropRatio
      } else if (dragType === 'bottom-left') {
        newRect.x += dx
        newRect.width -= dx; newRect.height += dy
        if (cropRatio && newRect.width > 0) newRect.height = newRect.width / cropRatio
      } else if (dragType === 'bottom-right') {
        newRect.width += dx; newRect.height += dy
        if (cropRatio && newRect.width > 0) newRect.height = newRect.width / cropRatio
      }
      if (newRect.width < minSize) { newRect.width = minSize; if (cropRatio) newRect.height = minSize / cropRatio }
      if (newRect.height < minSize) { newRect.height = minSize; if (cropRatio) newRect.width = minSize * cropRatio }
      setCropRect(newRect)
    }
  }

  // ========== DRAW HANDLERS ==========
  const handleDrawStart = (x, y) => {
    setIsDrawing(true); setLastDrawPoint({ x, y })
    saveSnapshot()
  }

  const handleDrawMove = (x, y) => {
    if (!isDrawing || !lastDrawPoint) return
    const dc = drawCanvasRef.current
    if (!dc) return
    const ctx = dc.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(lastDrawPoint.x, lastDrawPoint.y)
    ctx.lineTo(x, y)
    ctx.strokeStyle = isErasing ? '#000000' : drawColor
    ctx.lineWidth = isErasing ? drawSize * 3 : drawSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    setLastDrawPoint({ x, y })
  }

  const handleDrawEnd = () => { setIsDrawing(false); setLastDrawPoint(null) }

  const saveSnapshot = () => {
    const dc = drawCanvasRef.current
    if (!dc) return
    const dataUrl = dc.toDataURL()
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(dataUrl)
      return newHistory.slice(-20)
    })
    setHistoryIndex(prev => Math.min(prev + 1, 19))
  }

  const restoreSnapshot = (index) => {
    const dc = drawCanvasRef.current
    if (!dc) return
    const ctx = dc.getContext('2d')
    const rect = dc.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    if (index >= 0 && history[index]) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = history[index]
    }
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      restoreSnapshot(newIndex)
    }
  }

  const handleClearDrawings = () => {
    clearDrawCanvas()
    setHistory([]); setHistoryIndex(-1)
  }

  // ========== TEXT HANDLERS ==========
  const handleTextAdd = (x, y) => {
    const newTexts = [...texts, { id: Date.now(), x, y, text: '文字', color: textColor, size: textSize }]
    setTexts(newTexts)
    setEditingTextIndex(newTexts.length - 1)
    setEditingTextValue('文字')
  }

  const handleTextMove = (id, dx, dy) => setTexts(prev => prev.map(t => t.id === id ? { ...t, x: t.x + dx, y: t.y + dy } : t))
  const handleTextDelete = (id) => { setTexts(prev => prev.filter(t => t.id !== id)); setEditingTextIndex(-1) }

  // ========== POINTER HANDLERS ==========
  const handlePointerDown = useCallback((clientX, clientY) => {
    const pt = getCanvasPoint(clientX, clientY)
    if (mode === 'crop') {
      if (cropRect) handleCropTouchStart(pt.x, pt.y)
      else { setIsDragging(true); setDragType('pan'); setDragStart({ x: pt.x, y: pt.y }); setInitialPosition({ ...position }) }
    } else if (mode === 'draw') handleDrawStart(pt.x, pt.y)
    else if (mode === 'text') {
      let hitText = false
      for (const t of texts) {
        if (pt.x >= t.x && pt.x <= t.x + t.text.length * t.size * 0.6 && pt.y >= t.y - t.size * 1.4 && pt.y <= t.y) {
          hitText = true; setIsDragging(true); setDragType('textmove-' + t.id); setDragStart({ x: pt.x, y: pt.y }); setInitialPosition({ x: t.x, y: t.y })
          break
        }
      }
      if (!hitText) handleTextAdd(pt.x, pt.y)
    }
  }, [mode, cropRect, texts, position])

  const handlePointerMove = useCallback((clientX, clientY) => {
    const pt = getCanvasPoint(clientX, clientY)
    if (mode === 'crop' && isDragging) handleCropTouchMove(pt.x, pt.y, pt.x - dragStart.x, pt.y - dragStart.y)
    else if (mode === 'draw') handleDrawMove(pt.x, pt.y)
    else if (mode === 'text' && isDragging && dragType && dragType.startsWith('textmove-')) {
      const textId = parseInt(dragType.replace('textmove-', ''))
      handleTextMove(textId, pt.x - dragStart.x, pt.y - dragStart.y)
    }
  }, [mode, isDragging, dragType, dragStart, initialPosition])

  const handlePointerUp = useCallback(() => { if (mode === 'draw') handleDrawEnd(); setIsDragging(false); setDragType(null) }, [mode])

  // ========== TOUCH EVENTS ==========
  const handleTouchStart = useCallback((e) => {
    e.preventDefault()
    if (e.touches.length === 1) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY)
    else if (e.touches.length === 2) {
      setLastTouchDistance(getTouchDistance(e.touches))
      panInitialRef.current = { ...position }
      scaleInitialRef.current = scale
      pinchMidpointRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
    }
  }, [handlePointerDown, mode, position, scale])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    if (e.touches.length === 1) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)
    else if (e.touches.length === 2 && lastTouchDistance) {
      const scaleFactor = getTouchDistance(e.touches) / lastTouchDistance
      setScale(Math.max(0.1, Math.min(10, scaleInitialRef.current * scaleFactor)))
      setLastTouchDistance(getTouchDistance(e.touches))
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const dx = midX - pinchMidpointRef.current.x
      const dy = midY - pinchMidpointRef.current.y
      pinchMidpointRef.current = { x: midX, y: midY }
      setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }))
    }
  }, [handlePointerMove, lastTouchDistance, mode])

  const handleTouchEnd = useCallback(() => { handlePointerUp(); setLastTouchDistance(null) }, [handlePointerUp])

  // ========== MOUSE EVENTS ==========
  const handleMouseDown = useCallback((e) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown])
  const handleMouseMove = useCallback((e) => handlePointerMove(e.clientX, e.clientY), [handlePointerMove])
  const handleMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp])

  // ========== BUTTON HANDLERS ==========
  const handleRotate = useCallback(() => { setRotation(prev => (prev + 90) % 360); setCropRect(null) }, [])
  const handleReset = useCallback(() => {
    setRotation(0); setPosition({ x: 0, y: 0 })
    setCropRect(null); setCropRatio(null)
    clearDrawCanvas(); setTexts([])
    setHistory([]); setHistoryIndex(-1)
    setScale(1)
  }, [])
  const handleModeSwitch = (newMode) => { setMode(newMode); setShowRatioPanel(false) }
  const handleChangeRatio = (ratio) => { setCropRatio(ratio); setCropRect(null); setShowRatioPanel(false) }

  // ========== CONFIRM (minimal output) ==========
  const handleComplete = useCallback(() => {
    if (!currentImage || !currentImage.image) {
      console.warn('ImageEditor: No current image to process')
      return
    }
    try {
      const img = currentImage.image
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      if (!ctx) { console.error('ImageEditor: Failed to get canvas context'); return }
      ctx.drawImage(img, 0, 0)
      c.toBlob(
        (b) => {
          if (b && onComplete) {
            onComplete(b, currentIndex, images.length)
          } else {
            console.error('ImageEditor: Failed to convert canvas to blob')
          }
        },
        'image/jpeg',
        0.92
      )
    } catch (err) {
      console.error('ImageEditor: Error processing image:', err)
    }
  }, [currentImage, onComplete, currentIndex, images.length])

  // ========== RENDER ==========
  if (loading || !currentImage) {
    return createPortal(
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: '#000000', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 2147483647,
      }}>
        <div style={{ fontSize: '16px', color: loadError ? '#ef4444' : '#ffffff', textAlign: 'center', padding: '0 20px' }}>
          {loadError || (
            <>
              <div style={{ marginBottom: 12 }}>{loadStatus || '加载图片中...'}</div>
              <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </>
          )}
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: '#000000', display: 'flex', flexDirection: 'column',
      zIndex: 2147483647, userSelect: 'none', WebkitUserSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* ========== TOP BAR ========== */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
        backgroundColor: 'rgba(0,0,0,0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        minHeight: '48px', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: 'transparent', border: 'none', color: '#ffffff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          padding: '8px 10px', borderRadius: '10px', fontSize: '14px', fontWeight: 500,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          取消
        </button>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>编辑图片</span>
        <button onClick={handleComplete} style={{
          padding: '8px 16px', borderRadius: '10px', border: 'none',
          backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '14px', fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <span>完成</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>

      {/* ========== CANVAS AREA ========== */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', backgroundColor: '#000000' }}>
        <canvas
          ref={canvasRef}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            cursor: isDragging ? 'grabbing' : (mode === 'draw' ? 'crosshair' : 'grab'),
            touchAction: 'none', display: 'block',
          }}
        />
        <canvas
          ref={drawCanvasRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', display: 'block' }}
        />
      </div>

      {/* ========== DRAW TOOLBAR ========== */}
      {mode === 'draw' && (
        <div style={{ padding: '8px 12px 6px', backgroundColor: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <button onClick={() => setIsErasing(false)} style={{
              padding: '5px 12px', borderRadius: '8px', border: 'none',
              backgroundColor: isErasing ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.3)',
              color: isErasing ? 'rgba(255,255,255,0.6)' : '#60a5fa',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              画笔
            </button>
            <button onClick={() => setIsErasing(true)} style={{
              padding: '5px 12px', borderRadius: '8px', border: 'none',
              backgroundColor: isErasing ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)',
              color: isErasing ? '#f87171' : 'rgba(255,255,255,0.6)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L15.4.6c.8-.8 2-.8 2.8 0L21 3.8c.8.8.8 2 0 2.8L9 19"/><line x1="7" y1="17" x2="20" y2="17"/></svg>
              橡皮
            </button>
            <div style={{ flex: 1 }} />
            {history.length > 0 && (
              <>
                <button onClick={handleUndo} style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none',
                  background: 'transparent', color: 'rgba(255,255,255,0.7)',
                  fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 7 3 13 9 13"/><path d="M21 12a9 9 0 00-9-9 9.75 9.75 0 00-6.74 2.74L3 7"/></svg>
                  撤销
                </button>
                <button onClick={handleClearDrawings} style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none',
                  background: 'transparent', color: '#f87171', fontSize: '12px', cursor: 'pointer',
                }}>
                  清空
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', flexShrink: 0, width: 28 }}>颜色</span>
            {DRAW_COLORS.map(c => (
              <button key={c} onClick={() => setDrawColor(c)} style={{
                width: 26, height: 26, borderRadius: '50%', backgroundColor: c, cursor: 'pointer', padding: 0, flexShrink: 0,
                border: c === drawColor ? '2.5px solid #fff' : '2px solid transparent',
                transform: c === drawColor ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.15s ease',
              }} />
            ))}
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', flexShrink: 0, marginLeft: 4, width: 28 }}>粗细</span>
            {DRAW_SIZES.map(s => (
              <button key={s} onClick={() => setDrawSize(s)} style={{
                width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', padding: 0, flexShrink: 0,
                border: drawSize === s ? '2px solid #60a5fa' : '2px solid rgba(255,255,255,0.2)',
                background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: drawSize === s ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 0.15s ease',
              }}>
                <div style={{ width: Math.max(4, s - 1) + 'px', height: Math.max(4, s - 1) + 'px', borderRadius: '50%', backgroundColor: isErasing ? '#f87171' : drawColor }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ========== TEXT TOOLBAR ========== */}
      {mode === 'text' && (
        <div style={{ backgroundColor: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {editingTextIndex >= 0 && texts[editingTextIndex] && (
            <div style={{ padding: '6px 12px', display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                value={editingTextValue}
                onChange={e => {
                  setEditingTextValue(e.target.value)
                  setTexts(prev => prev.map((t, i) => i === editingTextIndex ? { ...t, text: e.target.value } : t))
                }}
                style={{
                  flex: 1, minHeight: 38, padding: '4px 10px', fontSize: 14, borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)',
                  color: '#fff', outline: 'none',
                }}
                placeholder="输入文字…"
                autoFocus
              />
              <button
                onClick={() => handleTextDelete(texts[editingTextIndex].id)}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', backgroundColor: 'rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                删除
              </button>
            </div>
          )}
          <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', flexShrink: 0, width: 28 }}>颜色</span>
            {TEXT_COLORS.map(c => (
              <button key={c} onClick={() => setTextColor(c)} style={{
                width: 26, height: 26, borderRadius: '50%', backgroundColor: c, cursor: 'pointer', padding: 0, flexShrink: 0,
                border: c === textColor ? '2.5px solid #fff' : '2px solid transparent',
                transform: c === textColor ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.15s ease',
              }} />
            ))}
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', flexShrink: 0, marginLeft: 4, width: 28 }}>大小</span>
            {TEXT_SIZES.map(s => (
              <button key={s} onClick={() => setTextSize(s)} style={{
                padding: '4px 10px', borderRadius: 6, border: 'none',
                backgroundColor: textSize === s ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                color: textSize === s ? '#60a5fa' : 'rgba(255,255,255,0.8)',
                fontSize: 12, fontWeight: textSize === s ? 600 : 400, cursor: 'pointer', flexShrink: 0,
              }}>{s}</button>
            ))}
            {editingTextIndex < 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                点击图片添加文字
              </span>
            )}
          </div>
        </div>
      )}

      {/* ========== RATIO PANEL ========== */}
      {mode === 'crop' && showRatioPanel && (
        <div style={{
          padding: '8px 12px', backgroundColor: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: '6px', overflowX: 'auto', flexShrink: 0,
        }}>
          {CROP_RATIOS.map(r => (
            <button key={r.label} onClick={() => handleChangeRatio(r.ratio)} style={{
              padding: '6px 16px', borderRadius: '20px', border: 'none', flexShrink: 0,
              backgroundColor: cropRatio === r.ratio ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: '#ffffff', fontSize: '12px', fontWeight: cropRatio === r.ratio ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* ========== BOTTOM TOOLBAR ========== */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '4px 8px', paddingBottom: 'calc(4px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: 'rgba(0,0,0,0.9)', borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <button onClick={() => { handleModeSwitch('crop'); setCropRatio(null); setCropRect(null) }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            padding: '6px 10px', borderRadius: '10px', border: 'none', background: 'transparent',
            color: mode === 'crop' ? '#60a5fa' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
            fontSize: '10px', fontWeight: mode === 'crop' ? 600 : 400,
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.13 1L6 16a2 2 0 002 2h15"/><path d="M1 6.13L16 6a2 2 0 012 2v15"/></svg>
          <span>裁剪</span>
        </button>
        {mode === 'crop' && (
          <button onClick={() => setShowRatioPanel(!showRatioPanel)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              padding: '6px 10px', borderRadius: '10px', border: 'none', background: 'transparent',
              color: showRatioPanel ? '#60a5fa' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
              fontSize: '10px', fontWeight: showRatioPanel ? 600 : 400,
            }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            <span>比例</span>
          </button>
        )}
        <button onClick={handleRotate}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            padding: '6px 10px', borderRadius: '10px', border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '10px', fontWeight: 400,
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 00-9-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 009 9 9.75 9.75 0 006.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
          <span>旋转</span>
        </button>
        <button onClick={() => handleModeSwitch('draw')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            padding: '6px 10px', borderRadius: '10px', border: 'none', background: mode === 'draw' ? 'rgba(59,130,246,0.2)' : 'transparent',
            color: mode === 'draw' ? '#60a5fa' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
            fontSize: '10px', fontWeight: mode === 'draw' ? 600 : 400,
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          <span>涂鸦</span>
        </button>
        <button onClick={() => handleModeSwitch('text')}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            padding: '6px 10px', borderRadius: '10px', border: 'none', background: mode === 'text' ? 'rgba(59,130,246,0.2)' : 'transparent',
            color: mode === 'text' ? '#60a5fa' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
            fontSize: '10px', fontWeight: mode === 'text' ? 600 : 400,
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
          <span>文字</span>
        </button>
        <button onClick={handleReset}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            padding: '6px 10px', borderRadius: '10px', border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '10px', fontWeight: 400,
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>重置</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
