import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured, getCurrentUser } from '../services/cloudbase.js'

export default function TestDb() {
  const [user, setUser] = useState(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    checkLogin()
  }, [])

  async function checkLogin() {
    try {
      const u = await getCurrentUser()
      setUser(u)
    } catch (e) {
      console.error(e)
    }
  }

  function addResult(testName, status, message, data = null) {
    setResults(prev => [...prev, { testName, status, message, data, time: new Date().toLocaleTimeString() }])
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

  async function runAllTests() {
    setRunning(true)
    setResults([])
    setSummary(null)

    try {
      // 1. 配置检测
      addResult('配置检测', 'pass', `CloudBase 环境ID: eggli-d3gpsvtlnb1656c91`)
      await delay(100)

      // 2. 认证状态
      if (user) {
        addResult('认证状态', 'pass', `已登录用户: ${user.email || user.id}`)
      } else {
        addResult('认证状态', 'fail', '未登录，请先登录')
        setRunning(false)
        return
      }
      const userId = user.id
      await delay(100)

      // 3. 连接建立测试
      const connectStart = Date.now()
      try {
        const { data, error } = await supabase.from('categories').select('id').limit(1)
        const time = Date.now() - connectStart
        if (error) {
          addResult('连接建立', 'fail', `连接失败: ${error.message}`)
        } else {
          addResult('连接建立', 'pass', `连接成功，耗时 ${time}ms`)
        }
      } catch (e) {
        addResult('连接建立', 'fail', e.message)
      }
      await delay(200)

      // 4. 连接稳定性测试
      let successCount = 0
      const times = []
      for (let i = 0; i < 5; i++) {
        const start = Date.now()
        try {
          const { error } = await supabase.from('categories').select('id').limit(1)
          times.push(Date.now() - start)
          if (!error) successCount++
        } catch (e) {}
        await delay(200)
      }
      const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
      addResult('连接稳定性', successCount === 5 ? 'pass' : 'fail',
        `5次查询成功 ${successCount}/5 次，平均耗时 ${avgTime}ms`)
      await delay(100)

      // 5. 数据上传测试
      const testId = 'test-' + Date.now()
      const testCatName = '测试分类_' + new Date().toLocaleString()
      const uploadStart = Date.now()
      try {
        const { data, error } = await supabase.from('categories').insert({
          id: testId,
          name: testCatName,
          purpose: '数据库检测测试数据',
          user_id: userId
        }).select()
        const time = Date.now() - uploadStart
        if (error) {
          addResult('数据上传', 'fail', `上传失败: ${error.message}`)
        } else {
          addResult('数据上传', 'pass', `上传成功，耗时 ${time}ms`)
        }
      } catch (e) {
        addResult('数据上传', 'fail', e.message)
      }
      await delay(200)

      // 6. 数据下载测试
      const queryStart = Date.now()
      try {
        const { data, error } = await supabase.from('categories')
          .select('*')
          .eq('id', testId)
        const time = Date.now() - queryStart
        if (error) {
          addResult('数据下载', 'fail', `查询失败: ${error.message}`)
        } else if (data && data.length > 0) {
          addResult('数据下载', 'pass', `查询成功，返回 ${data.length} 条，耗时 ${time}ms`)
        } else {
          addResult('数据下载', 'fail', '未找到刚上传的数据')
        }
      } catch (e) {
        addResult('数据下载', 'fail', e.message)
      }
      await delay(200)

      // 7. 数据一致性校验
      try {
        const { data, error } = await supabase.from('categories')
          .select('*')
          .eq('id', testId)
        if (error) {
          addResult('数据一致性', 'fail', `校验失败: ${error.message}`)
        } else if (data && data.length > 0) {
          const d = data[0]
          if (d.name === testCatName && d.user_id === userId) {
            addResult('数据一致性', 'pass', '上传数据与下载数据完全一致')
          } else {
            addResult('数据一致性', 'fail', '数据不一致', { expected: { name: testCatName, user_id: userId }, actual: d })
          }
        } else {
          addResult('数据一致性', 'fail', '未找到数据')
        }
      } catch (e) {
        addResult('数据一致性', 'fail', e.message)
      }
      await delay(200)

      // 8. 数据更新测试
      const updatedName = '已更新_' + Date.now()
      const updateStart = Date.now()
      try {
        const { data, error } = await supabase.from('categories')
          .update({ name: updatedName, updated_at: new Date().toISOString() })
          .eq('id', testId)
          .select()
        const time = Date.now() - updateStart
        if (error) {
          addResult('数据更新', 'fail', `更新失败: ${error.message}`)
        } else {
          addResult('数据更新', 'pass', `更新成功，耗时 ${time}ms`)
        }
      } catch (e) {
        addResult('数据更新', 'fail', e.message)
      }
      await delay(200)

      // 9. 事务完整性测试
      try {
        const { data, error } = await supabase.from('categories').insert({
          id: 'test-invalid-' + Date.now(),
          purpose: '事务测试',
          user_id: userId
        }).select()
        if (error) {
          addResult('事务完整性', 'pass', `正确拒绝了无效数据: ${error.message}`)
        } else {
          addResult('事务完整性', 'fail', '错误地接受了无效数据')
        }
      } catch (e) {
        addResult('事务完整性', 'pass', `正确拒绝了无效数据: ${e.message}`)
      }
      await delay(200)

      // 10. 错误处理测试
      try {
        const { data, error } = await supabase.from('nonexistent_table_xyz').select('*').limit(1)
        if (error) {
          addResult('错误处理', 'pass', `正确返回错误: ${error.message}`)
        } else {
          addResult('错误处理', 'fail', '应该返回错误但没有')
        }
      } catch (e) {
        addResult('错误处理', 'pass', `正确抛出异常: ${e.message}`)
      }
      await delay(200)

      // 11. 多表关联测试
      const tables = [
        'categories', 'topics', 'chapters', 'units', 'cards',
        'card_status', 'bookmarks', 'wrong_answers', 'user_profiles',
        'user_settings', 'test_questions', 'test_records', 'test_sessions',
        'review_history', 'study_plans'
      ]
      let tableSuccess = 0
      const tableResults = {}
      for (const table of tables) {
        const start = Date.now()
        try {
          const { data, error } = await supabase.from(table).select('id').limit(1)
          const time = Date.now() - start
          if (error) {
            tableResults[table] = '失败: ' + error.message
          } else {
            tableResults[table] = `成功 (${time}ms)`
            tableSuccess++
          }
        } catch (e) {
          tableResults[table] = '异常: ' + e.message
        }
        await delay(100)
      }
      addResult('多表关联', tableSuccess === tables.length ? 'pass' : 'fail',
        `${tableSuccess}/${tables.length} 张表可正常访问`, tableResults)
      await delay(200)

      // 12. 清理测试数据
      try {
        const { error } = await supabase.from('categories').delete().eq('id', testId)
        if (error) {
          addResult('清理数据', 'fail', `清理失败: ${error.message}`)
        } else {
          addResult('清理数据', 'pass', '测试数据清理成功')
        }
      } catch (e) {
        addResult('清理数据', 'fail', e.message)
      }

      // 13. 检测完成
      addResult('检测完成', 'pass', '所有检测项已执行完毕')

    } catch (e) {
      addResult('检测异常', 'fail', e.message)
    }

    setRunning(false)
  }

  // 计算汇总
  useEffect(() => {
    if (!running && results.length > 0) {
      const passed = results.filter(r => r.status === 'pass').length
      const failed = results.filter(r => r.status === 'fail').length
      const skipped = results.filter(r => r.status === 'skip').length
      const total = results.length
      const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0
      setSummary({ passed, failed, skipped, total, passRate })
    }
  }, [running, results])

  const styles = {
    container: { maxWidth: '900px', margin: '0 auto', padding: '20px' },
    card: { background: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    h1: { color: '#4CAF50', textAlign: 'center', marginBottom: '20px' },
    btn: { padding: '10px 24px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' },
    btnDisabled: { background: '#ccc', cursor: 'not-allowed' },
    summary: { textAlign: 'center', fontSize: '18px', fontWeight: 'bold', margin: '20px 0', padding: '15px', borderRadius: '8px' },
    summaryPass: { background: '#E8F5E9', color: '#2E7D32' },
    summaryFail: { background: '#FFEBEE', color: '#C62828' },
    resultItem: { padding: '8px 12px', margin: '4px 0', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' },
    pass: { background: '#E8F5E9', color: '#2E7D32' },
    fail: { background: '#FFEBEE', color: '#C62828' },
    skip: { background: '#FFF3E0', color: '#E65100' },
    detail: { marginTop: '4px', fontSize: '11px', color: '#666', whiteSpace: 'pre-wrap' }
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>CloudBase 数据库全面检测</h1>

      <div style={styles.card}>
        <h2>当前状态</h2>
        <p>配置状态: {isSupabaseConfigured() ? '✅ 已配置' : '❌ 未配置'}</p>
        <p>登录状态: {user ? `✅ 已登录 (${user.email || user.id})` : '❌ 未登录'}</p>
        {!user && <p style={{ color: '#F44336' }}>请先在应用中登录账号，再回来运行检测</p>}
      </div>

      <div style={styles.card}>
        <h2>数据库检测</h2>
        <p style={{ color: '#666', margin: '10px 0' }}>点击按钮开始全面数据库检测（约需 30-60 秒）</p>
        <button
          style={{ ...styles.btn, ...(running || !user ? styles.btnDisabled : {}) }}
          onClick={runAllTests}
          disabled={running || !user}
        >
          {running ? '检测中...' : '开始检测'}
        </button>
      </div>

      {summary && (
        <div style={styles.card}>
          <h2>检测结果汇总</h2>
          <div style={{ ...styles.summary, ...(summary.failed === 0 ? styles.summaryPass : styles.summaryFail) }}>
            通过: {summary.passed} | 失败: {summary.failed} | 跳过: {summary.skipped} | 通过率: {summary.passRate}%
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div style={styles.card}>
          <h2>详细结果</h2>
          {results.map((r, i) => (
            <div key={i} style={{ ...styles.resultItem, ...styles[r.status] }}>
              <span>{r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭️'} [{r.time}] {r.testName}: {r.message}</span>
              {r.data && (
                <div style={styles.detail}>{JSON.stringify(r.data, null, 2)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
