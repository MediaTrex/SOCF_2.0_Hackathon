import redis from "../../../shared/redis/redis.js"

const HISTORY_PREFIX = "careflow-history"
const CASE_PREFIX = "careflow-case"
const INDEX_KEY = "careflow-case-index"

const DEFAULT_CASE_TTL = 60 * 60 * 24
const DEFAULT_INDEX_TTL = 60 * 60 * 24 * 30
const DEFAULT_INDEX_MAX = 200

// Stores a rolling history of a patient's past cases (stand-in for EHR
// retrieval). Keyed by userId so the Medical History Agent can pull
// "previous records" without a hospital system integration.
export const getPatientHistory = async (userId) => {
  if (!userId) return []
  const key = `${HISTORY_PREFIX}:${userId}`
  const cached = await redis.get(key)
  return cached ? JSON.parse(cached) : []
}

export const savePatientHistory = async (userId, caseSummary) => {
  if (!userId) return
  const key = `${HISTORY_PREFIX}:${userId}`
  const history = await getPatientHistory(userId)

  history.push({
    ...caseSummary,
    savedAt: new Date().toISOString(),
  })

  if (history.length > 10) history.shift()

  await redis.set(key, JSON.stringify(history), "EX", 60 * 60 * 24 * 30)
}

// LangGraph "checkpoint" for a single case run — lets the frontend poll or
// reload a case's full agent timeline + final report.
export const getCaseState = async (caseId) => {
  if (!caseId) return null
  const cached = await redis.get(`${CASE_PREFIX}:${caseId}`)
  return cached ? JSON.parse(cached) : null
}

export const saveCaseState = async (caseId, state, ttlSec = DEFAULT_CASE_TTL) => {
  if (!caseId) return
  await redis.set(
    `${CASE_PREFIX}:${caseId}`,
    JSON.stringify(state),
    "EX",
    ttlSec
  )
}

// Lightweight global index of recent cases so the Doctor Dashboard can
// list cases across all patients without scanning every Redis key.
export const addCaseToIndex = async (
  summary,
  { max = DEFAULT_INDEX_MAX, ttlSec = DEFAULT_INDEX_TTL } = {}
) => {
  const raw = await redis.get(INDEX_KEY)
  const index = raw ? JSON.parse(raw) : []

  index.unshift(summary)
  while (index.length > max) index.pop()

  await redis.set(INDEX_KEY, JSON.stringify(index), "EX", ttlSec)
}

export const updateCaseInIndex = async (caseId, patch) => {
  const raw = await redis.get(INDEX_KEY)
  const index = raw ? JSON.parse(raw) : []
  const i = index.findIndex((c) => c.caseId === caseId)
  if (i === -1) return null
  index[i] = { ...index[i], ...patch }
  await redis.set(INDEX_KEY, JSON.stringify(index), "EX", DEFAULT_INDEX_TTL)
  return index[i]
}

export const getCaseIndex = async () => {
  const raw = await redis.get(INDEX_KEY)
  return raw ? JSON.parse(raw) : []
}

export const clearCaseIndex = async () => {
  await redis.del(INDEX_KEY)
}
