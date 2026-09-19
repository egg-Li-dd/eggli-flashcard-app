let _XLSX = null
const getXLSX = async () => { if (!_XLSX) { const mod = await import('xlsx'); _XLSX = mod.default || mod; } return _XLSX }

const HEADER_MAPPINGS = {
  '问题': 'front',
  '题目': 'front',
  '题干': 'front',
  'question': 'front',
  'q': 'front',
  'answer': 'back',
  '答案': 'back',
  '回答': 'back',
  'a': 'back',
  '知识点': 'knowledge_point',
  '知识': 'knowledge_point',
  'kp': 'knowledge_point',
  'knowledge': 'knowledge_point',
  '单元': 'unitName',
  '单元名': 'unitName',
  'unit': 'unitName',
  '分类': 'categoryName',
  '分类名': 'categoryName',
  'category': 'categoryName',
  '章节': 'chapterName',
  '章节名': 'chapterName',
  'chapter': 'chapterName',
}

function normalizeHeader(header) {
  if (!header) return null
  const trimmed = String(header).trim().toLowerCase()
  for (const [key, value] of Object.entries(HEADER_MAPPINGS)) {
    if (key.toLowerCase() === trimmed) {
      return value
    }
  }
  return null
}

function detectHeaders(row) {
  const headers = {}
  for (let i = 0; i < row.length; i++) {
    const mapped = normalizeHeader(row[i])
    if (mapped) {
      headers[mapped] = i
    }
  }
  return headers
}

function parseRow(row, headers) {
  const card = {}
  if (headers.front !== undefined && row[headers.front] !== undefined) {
    card.front = String(row[headers.front]).trim()
  }
  if (headers.back !== undefined && row[headers.back] !== undefined) {
    card.back = String(row[headers.back]).trim()
  }
  if (headers.knowledge_point !== undefined && row[headers.knowledge_point] !== undefined) {
    card.knowledge_point = String(row[headers.knowledge_point]).trim()
  }
  if (headers.unitName !== undefined && row[headers.unitName] !== undefined) {
    card.unitName = String(row[headers.unitName]).trim()
  }
  if (headers.categoryName !== undefined && row[headers.categoryName] !== undefined) {
    card.categoryName = String(row[headers.categoryName]).trim()
  }
  if (headers.chapterName !== undefined && row[headers.chapterName] !== undefined) {
    card.chapterName = String(row[headers.chapterName]).trim()
  }
  return card
}

export async function parseExcelFile(file) { const XLSX = await getXLSX()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        const results = []
        const warnings = []
        let totalCards = 0

        for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex++) {
          const sheetName = workbook.SheetNames[sheetIndex]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

          if (!jsonData || jsonData.length < 2) {
            warnings.push(`工作表 "${sheetName}" 数据不足，已跳过`)
            continue
          }

          // 跳过提示行（以"提示"开头的第一行）
          let headerRowIndex = 0
          let isTemplateFormat = false
          if (jsonData[0] && typeof jsonData[0][0] === 'string' && String(jsonData[0][0]).startsWith('提示')) {
            headerRowIndex = 1
            isTemplateFormat = true
          }
          if (headerRowIndex >= jsonData.length) {
            warnings.push(`工作表 "${sheetName}" 数据不足，已跳过`)
            continue
          }

          let headers = {}
          // 模板格式：用指定行作为表头
          // 非模板格式：尝试检测表头，检测不到则全当数据行
          if (isTemplateFormat || Object.keys(detectHeaders(jsonData[headerRowIndex])).length > 0) {
            headers = detectHeaders(jsonData[headerRowIndex])
          }

          if (!headers.front && !headers.back) {
            const skipSheet = jsonData.slice(0, 2).some(row =>
              row.some(cell => /^(ID|所属分类ID|所属单元ID|创建时间|最后错误|错误次数)$/.test(String(cell || '').trim()))
            )
            if (skipSheet) {
              warnings.push(`工作表 "${sheetName}" 为非卡片数据表，已跳过`)
              continue
            }

            let unitColIndex = -1
            let frontColIndex = 0
            let backColIndex = 1
            let knowledgePointColIndex = -1

            const headerCell = String(jsonData[headerRowIndex]?.[0] || '').trim().toLowerCase()
            const hasUnitKeyword = /^(单元|unit|章节|chapter|分类|category)$/.test(headerCell)
            const sampleRow = jsonData[headerRowIndex + 1] || jsonData[headerRowIndex + 2] || []
            const hasThreeCols = sampleRow.length >= 3 && 
              sampleRow[0] != null && String(sampleRow[0]).trim() !== '' &&
              sampleRow[1] != null && String(sampleRow[1]).trim() !== '' &&
              sampleRow[2] != null && String(sampleRow[2]).trim() !== ''
            const hasFourCols = sampleRow.length >= 4 && 
              sampleRow[3] != null && String(sampleRow[3]).trim() !== ''

            if (hasThreeCols && hasUnitKeyword) {
              unitColIndex = 0
              frontColIndex = 1
              backColIndex = 2
              knowledgePointColIndex = 3
            } else if (hasThreeCols) {
              const col0AvgLen = []
              const col1AvgLen = []
              for (let r = headerRowIndex + 1; r < Math.min(headerRowIndex + 6, jsonData.length); r++) {
                const row = jsonData[r]
                if (!row) continue
                const v0 = String(row[0] || '').trim()
                const v1 = String(row[1] || '').trim()
                if (v0) col0AvgLen.push(v0.length)
                if (v1) col1AvgLen.push(v1.length)
              }
              const avg0 = col0AvgLen.length > 0 ? col0AvgLen.reduce((a, b) => a + b, 0) / col0AvgLen.length : 0
              const avg1 = col1AvgLen.length > 0 ? col1AvgLen.reduce((a, b) => a + b, 0) / col1AvgLen.length : 0
              if (avg0 < avg1 * 0.6 && avg0 < 20) {
                unitColIndex = 0
                frontColIndex = 1
                backColIndex = 2
                knowledgePointColIndex = 3
              } else {
                knowledgePointColIndex = 2
              }
            }

            const dataStartIndex = hasUnitKeyword ? headerRowIndex + 1 : headerRowIndex
            for (let i = dataStartIndex; i < jsonData.length; i++) {
              const row = jsonData[i]
              const nonEmptyCols = row.filter(c => c != null && String(c).trim() !== '').length
              if (nonEmptyCols < (unitColIndex >= 0 ? 3 : 2)) continue

              const front = String(row[frontColIndex] || '').trim()
              const back = String(row[backColIndex] || '').trim()
              if (!front || !back) continue

              const card = { front, back, sheetName, rowIndex: i + 1 }
              if (unitColIndex >= 0) {
                const unitName = String(row[unitColIndex] || '').trim()
                if (unitName) {
                  card.unitName = unitName
                }
              }
              if (knowledgePointColIndex >= 0 && row[knowledgePointColIndex] != null) {
                const knowledgePoint = String(row[knowledgePointColIndex] || '').trim()
                if (knowledgePoint) {
                  card.knowledge_point = knowledgePoint
                }
              }
              results.push(card)
              totalCards++
            }
          } else {
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i]
            const card = parseRow(row, headers)

            if (!card.front || !card.back) {
              continue
            }

            // 跳过模板示例行（以"在此输入"开头）
            if (String(card.front).startsWith('在此输入') || String(card.back).startsWith('在此输入')) {
              continue
            }

            results.push({
              ...card,
              sheetName,
              rowIndex: i + 1,
            })
            totalCards++
          }
        }
        }

        resolve({
          success: true,
          cards: results,
          totalCards,
          warnings,
          sheets: workbook.SheetNames.length,
        })
      } catch (error) {
        reject(new Error(`Excel 解析失败: ${error.message}`))
      }
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    reader.readAsArrayBuffer(file)
  })
}

// —— 题库（testQuestions）Excel 解析 ——

const TQ_HEADER_MAPPINGS = {
  '题目': 'stem',
  '题干': 'stem',
  '问题': 'stem',
  '题型': 'type',
  '选项a': 'optionA',
  '选项b': 'optionB',
  '选项c': 'optionC',
  '选项d': 'optionD',
  '答案': 'answer',
  '解析': 'analysis',
  '解释': 'analysis',
  '知识点': 'knowledgePoint',
  '难度': 'difficulty',
  '分类': 'categoryName',
  '单元': 'unitName',
  '章节': 'chapterName',
}

function normalizeTqHeader(header) {
  if (!header) return null
  const trimmed = String(header).trim().toLowerCase()
  for (const [key, value] of Object.entries(TQ_HEADER_MAPPINGS)) {
    if (key.toLowerCase() === trimmed) return value
  }
  return null
}

function detectTqHeaders(row) {
  const headers = {}
  for (let i = 0; i < row.length; i++) {
    const mapped = normalizeTqHeader(row[i])
    if (mapped) headers[mapped] = i
  }
  return headers
}

function parseTqRow(row, headers) {
  const q = {}
  if (headers.stem !== undefined && row[headers.stem] !== undefined) q.stem = String(row[headers.stem]).trim()
  if (headers.type !== undefined && row[headers.type] !== undefined) q.type = String(row[headers.type]).trim()
  if (headers.answer !== undefined && row[headers.answer] !== undefined) q.answer = String(row[headers.answer]).trim()
  if (headers.analysis !== undefined && row[headers.analysis] !== undefined) q.analysis = String(row[headers.analysis]).trim()
  if (headers.knowledgePoint !== undefined && row[headers.knowledgePoint] !== undefined) q.knowledgePoint = String(row[headers.knowledgePoint]).trim()
  if (headers.difficulty !== undefined && row[headers.difficulty] !== undefined) q.difficulty = parseInt(row[headers.difficulty]) || 3
  if (headers.categoryName !== undefined && row[headers.categoryName] !== undefined) q.categoryName = String(row[headers.categoryName]).trim()
  if (headers.unitName !== undefined && row[headers.unitName] !== undefined) q.unitName = String(row[headers.unitName]).trim()
  if (headers.chapterName !== undefined && row[headers.chapterName] !== undefined) q.chapterName = String(row[headers.chapterName]).trim()
  // 收集选项
  const opts = []
  if (headers.optionA !== undefined && row[headers.optionA] !== undefined) opts.push(String(row[headers.optionA]).trim())
  if (headers.optionB !== undefined && row[headers.optionB] !== undefined) opts.push(String(row[headers.optionB]).trim())
  if (headers.optionC !== undefined && row[headers.optionC] !== undefined) opts.push(String(row[headers.optionC]).trim())
  if (headers.optionD !== undefined && row[headers.optionD] !== undefined) opts.push(String(row[headers.optionD]).trim())
  if (opts.length > 0) q.options = opts
  return q
}

export async function parseTestQuestionExcel(file) { const XLSX = await getXLSX()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const results = []
        const warnings = []

        for (let s = 0; s < workbook.SheetNames.length; s++) {
          const sheetName = workbook.SheetNames[s]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          if (!jsonData || jsonData.length < 2) { warnings.push(`工作表 "${sheetName}" 数据不足`); continue }
          let headerRowIndex = 0
          if (jsonData[0] && typeof jsonData[0][0] === 'string' && String(jsonData[0][0]).startsWith('提示')) { headerRowIndex = 1 }
          if (headerRowIndex >= jsonData.length) { warnings.push(`工作表 "${sheetName}" 数据不足`); continue }
          const headers = detectTqHeaders(jsonData[headerRowIndex])
          if (!headers.stem) { warnings.push(`工作表 "${sheetName}" 未找到题目列`); continue }
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const q = parseTqRow(jsonData[i], headers)
            if (!q.stem) continue
            results.push({ ...q, sheetName, rowIndex: i + 1 })
          }
        }
        resolve({ success: true, questions: results, warnings, total: results.length })
      } catch (error) {
        reject(new Error(`题库 Excel 解析失败: ${error.message}`))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

export function generatePreviewData(cards) {
  const categories = {}
  const chapters = {}
  const units = {}

  cards.forEach((card) => {
    const catName = card.categoryName || '默认分类'
    const chapName = card.chapterName || ''
    const unitName = card.unitName || '默认单元'

    if (!categories[catName]) {
      categories[catName] = { cards: [], chapters: new Set() }
    }

    if (chapName) {
      categories[catName].chapters.add(chapName)
      if (!chapters[chapName]) {
        chapters[chapName] = { cards: [], units: new Set() }
      }
      if (!units[unitName]) {
        units[unitName] = []
      }
      chapters[chapName].units.add(unitName)
      chapters[chapName].cards.push(card)
      units[unitName].push(card)
    }

    categories[catName].cards.push(card)
  })

  return {
    categories,
    chapters,
    units,
    totalCards: cards.length,
  }
}

/**
 * 生成 Excel 模板数据（卡片导入用）
 * @returns {Uint8Array} Excel 文件数据
 */
export async function generateExcelTemplate() { const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const headers = ['分类', '章节', '单元', '问题', '答案', '知识点']
  const data = [
    ['提示：公式请在两边加 $，如 $E=mc^2$  → 下方替换为你的数据', '', '', '', '', ''],
    headers,
    ['英语', 'Unit 1', 'Greetings', 'Hello, how are you?', 'I am fine, thank you.', '日常问候'],
    ['英语', 'Unit 1', 'Greetings', 'What is your name?', 'My name is...', '自我介绍'],
    ['数学', '', '加减法', '3 + 5 = ?', '8', '基础运算'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 30 }, { wch: 16 }]
  // 合并第一行的提示文字
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]
  XLSX.utils.book_append_sheet(wb, ws, '卡片数据')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/**
 * 下载 Excel 模板文件（含示例数据 + 列头说明）
 */
export async function downloadExcelTemplate() {
  const data = await generateExcelTemplate()
  try {
    // 尝试 Capacitor 保存 + 分享
    const { saveExcelFile, shareFile } = await import('../services/migrate')
    const result = await saveExcelFile(data, 'eggli-导入模板.xlsx')
    if (result.platform === 'mobile') {
      setTimeout(async () => {
        await shareFile(result.path, 'eggli-导入模板.xlsx')
      }, 500)
      return { path: result.path, filename: 'eggli-导入模板.xlsx', platform: 'mobile' }
    }
  } catch (_) {}
  // Web 回退：浏览器下载
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'eggli-导入模板.xlsx'
  a.click()
  URL.revokeObjectURL(url)
  return { filename: 'eggli-导入模板.xlsx', platform: 'web' }
}

/**
 * 生成题库 Excel 模板数据
 * @returns {Uint8Array} Excel 文件数据
 */
export async function generateTestQuestionTemplate() { const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const headers = ['分类', '章节', '单元', '题型', '题目', '选项A', '选项B', '选项C', '选项D', '答案', '解析', '知识点', '难度']
  const data = [
    ['提示：公式请在两边加 $，如 $E=mc^2$  → 下方替换为你的数据', '', '', '', '', '', '', '', '', '', '', '', ''],
    headers,
    ['英语', 'Unit 1', 'Greetings', 'single_choice', 'Hello, how are you?', 'Fine', 'Bad', 'OK', '', 'A', '"Fine" 是常见的回答', '日常问候', '2'],
    ['英语', 'Unit 1', 'Greetings', 'true_false', 'Nice to meet you 是告别用语', '', '', '', '', '错', 'Nice to meet you 是见面问候', '日常问候', '1'],
    ['数学', '', '加减法', 'fill_blank', '3 + 5 = ____', '', '', '', '', '8', '', '基础运算', '1'],
    ['数学', '', '加减法', 'multi_choice', '以下哪些是偶数？', '2', '3', '4', '5', 'AC', '能被2整除的是偶数', '基础运算', '3'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 6 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]
  XLSX.utils.book_append_sheet(wb, ws, '题库数据')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/**
 * 下载题库 Excel 模板文件
 */
export async function downloadTestQuestionTemplate() {
  const data = await generateTestQuestionTemplate()
  try {
    const { saveExcelFile, shareFile } = await import('../services/migrate')
    const result = await saveExcelFile(data, 'eggli-题库导入模板.xlsx')
    if (result.platform === 'mobile') {
      setTimeout(async () => {
        await shareFile(result.path, 'eggli-题库导入模板.xlsx')
      }, 500)
      return { path: result.path, filename: 'eggli-题库导入模板.xlsx', platform: 'mobile' }
    }
  } catch (_) {}
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'eggli-题库导入模板.xlsx'
  a.click()
  URL.revokeObjectURL(url)
  return { filename: 'eggli-题库导入模板.xlsx', platform: 'web' }
}

/**
 * 导出指定单元的卡片数据到 Excel
 * @param {Array} cards - 卡片数组
 * @param {Object} unitInfo - 单元信息 { name, categoryName, chapterName }
 * @returns {Uint8Array} Excel 文件数据
 */
export async function exportUnitCardsToExcel(cards, unitInfo) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const headers = ['问题', '答案', '知识点']
  
  const data = [
    [`提示：单元「${unitInfo.name}」的卡片数据，公式请用 $包裹`, '', ''],
    headers,
    ...cards.map(c => [
      c.front || '',
      c.back || '',
      c.knowledge_point || ''
    ])
  ]
  
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 40 }, { wch: 40 }, { wch: 20 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
  XLSX.utils.book_append_sheet(wb, ws, unitInfo.name || '单元数据')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/**
 * 导出章节的卡片数据到 Excel（含「单元」列）
 * @param {Array} cards - 卡片数组，每项需含 front, back, knowledge_point, unitName
 * @param {Object} chapterInfo - 章节信息 { name }
 * @returns {Uint8Array} Excel 文件数据
 */
export async function exportChapterCardsToExcel(cards, chapterInfo) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const headers = ['单元', '问题', '答案', '知识点']
  
  const data = [
    [`提示：章节「${chapterInfo.name}」的卡片数据`, '', '', ''],
    headers,
    ...cards.map(c => [
      c.unitName || '',
      c.front || '',
      c.back || '',
      c.knowledge_point || ''
    ])
  ]
  
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 40 }, { wch: 20 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  XLSX.utils.book_append_sheet(wb, ws, chapterInfo.name || '章节数据')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/**
 * 下载单元 Excel 文件
 */
export async function downloadUnitExcel(cards, unitInfo) {
  try {
    const data = await exportUnitCardsToExcel(cards, unitInfo)
    const filename = `${unitInfo.name || 'data'}.xlsx`

    // 1. 尝试 Capacitor 文件保存（移动端）
    let savedPath = null
    try {
      const { saveExcelFile, shareFile } = await import('../services/migrate')
      const result = await saveExcelFile(data, filename)
      savedPath = result.path
      if (result.platform === 'mobile') {
        // 保存成功后尝试分享
        setTimeout(async () => {
          await shareFile(result.path, filename)
        }, 500)
      }
      return { ...result, message: `已导出到：${result.path}` }
    } catch (mobileErr) {
      console.warn('[excelParser] Mobile export failed:', mobileErr.message)
    }

    // 2. 尝试 Web Share API（移动端/桌面端分享）
    try {
      const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      if (navigator.share && navigator.canShare?.({
        files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })]
      })) {
        await navigator.share({
          title: filename,
          files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })]
        })
        return { success: true, filename, platform: 'share' }
      }
    } catch (shareErr) {
      console.warn('[excelParser] Share failed:', shareErr.message)
    }

    // 3. 回退到 Blob 下载（Web）
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { success: true, filename, platform: 'web' }
  } catch (err) {
    console.error('[excelParser] downloadUnitExcel error:', err)
    throw new Error('导出失败：' + err.message)
  }
}

/**
 * 生成指定单元的 Excel 导入模板
 * @param {Object} unitInfo - 单元信息 { name, categoryName, chapterName }
 * @returns {Uint8Array} Excel 文件数据
 */
export async function generateUnitTemplate(unitInfo) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const headers = ['问题', '答案', '知识点']
  
  const data = [
    [`提示：导入到单元「${unitInfo.name}」的模板，公式请用 $包裹，如 $x^2 + y^2 = r^2$`, '', ''],
    headers,
    ['在此输入问题内容...', '在此输入答案内容...', '在此输入知识点...'],
    ['$E = mc^2$ 是什么公式？', '爱因斯坦质能方程', '相对论'],
    ['勾股定理的表达式？', '$a^2 + b^2 = c^2$', '几何'],
  ]
  
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 40 }, { wch: 40 }, { wch: 20 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
  XLSX.utils.book_append_sheet(wb, ws, unitInfo.name || '导入模板')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/**
 * 下载指定单元的 Excel 导入模板
 */
export async function downloadUnitTemplate(unitInfo) {
  const data = await generateUnitTemplate(unitInfo)
  const filename = `${unitInfo.name || 'unit'}-导入模板.xlsx`

  // 1. 尝试 Capacitor 文件保存（移动端）
  try {
    const { saveExcelFile, shareFile } = await import('../services/migrate')
    const result = await saveExcelFile(data, filename)
    if (result.platform === 'mobile') {
      setTimeout(async () => {
        await shareFile(result.path, filename)
      }, 500)
    }
    return { ...result, message: `模板已保存到：${result.path}` }
  } catch (_) {}

  // 2. 尝试 Web Share API
  try {
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] })) {
      await navigator.share({
        title: filename,
        files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })]
      })
      return { success: true, filename, platform: 'share' }
    }
  } catch (_) {}

  // 3. 回退到 Blob 下载（Web）
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { success: true, filename, platform: 'web' }
}

/**
 * 生成章节导入模板（含「单元」列）
 */
export async function generateChapterTemplate(chapterInfo) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const headers = ['单元', '问题', '答案', '知识点']

  const data = [
    [`提示：导入到章节「${chapterInfo.name}」的模板，请填写「单元」列指定卡片归属的单元`, '', '', ''],
    headers,
    ['在此输入单元名称', '在此输入问题内容...', '在此输入答案内容...', '在此输入知识点...'],
    ['英语时态', '$E = mc^2$ 是什么公式？', '爱因斯坦质能方程', '相对论'],
    ['英语时态', '勾股定理的表达式？', '$a^2 + b^2 = c^2$', '几何'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 40 }, { wch: 20 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  XLSX.utils.book_append_sheet(wb, ws, chapterInfo.name || '导入模板')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

/**
 * 下载章节导入模板
 */
export async function downloadChapterTemplate(chapterInfo) {
  const data = await generateChapterTemplate(chapterInfo)
  const filename = `${chapterInfo.name || 'chapter'}-章节导入模板.xlsx`

  try {
    const { saveExcelFile, shareFile } = await import('../services/migrate')
    const result = await saveExcelFile(data, filename)
    if (result.platform === 'mobile') {
      setTimeout(async () => {
        await shareFile(result.path, filename)
      }, 500)
    }
    return { ...result, message: `章节模板已保存到：${result.path}` }
  } catch (_) {}

  try {
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] })) {
      await navigator.share({
        title: filename,
        files: [new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })]
      })
      return { success: true, filename, platform: 'share' }
    }
  } catch (_) {}

  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { success: true, filename, platform: 'web' }
}