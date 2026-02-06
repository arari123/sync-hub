import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Database,
  FileSearch,
  FileWarning,
  Loader2,
  Search,
  Server,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import './App.css'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const POLLING_INTERVAL_MS = 2500
const HEALTH_POLLING_INTERVAL_MS = 7000
const TERMINAL_STATUSES = new Set(['completed', 'failed'])
const DEPENDENCY_LABELS = {
  db: 'Database',
  elasticsearch: 'Elasticsearch',
  ocr_worker: 'OCR Worker',
}

const STATUS_META = {
  uploading: { label: '업로드 중', className: 'status-uploading' },
  pending: { label: '대기 중', className: 'status-pending' },
  processing: { label: '처리 중', className: 'status-processing' },
  completed: { label: '완료', className: 'status-completed' },
  failed: { label: '실패', className: 'status-failed' },
}

function getErrorMessage(error, fallbackMessage) {
  return error?.response?.data?.detail || fallbackMessage
}

function formatScore(score) {
  if (typeof score !== 'number') {
    return '-'
  }
  return score.toFixed(3)
}

function getStatusMeta(status) {
  return STATUS_META[status] || { label: status || 'unknown', className: 'status-default' }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tokenizeQuery(value) {
  const seen = new Set()
  return (value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const lowered = token.toLowerCase()
      if (seen.has(lowered)) {
        return false
      }
      seen.add(lowered)
      return true
    })
    .sort((left, right) => right.length - left.length)
}

function renderHighlightedText(text, query) {
  const source = text || ''
  if (!source) {
    return source
  }

  const tokens = tokenizeQuery(query)
  if (!tokens.length) {
    return source
  }

  const matcher = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join('|')})`, 'gi')
  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()))

  return source.split(matcher).map((part, index) => {
    if (tokenSet.has(part.toLowerCase())) {
      return (
        <mark key={`mark-${index}`} className="match-highlight">
          {part}
        </mark>
      )
    }
    return <span key={`text-${index}`}>{part}</span>
  })
}

function getHealthTone(status, healthy) {
  if (status === 'healthy' || healthy) {
    return 'health-good'
  }
  if (status === 'degraded') {
    return 'health-warn'
  }
  return 'health-bad'
}

function asDependencyArray(dependencies) {
  return Object.entries(dependencies || {}).map(([key, value]) => ({
    key,
    label: DEPENDENCY_LABELS[key] || key,
    healthy: Boolean(value?.healthy),
    required: Boolean(value?.required),
    mode: value?.mode || '',
    error: value?.error || '',
  }))
}

function App() {
  const fileInputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selectedResult, setSelectedResult] = useState(null)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploadJobs, setUploadJobs] = useState([])
  const [healthStatus, setHealthStatus] = useState('unknown')
  const [healthDependencies, setHealthDependencies] = useState([])
  const [healthError, setHealthError] = useState('')
  const [isLoadingHealth, setIsLoadingHealth] = useState(false)

  const runSearch = async (nextQuery) => {
    const keyword = nextQuery.trim()
    if (!keyword) {
      setResults([])
      setSelectedResult(null)
      setSelectedDoc(null)
      setSearchError('')
      return
    }

    setIsSearching(true)
    setSearchError('')

    try {
      const response = await axios.get(`${API_BASE_URL}/documents/search`, {
        params: { q: keyword, limit: 10 },
      })

      const nextResults = Array.isArray(response.data) ? response.data : []
      setResults(nextResults)
      if (!nextResults.length) {
        setSelectedResult(null)
        setSelectedDoc(null)
      }
    } catch (error) {
      setResults([])
      setSelectedResult(null)
      setSelectedDoc(null)
      setSearchError(getErrorMessage(error, '검색 요청에 실패했습니다.'))
    } finally {
      setIsSearching(false)
    }
  }

  const loadDocumentDetails = async (docId) => {
    setIsLoadingDetails(true)
    setDetailError('')

    try {
      const response = await axios.get(`${API_BASE_URL}/documents/${docId}`)
      setSelectedDoc(response.data)
    } catch (error) {
      setSelectedDoc(null)
      setDetailError(getErrorMessage(error, '문서 상세 정보를 불러오지 못했습니다.'))
    } finally {
      setIsLoadingDetails(false)
    }
  }

  const handleResultClick = (result) => {
    setSelectedResult(result)
    void loadDocumentDetails(result.doc_id)
  }

  const loadHealthDetails = useCallback(async () => {
    setIsLoadingHealth(true)
    setHealthError('')

    try {
      const response = await axios.get(`${API_BASE_URL}/health/detail`)
      const payload = response.data || {}
      setHealthStatus(payload.status || 'unknown')
      setHealthDependencies(asDependencyArray(payload.dependencies))
    } catch (error) {
      setHealthStatus('unknown')
      setHealthDependencies([])
      setHealthError(getErrorMessage(error, '운영 상태를 가져오지 못했습니다.'))
    } finally {
      setIsLoadingHealth(false)
    }
  }, [])

  const updateUploadJob = (id, updater) => {
    setUploadJobs((previousJobs) =>
      previousJobs.map((job) => (job.id === id ? updater(job) : job)),
    )
  }

  const uploadFile = async (file) => {
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('PDF 파일만 업로드할 수 있습니다.')
      return
    }

    const temporaryId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const createdAt = new Date().toISOString()

    setUploadError('')
    setUploadJobs((previousJobs) => [
      {
        id: temporaryId,
        filename: file.name,
        status: 'uploading',
        createdAt,
      },
      ...previousJobs,
    ])

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`${API_BASE_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setUploadJobs((previousJobs) =>
        previousJobs.map((job) =>
          job.id === temporaryId
            ? {
                ...job,
                id: response.data.id,
                status: response.data.status || 'pending',
              }
            : job,
        ),
      )
    } catch (error) {
      updateUploadJob(temporaryId, (job) => ({
        ...job,
        status: 'failed',
        error: getErrorMessage(error, '업로드에 실패했습니다.'),
      }))
      setUploadError(getErrorMessage(error, '파일 업로드를 진행할 수 없습니다.'))
    }
  }

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    void runSearch(query)
  }

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0]
    void uploadFile(file)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer.files?.[0]
    void uploadFile(file)
  }

  useEffect(() => {
    const activeJobs = uploadJobs.filter(
      (job) => typeof job.id === 'number' && !TERMINAL_STATUSES.has(job.status),
    )

    if (!activeJobs.length) {
      return undefined
    }

    const pollStatuses = async () => {
      const responses = await Promise.allSettled(
        activeJobs.map(async (job) => {
          const response = await axios.get(`${API_BASE_URL}/documents/${job.id}`)
          return { id: job.id, payload: response.data }
        }),
      )

      const nextById = new Map()
      responses.forEach((result) => {
        if (result.status === 'fulfilled') {
          nextById.set(result.value.id, result.value.payload)
        }
      })

      if (!nextById.size) {
        return
      }

      setUploadJobs((previousJobs) => {
        let changed = false

        const nextJobs = previousJobs.map((job) => {
          const nextItem = nextById.get(job.id)
          if (!nextItem) {
            return job
          }

          const nextStatus = nextItem.status || job.status
          const nextPath = nextItem.file_path || job.filePath
          const nextCreatedAt = nextItem.created_at || job.createdAt

          if (
            nextStatus === job.status &&
            nextPath === job.filePath &&
            nextCreatedAt === job.createdAt
          ) {
            return job
          }

          changed = true
          return {
            ...job,
            status: nextStatus,
            filePath: nextPath,
            createdAt: nextCreatedAt,
          }
        })

        return changed ? nextJobs : previousJobs
      })
    }

    void pollStatuses()
    const intervalId = window.setInterval(() => {
      void pollStatuses()
    }, POLLING_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [uploadJobs])

  useEffect(() => {
    void loadHealthDetails()
    const intervalId = window.setInterval(() => {
      void loadHealthDetails()
    }, HEALTH_POLLING_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [loadHealthDetails])

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="app-main">
        <section className="glass-panel hero-panel">
          <p className="hero-eyebrow">Knowledge Retrieval Workspace</p>
          <h1>Sync-Hub Search Console</h1>
          <p className="hero-description">
            PDF 문서를 업로드하고 자연어 질의로 사내 지식을 빠르게 찾으세요.
          </p>

          <form className="search-form" onSubmit={handleSearchSubmit}>
            <Search size={20} className="search-icon" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 온보딩 체크리스트와 보안 정책"
              className="search-input"
            />
            <button type="submit" className="search-button" disabled={isSearching}>
              {isSearching ? <Loader2 size={18} className="spin" /> : '검색'}
            </button>
          </form>

          {searchError ? <p className="feedback error">{searchError}</p> : null}
        </section>

        <section className="workspace-grid">
          <article className="glass-panel results-panel">
            <div className="panel-header">
              <h2>검색 결과</h2>
              <span>{results.length}건</span>
            </div>

            {isSearching ? (
              <div className="inline-loader">
                <Loader2 className="spin" size={20} />
                <span>검색 중입니다...</span>
              </div>
            ) : null}

            {!isSearching && query.trim() && !results.length ? (
              <p className="empty-state">검색 결과가 없습니다. 검색어를 바꿔보세요.</p>
            ) : null}

            {!isSearching && !query.trim() ? (
              <p className="empty-state">질문을 입력하면 관련 문서가 여기에 표시됩니다.</p>
            ) : null}

            <div className="results-list">
              {results.map((result) => {
                const isActive = selectedResult?.doc_id === result.doc_id
                const summaryText = result.summary || ''
                const snippetText = result.snippet || '스니펫이 없습니다.'
                const showSnippet = !summaryText || summaryText !== snippetText
                const evidenceList = Array.isArray(result.evidence) ? result.evidence : []
                const matchPoints = Array.isArray(result.match_points) ? result.match_points : []

                return (
                  <button
                    key={`${result.doc_id}-${result.filename}`}
                    type="button"
                    className={`result-card ${isActive ? 'active' : ''}`}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="result-title-row">
                      <h3>{result.filename}</h3>
                      <span>#{result.doc_id}</span>
                    </div>
                    {summaryText ? (
                      <p className="result-summary">{renderHighlightedText(summaryText, query)}</p>
                    ) : null}
                    {showSnippet ? <p>{renderHighlightedText(snippetText, query)}</p> : null}
                    {evidenceList.length ? (
                      <ul className="result-evidence-list">
                        {evidenceList.slice(0, 2).map((sentence, index) => (
                          <li key={`${result.doc_id}-evidence-${index}`}>
                            {renderHighlightedText(sentence, query)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {matchPoints.length ? (
                      <div className="match-points">
                        {matchPoints.slice(0, 5).map((point) => (
                          <span key={`${result.doc_id}-point-${point}`} className="match-point-chip">
                            {point}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <strong>
                      Score {formatScore(result.score)}
                      {typeof result.raw_score === 'number' ? ` · Raw ${formatScore(result.raw_score)}` : ''}
                    </strong>
                  </button>
                )
              })}
            </div>
          </article>

          <aside className="side-column">
            <section className="glass-panel health-panel">
              <div className="panel-header">
                <h2>운영 상태</h2>
                <button type="button" className="ghost-button" onClick={() => void loadHealthDetails()}>
                  새로고침
                </button>
              </div>

              <div className={`health-summary ${getHealthTone(healthStatus, false)}`}>
                <div className="health-summary-left">
                  {healthStatus === 'healthy' ? <ShieldCheck size={17} /> : <ShieldX size={17} />}
                  <strong>{healthStatus.toUpperCase()}</strong>
                </div>
                {isLoadingHealth ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
              </div>

              {healthError ? <p className="feedback error">{healthError}</p> : null}

              <ul className="health-list">
                {healthDependencies.length ? (
                  healthDependencies.map((dependency) => (
                    <li
                      key={dependency.key}
                      className={`health-item ${getHealthTone('', dependency.healthy)}`}
                    >
                      <div className="health-item-top">
                        <div className="health-item-name">
                          {dependency.key === 'db' ? <Database size={14} /> : null}
                          {dependency.key === 'elasticsearch' ? <Server size={14} /> : null}
                          {dependency.key === 'ocr_worker' ? <Activity size={14} /> : null}
                          <span>{dependency.label}</span>
                        </div>
                        <span className="health-chip">
                          {dependency.healthy ? 'healthy' : 'unhealthy'}
                        </span>
                      </div>
                      <div className="health-item-meta">
                        {dependency.required ? <span>필수</span> : <span>선택</span>}
                        {dependency.mode ? <span>mode: {dependency.mode}</span> : null}
                        {dependency.error ? <span>{dependency.error}</span> : null}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">상태 데이터를 불러오는 중입니다.</li>
                )}
              </ul>
            </section>

            <section className="glass-panel details-panel">
              <div className="panel-header">
                <h2>문서 상세</h2>
              </div>

              {isLoadingDetails ? (
                <div className="inline-loader">
                  <Loader2 className="spin" size={18} />
                  <span>문서 정보를 가져오는 중...</span>
                </div>
              ) : null}

              {detailError ? <p className="feedback error">{detailError}</p> : null}

              {!isLoadingDetails && !selectedResult ? (
                <p className="empty-state">검색 결과 카드를 선택하면 상세 정보가 보입니다.</p>
              ) : null}

              {selectedResult ? (
                <div className="detail-fields">
                  <div>
                    <span>문서명</span>
                    <p>{selectedResult.filename}</p>
                  </div>
                  <div>
                    <span>문서 ID</span>
                    <p>{selectedResult.doc_id}</p>
                  </div>
                  <div>
                    <span>검색 점수</span>
                    <p>{formatScore(selectedResult.score)}</p>
                  </div>
                  <div>
                    <span>파일 경로</span>
                    <p>{selectedDoc?.file_path || '아직 확인되지 않았습니다.'}</p>
                  </div>
                  <div>
                    <span>처리 상태</span>
                    <p>{getStatusMeta(selectedDoc?.status).label}</p>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="glass-panel upload-panel">
              <div className="panel-header">
                <h2>PDF 업로드</h2>
              </div>

              <button
                type="button"
                className={`dropzone ${isDragOver ? 'dragover' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <UploadCloud size={24} />
                <strong>드래그 앤 드롭 또는 클릭</strong>
                <span>PDF 파일만 지원합니다.</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                hidden
                onChange={handleFileInputChange}
              />

              {uploadError ? <p className="feedback error">{uploadError}</p> : null}

              <ul className="upload-list">
                {uploadJobs.length ? (
                  uploadJobs.map((job) => {
                    const statusMeta = getStatusMeta(job.status)

                    return (
                      <li key={job.id} className="upload-item">
                        <div className="upload-item-top">
                          <p title={job.filename}>{job.filename}</p>
                          <span className={`status-chip ${statusMeta.className}`}>{statusMeta.label}</span>
                        </div>
                        <div className="upload-item-bottom">
                          {job.status === 'completed' ? <CheckCircle2 size={14} /> : null}
                          {job.status === 'processing' ? <CircleDashed size={14} className="spin" /> : null}
                          {job.status === 'failed' ? <FileWarning size={14} /> : null}
                          {job.status === 'pending' ? <FileSearch size={14} /> : null}
                          {job.filePath ? <span>{job.filePath}</span> : null}
                          {!job.filePath && job.error ? <span>{job.error}</span> : null}
                          {!job.filePath && !job.error ? <span>상태를 확인하는 중...</span> : null}
                        </div>
                      </li>
                    )
                  })
                ) : (
                  <li className="empty-state">업로드한 문서가 없습니다.</li>
                )}
              </ul>
            </section>
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
