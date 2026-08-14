import crypto from "crypto"
import { careflowGraph } from "../graph/careflow.graph.js"
import {
  getCaseState,
  saveCaseState,
  savePatientHistory,
  addCaseToIndex,
  getCaseIndex,
  updateCaseInIndex,
} from "../config/careflowMemory.js"
import {
  generateNarrative,
  generateJson,
  analyzeDocument,
} from "../services/aiService.js"
import { seedMockPatientsIfEmpty, seedMockPatients } from "../data/mockPatients.js"

const STAFF = [
  { id: "dr-mehta", name: "Dr. Ananya Mehta" },
  { id: "dr-rao", name: "Dr. Vikram Rao" },
  { id: "dr-chen", name: "Dr. Lisa Chen" },
  { id: "dr-anubappal", name: "Dr. Anubappal" },
  { id: "sp-iyer", name: "Dr. Meera Iyer" },
]

const emptyClinical = () => ({
  assignedDoctor: null,
  description: "",
  labs: [],
  prescriptions: [],
  nextFollowUpDate: null,
  uploadedReports: [],
  autopsyEstimate: null,
  aiNarrative: "",
  aiConfidence: null,
})

const shapeResponse = (caseId, result) => {
  const clinical = result?.clinical || emptyClinical()
  return {
    caseId,
    patientName:
      result?.patientName ||
      result?.structured_case?.patient_information?.name ||
      result?.patient_information?.name ||
      "Unknown patient",
    createdAt: result?.createdAt || null,
    photoUrl: result?.photoUrl || null,
    photoSource: result?.photoSource || null,
    patientId: result?.patientId || null,
    assignedDoctor: clinical.assignedDoctor,
    description: clinical.description || result?.patient_summary || "",
    urgency:
      result?.urgency ||
      result?.final_report?.overall_urgency ||
      result?.diagnosis?.urgency ||
      "routine",
    requires_human_review:
      result?.requires_human_review ??
      result?.final_report?.requires_human_review ??
      true,
    topDiagnosis:
      result?.topDiagnosis ||
      result?.diagnosis?.possible_diagnoses?.[0]?.condition ||
      "N/A",
    labs: clinical.labs || [],
    prescriptions: clinical.prescriptions || [],
    nextFollowUpDate: clinical.nextFollowUpDate,
    uploadedReports: clinical.uploadedReports || [],
    autopsyEstimate: null, // never shown on patient cases — use /death page
    aiNarrative:
      clinical.aiNarrative === null
        ? null
        : clinical.aiNarrative ||
          result?.patient_summary ||
          result?.doctor_notes ||
          "",
    aiConfidence:
      clinical.aiConfidence === null
        ? null
        : clinical.aiConfidence ??
          (typeof result?.confidence_score === "number"
            ? Math.round(result.confidence_score * 100)
            : null),
    timeline: result?.timeline,
    current_stage: result?.current_stage || deriveCurrentStage(result?.timeline),
    structured_case: result?.structured_case,
    medical_history: result?.medical_history,
    diagnosis: result?.diagnosis,
    confidence_score: result?.confidence_score,
    medications: result?.medications,
    interaction_warnings: result?.interaction_warnings,
    insurance_summary: result?.insurance_summary,
    followup_plan: result?.followup_plan,
    conflicts: result?.conflicts,
    reasoning_trace: result?.reasoning_trace,
    doctor_notes: result?.doctor_notes,
    patient_summary: result?.patient_summary,
    final_report: result?.final_report,
  }
}

const deriveCurrentStage = (timeline) => {
  if (!Array.isArray(timeline) || timeline.length === 0) return "Intake Agent"
  const incomplete = timeline.find((step) => step.status !== "completed")
  return incomplete?.agent || timeline[timeline.length - 1].agent
}

const ensureClinical = (state) => {
  if (!state.clinical) state.clinical = emptyClinical()
  return state
}

export const listStaff = async (_req, res) => {
  res.json({ staff: STAFF })
}

/** Stateless live preview while clinician types/speaks — no DB write. */
export const analyzePreview = async (req, res, next) => {
  try {
    const { description } = req.body
    if (!description || String(description).trim().length < 15) {
      return res.json({
        narrative: null,
        confidence: null,
        suggestedUrgency: null,
        urgencyReason: null,
      })
    }

    const system = `You are analyzing a hospital intake description while a clinician is still typing/speaking it. Return ONLY JSON:
{"narrative": "1-2 sentence draft summary", "confidence": 0-100 (how complete/specific the description is so far),
"suggestedUrgency": "routine"|"urgent"|"emergency"|null, "urgencyReason": "short phrase, only if suggestedUrgency is not null"}.
Only suggest emergency/urgent if the text contains a clear red-flag symptom (e.g. chest pain, difficulty breathing, severe bleeding, unconsciousness, stroke signs). Otherwise suggestedUrgency should be null — don't over-flag.`

    const { data, demo, parseError } = await generateJson({
      prompt: description,
      system,
      maxTokens: 200,
    })

    if (demo || parseError || !data) {
      return res.json(heuristicPreview(description))
    }

    return res.json({
      narrative: data.narrative || null,
      confidence:
        typeof data.confidence === "number" ? data.confidence : null,
      suggestedUrgency: data.suggestedUrgency ?? null,
      urgencyReason: data.urgencyReason || null,
    })
  } catch (error) {
    next(error)
  }
}

function heuristicPreview(description) {
  const text = String(description).toLowerCase()
  let suggestedUrgency = null
  let urgencyReason = null
  if (
    /chest pain|heart attack|difficulty breathing|can't breathe|unconscious|severe bleeding|stroke|seizure/.test(
      text
    )
  ) {
    suggestedUrgency = "emergency"
    urgencyReason = "red-flag symptoms in the description"
  } else if (/fever|severe pain|vomiting blood|allergic|anaphylaxis/.test(text)) {
    suggestedUrgency = "urgent"
    urgencyReason = "symptoms that may need prompt review"
  }
  const confidence = Math.min(
    92,
    28 + Math.floor(String(description).trim().length / 3)
  )
  return {
    narrative: `Draft: ${String(description).trim().slice(0, 160)}${
      description.length > 160 ? "…" : ""
    }`,
    confidence,
    suggestedUrgency,
    urgencyReason,
  }
}

/** Fuzzy name match against existing cases (returning-patient detection). */
export const matchPatients = async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name || String(name).trim().length < 2) {
      return res.json({ candidates: [] })
    }

    const needle = String(name).trim().toLowerCase()
    const first = needle.split(/\s+/)[0]
    const cases = await getCaseIndex()

    const byPatient = new Map()
    for (const c of cases) {
      const pName = (c.patientName || "").trim()
      if (!pName) continue
      const lower = pName.toLowerCase()
      const score =
        lower === needle
          ? 3
          : lower.startsWith(first) || lower.includes(needle)
            ? 2
            : lower.split(/\s+/).some((w) => w.startsWith(first) && first.length >= 3)
              ? 1
              : 0
      if (score === 0) continue
      const key = lower
      const prev = byPatient.get(key)
      if (!prev || new Date(c.createdAt) > new Date(prev.lastVisit)) {
        byPatient.set(key, {
          id: c.caseId,
          patientId: key,
          name: pName,
          lastVisit: c.createdAt,
          age: c.age ?? null,
          gender: c.gender ?? null,
          photoUrl: c.photoUrl || null,
          score,
        })
      }
    }

    // Enrich age/gender from case state when possible
    const ranked = [...byPatient.values()]
      .sort((a, b) => b.score - a.score || new Date(b.lastVisit) - new Date(a.lastVisit))
      .slice(0, 3)

    for (const cand of ranked) {
      const state = await getCaseState(cand.id)
      if (state?.patient_information) {
        cand.age = state.patient_information.age ?? cand.age
        cand.gender = state.patient_information.gender ?? cand.gender
      }
    }

    return res.json({ candidates: ranked })
  } catch (error) {
    next(error)
  }
}

export const createCase = async (req, res, next) => {
  try {
    const userId = req.headers["x-user-id"] || "demo-user"
    const {
      patient_information,
      patientName: bodyPatientName,
      age,
      gender,
      symptoms,
      allergies,
      medical_history_input,
      current_medications,
      insurance_provider,
      policy_number,
      description,
      assignedDoctor,
      urgency: bodyUrgency,
      runPipeline = true,
      fastIntake = false,
      photoUrl,
      photoSource,
      patientId,
    } = req.body

    const patient_information_resolved = patient_information || {
      name: bodyPatientName,
      age,
      gender,
    }

    const caseId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    let result = {}

    const shouldRunPipeline = runPipeline !== false && !fastIntake

    if (shouldRunPipeline) {
      result = await careflowGraph.invoke({
        userId,
        caseId,
        patient_information: patient_information_resolved,
        symptoms,
        allergies,
        medical_history_input,
        current_medications,
        insurance_provider,
        policy_number,
      })

      await savePatientHistory(userId, {
        caseId,
        symptoms: result?.structured_case?.symptoms,
        diagnosis: result?.diagnosis?.possible_diagnoses,
        chronic_diseases: result?.medical_history?.chronic_diseases,
        medications: result?.medications,
      })
    }

    // Fast intake: return immediately with null AI fields; enrich async
    const aiNarrative = fastIntake
      ? null
      : result?.patient_summary || ""
    const aiConfidence = fastIntake
      ? null
      : typeof result?.confidence_score === "number"
        ? Math.round(result.confidence_score * 100)
        : shouldRunPipeline
          ? 70
          : null

    const state = {
      ...result,
      caseId,
      createdAt,
      patientName:
        patient_information_resolved?.name ||
        bodyPatientName ||
        "Unknown patient",
      patient_information: patient_information_resolved,
      urgency:
        bodyUrgency ||
        result?.final_report?.overall_urgency ||
        result?.diagnosis?.urgency ||
        "routine",
      requires_human_review:
        result?.final_report?.requires_human_review ?? true,
      topDiagnosis:
        result?.diagnosis?.possible_diagnoses?.[0]?.condition || "N/A",
      current_stage: deriveCurrentStage(result?.timeline),
      photoUrl: photoUrl || null,
      photoSource: photoSource || (photoUrl ? "upload" : null),
      patientId: patientId || null,
      clinical: {
        ...emptyClinical(),
        description: description || medical_history_input || "",
        assignedDoctor: assignedDoctor || null,
        aiNarrative,
        aiConfidence,
        nextFollowUpDate: null,
      },
    }

    await saveCaseState(caseId, state)

    await addCaseToIndex({
      caseId,
      patientName: state.patientName,
      urgency: state.urgency,
      requires_human_review: state.requires_human_review,
      topDiagnosis: state.topDiagnosis,
      confidence_score: result?.confidence_score,
      timeline: result?.timeline || [],
      current_stage: state.current_stage,
      assignedDoctor: state.clinical.assignedDoctor,
      nextFollowUpDate: state.clinical.nextFollowUpDate,
      description: state.clinical.description,
      aiNarrative: state.clinical.aiNarrative,
      aiConfidence: state.clinical.aiConfidence,
      photoUrl: state.photoUrl,
      photoSource: state.photoSource,
      createdAt,
    })

    // Fire-and-forget intake narrative (completeness score, not diagnosis certainty)
    if (fastIntake) {
      enrichIntakeNarrative(caseId).catch((err) =>
        console.log("async intake narrative failed", err.message)
      )
    }

    return res.status(200).json(shapeResponse(caseId, state))
  } catch (error) {
    next(error)
  }
}

async function enrichIntakeNarrative(caseId) {
  const state = await getCaseState(caseId)
  if (!state) return
  ensureClinical(state)

  const prompt = `Patient: ${state.patientName}
Age: ${state.patient_information?.age || "n/a"}
Gender: ${state.patient_information?.gender || "n/a"}
Description: ${state.clinical.description || "n/a"}
Urgency: ${state.urgency}`

  const system = `Given this patient intake description, write a concise 2–3 sentence clinical narrative summarizing the presenting case, and give a confidence score (0–100) reflecting how complete/specific the intake description is — not a diagnostic certainty score. Return ONLY JSON: {"narrative":string,"confidence":number}.`

  const { data, narrative, parseError, demo } = await generateJson({
    prompt,
    system,
  })

  if (demo) {
    const desc = (state.clinical.description || "").trim()
    state.clinical.aiNarrative = desc
      ? `Intake for ${state.patientName}: ${desc.slice(0, 180)}${desc.length > 180 ? "…" : ""}`
      : `Intake recorded for ${state.patientName}. Add more clinical detail to improve completeness.`
    state.clinical.aiConfidence = desc.length > 80 ? 72 : desc.length > 20 ? 55 : 35
  } else if (parseError || !data) {
    state.clinical.aiNarrative =
      narrative ||
      `Intake recorded for ${state.patientName}. Review description for completeness.`
    state.clinical.aiConfidence = 45
  } else {
    state.clinical.aiNarrative = data.narrative || narrative
    state.clinical.aiConfidence = Number(data.confidence) || 50
  }

  await saveCaseState(caseId, state)
  await updateCaseInIndex(caseId, {
    aiNarrative: state.clinical.aiNarrative,
    aiConfidence: state.clinical.aiConfidence,
    description: state.clinical.description,
  })
}

export const getCase = async (req, res, next) => {
  try {
    const { caseId } = req.params
    const state = await getCaseState(caseId)
    if (!state) {
      return res.status(404).json({ message: "Case not found or expired." })
    }
    return res.status(200).json(shapeResponse(caseId, ensureClinical(state)))
  } catch (error) {
    next(error)
  }
}

export const listCases = async (req, res, next) => {
  try {
    await seedMockPatientsIfEmpty()
    const cases = await getCaseIndex()
    return res.status(200).json({ cases })
  } catch (error) {
    next(error)
  }
}

export const seedDemoPatients = async (req, res, next) => {
  try {
    const replace = req.body?.replace !== false
    const result = await seedMockPatients({ replace })
    const cases = await getCaseIndex()
    return res.status(200).json({ ...result, cases })
  } catch (error) {
    next(error)
  }
}

export const patchCase = async (req, res, next) => {
  try {
    const { caseId } = req.params
    const state = await getCaseState(caseId)
    if (!state) {
      return res.status(404).json({ message: "Case not found or expired." })
    }
    ensureClinical(state)

    const {
      assignedDoctor,
      description,
      labs,
      prescriptions,
      nextFollowUpDate,
      urgency,
      requires_human_review,
      patientName,
      photoUrl,
      photoSource,
    } = req.body

    if (assignedDoctor !== undefined) state.clinical.assignedDoctor = assignedDoctor
    if (description !== undefined) state.clinical.description = description
    if (labs !== undefined) state.clinical.labs = labs
    if (prescriptions !== undefined) state.clinical.prescriptions = prescriptions
    if (nextFollowUpDate !== undefined) state.clinical.nextFollowUpDate = nextFollowUpDate
    if (urgency !== undefined) state.urgency = urgency
    if (requires_human_review !== undefined) state.requires_human_review = requires_human_review
    if (patientName !== undefined) state.patientName = patientName
    if (photoUrl !== undefined) state.photoUrl = photoUrl
    if (photoSource !== undefined) state.photoSource = photoSource

    await saveCaseState(caseId, state)
    await updateCaseInIndex(caseId, {
      patientName: state.patientName,
      urgency: state.urgency,
      requires_human_review: state.requires_human_review,
      assignedDoctor: state.clinical.assignedDoctor,
      nextFollowUpDate: state.clinical.nextFollowUpDate,
      topDiagnosis: state.topDiagnosis,
      photoUrl: state.photoUrl,
      photoSource: state.photoSource,
      description: state.clinical.description,
      aiNarrative: state.clinical.aiNarrative,
      aiConfidence: state.clinical.aiConfidence,
    })

    return res.status(200).json(shapeResponse(caseId, state))
  } catch (error) {
    next(error)
  }
}

export const voiceIntake = async (req, res, next) => {
  try {
    const { transcript } = req.body
    if (!transcript?.trim()) {
      return res.status(400).json({ message: "transcript is required" })
    }

    const system = `You are extracting structured intake data from a clinician's spoken description of a patient. Return ONLY JSON matching this schema: {"patientName":string,"symptoms":string[],"urgency":"routine"|"urgent"|"emergency","description":string}. If a field isn't mentioned, omit it — do not guess patient identity details that weren't said.`

    const { data, narrative, parseError } = await generateJson({
      prompt: transcript,
      system,
    })

    if (parseError || !data) {
      return res.status(200).json({
        fields: {},
        requires_human_review: true,
        message:
          "Could not parse structured fields — please complete the form manually.",
        raw: narrative,
      })
    }

    return res.status(200).json({
      fields: data,
      requires_human_review: false,
    })
  } catch (error) {
    next(error)
  }
}

export const uploadReport = async (req, res, next) => {
  try {
    const { caseId } = req.params
    const state = await getCaseState(caseId)
    if (!state) {
      return res.status(404).json({ message: "Case not found or expired." })
    }
    ensureClinical(state)

    if (!req.file) {
      return res.status(400).json({ message: "file is required" })
    }

    const type = req.body.type || "diagnosis"
    const fileId = crypto.randomUUID()
    const base64 = req.file.buffer.toString("base64")
    const isPdf = req.file.mimetype === "application/pdf"
    const mediaType = req.file.mimetype || "image/jpeg"

    let aiNarrative = ""
    let aiConfidence = 55
    let extractedFields = {}
    let requiresReview = false

    if (type === "prescription") {
      const system = `Extract drug name, dose, and frequency from this prescription image. Return ONLY JSON: {"items":[{"drug":string,"dose":string,"frequency":string}],"narrative":string,"confidence":number}. If illegible, return {"items":[],"narrative":"...","confidence":0}. confidence is 0-100.`
      const { text, demo } = await analyzeDocument({
        prompt: "Extract prescription details as specified.",
        system,
        mediaBase64: base64,
        mediaType,
        isPdf,
        fileName: req.file.originalname,
        typeHint: "prescription",
      })
      try {
        const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
        const parsed = JSON.parse(cleaned)
        extractedFields = { items: parsed.items || [] }
        aiNarrative = parsed.narrative || text
        aiConfidence = Number(parsed.confidence) || (demo ? 48 : 50)
        requiresReview = true
      } catch {
        requiresReview = true
        aiNarrative = text || "Could not parse prescription."
        aiConfidence = 30
      }
    } else {
      const system = `You are reading a hospital ${type} report for clinical staff. Return ONLY JSON: {"narrative":string,"confidence":number,"extractedFields":object}. confidence is 0-100. Be cautious; do not invent lab values.`
      const { text, demo } = await analyzeDocument({
        prompt: `Analyze this ${type} report and return JSON as specified.`,
        system,
        mediaBase64: base64,
        mediaType,
        isPdf,
        fileName: req.file.originalname,
        typeHint: type,
      })
      try {
        const cleaned = text.replace(/```json\n?|\n?```/g, "").trim()
        const parsed = JSON.parse(cleaned)
        aiNarrative = parsed.narrative || text
        aiConfidence = Number(parsed.confidence) || (demo ? 52 : 50)
        extractedFields = parsed.extractedFields || {}
        if (demo) requiresReview = true
      } catch {
        requiresReview = true
        aiNarrative = text || "Analysis incomplete."
        aiConfidence = 35
      }
    }

    const report = {
      fileId,
      fileName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      type,
      aiNarrative,
      aiConfidence,
      extractedFields,
    }
    state.clinical.uploadedReports.push(report)

    // Time-of-death / autopsy estimates belong on the Death Organization page only —
    // never attach them to living patient cases from pathology uploads here.

    if (requiresReview) state.requires_human_review = true
    if (!state.clinical.aiNarrative) {
      state.clinical.aiNarrative = aiNarrative
      state.clinical.aiConfidence = aiConfidence
    }

    // Clear any legacy autopsy field so patient views stay clean
    state.clinical.autopsyEstimate = null

    await saveCaseState(caseId, state)
    await updateCaseInIndex(caseId, {
      requires_human_review: state.requires_human_review,
    })

    return res.status(200).json({
      report,
      prescriptions: state.clinical.prescriptions,
      case: shapeResponse(caseId, state),
    })
  } catch (error) {
    next(error)
  }
}

/** Death Organization — standalone TOD estimate (not tied to patient case records). */
export const deathEstimate = async (req, res, next) => {
  try {
    const { notes, decedentName } = req.body
    const text = String(notes || "").trim()
    if (text.length < 10) {
      return res.status(400).json({ message: "Provide pathology/lab notes (min 10 chars)." })
    }

    const system = `Given the uploaded pathology/lab data summary below, provide an estimated time-of-death range (not a single point) and a confidence score. This is a decision-support estimate for a hospital demo tool, not a forensic or legal determination. Be explicit about the uncertainty and the factors driving the estimate. Return ONLY JSON: {"timeOfDeathRangeStart":ISO8601,"timeOfDeathRangeEnd":ISO8601,"aiConfidence":number,"aiNarrative":string}.`

    const { data, narrative, parseError, demo } = await generateJson({
      prompt: `Decedent: ${decedentName || "Unknown"}\nNotes:\n${text}`,
      system,
      maxTokens: 400,
    })

    if (demo || parseError || !data) {
      const now = Date.now()
      return res.json({
        decedentName: decedentName || "Unknown",
        timeOfDeathRangeStart: new Date(now - 36 * 3600 * 1000).toISOString(),
        timeOfDeathRangeEnd: new Date(now - 12 * 3600 * 1000).toISOString(),
        aiConfidence: 42,
        aiNarrative:
          narrative ||
          "AI-suggested time-of-death range based on limited inputs. High uncertainty — for workflow demonstration only.",
      })
    }

    return res.json({
      decedentName: decedentName || "Unknown",
      timeOfDeathRangeStart: data.timeOfDeathRangeStart,
      timeOfDeathRangeEnd: data.timeOfDeathRangeEnd,
      aiConfidence: Number(data.aiConfidence) || 50,
      aiNarrative: data.aiNarrative || narrative,
    })
  } catch (error) {
    next(error)
  }
}
