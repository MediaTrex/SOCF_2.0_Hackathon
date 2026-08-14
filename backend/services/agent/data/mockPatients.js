import crypto from "crypto"
import {
  saveCaseState,
  addCaseToIndex,
  getCaseIndex,
  clearCaseIndex,
} from "../config/careflowMemory.js"

/**
 * Demo patients for CareFlow AI — sized for Analytics charts:
 * volume (7/30d), urgency doughnut, pipeline stages, diagnoses,
 * doctor caseload, confidence bands, hour-of-day intakes.
 *
 * Photos: frontend /patients/*.svg
 * Timing: daysAgo + hour (0–23) → createdAt within the selected range.
 */

const STAGES = [
  "Intake Agent",
  "Medical Record Agent",
  "Triage & Diagnostic Agent",
  "Prescription Safety Agent",
  "Insurance & Billing Agent",
  "Follow-up Agent",
  "Explainability Agent",
]

const DOCTORS = {
  mehta: { id: "dr-mehta", name: "Dr. Ananya Mehta" },
  rao: { id: "dr-rao", name: "Dr. Vikram Rao" },
  chen: { id: "dr-chen", name: "Dr. Lisa Chen" },
  anub: { id: "dr-anubappal", name: "Dr. Anubappal" },
  iyer: { id: "sp-iyer", name: "Dr. Meera Iyer" },
}

const photo = (n) => `/patients/p${((n - 1) % 7) + 1}.svg`

/**
 * @typedef {object} MockPatient
 * @property {string} patientName
 * @property {number} age
 * @property {string} gender
 * @property {'routine'|'urgent'|'emergency'} urgency
 * @property {string} description
 * @property {string} topDiagnosis
 * @property {string} photoUrl
 * @property {string} photoSource
 * @property {{id:string,name:string}|null} assignedDoctor
 * @property {string} aiNarrative
 * @property {number|null} aiConfidence
 * @property {number} [daysAgo]
 * @property {number} [hoursAgo]
 * @property {number} [hour] hour of day 0–23
 * @property {string} stage
 * @property {boolean} [requires_human_review]
 */

/** @type {MockPatient[]} */
const MOCK_PATIENTS = [
  // —— Today (ops / KPIs) ——
  {
    patientName: "Hanisha",
    age: 29,
    gender: "female",
    urgency: "urgent",
    description:
      "Severe unilateral headache for 8 hours with nausea and photophobia. History of occasional migraines; this episode more intense than usual.",
    topDiagnosis: "Migraine — eval",
    photoUrl: photo(7),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.anub,
    aiNarrative:
      "29-year-old woman with severe unilateral headache, nausea, and photophobia. Prior migraines; episode more intense than usual.",
    aiConfidence: 86,
    daysAgo: 0,
    hour: 9,
    stage: "Triage & Diagnostic Agent",
  },
  {
    patientName: "Meera Iyer",
    age: 58,
    gender: "female",
    urgency: "emergency",
    description: "Chest pain radiating to left arm. ECG pending at door intake.",
    topDiagnosis: "ACS rule-out",
    photoUrl: photo(2),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.rao,
    aiNarrative:
      "58-year-old with chest pain radiating to the left arm. Flagged emergency pending ECG and clinician review.",
    aiConfidence: 71,
    daysAgo: 0,
    hour: 8,
    stage: "Intake Agent",
  },
  {
    patientName: "Kabir Shah",
    age: 45,
    gender: "male",
    urgency: "urgent",
    description: "Shortness of breath and wheezing after exposure to dust at work.",
    topDiagnosis: "Asthma exacerbation",
    photoUrl: photo(3),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.chen,
    aiNarrative:
      "45-year-old with acute dyspnea and wheeze after occupational dust exposure. Needs neb and peak-flow check.",
    aiConfidence: 78,
    daysAgo: 0,
    hour: 11,
    stage: "Medical Record Agent",
  },
  {
    patientName: "Ananya Desai",
    age: 22,
    gender: "female",
    urgency: "routine",
    description: "Annual wellness visit. No acute complaints. Labs drawn.",
    topDiagnosis: "Wellness visit",
    photoUrl: photo(1),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Routine wellness visit; intake complete, awaiting labs.",
    aiConfidence: 92,
    daysAgo: 0,
    hour: 14,
    stage: "Follow-up Agent",
  },

  // —— Yesterday ——
  {
    patientName: "Jaya Rao",
    age: 34,
    gender: "female",
    urgency: "urgent",
    description: "Fever and sore throat for 2 days. Suspected viral infection.",
    topDiagnosis: "Viral pharyngitis",
    photoUrl: photo(1),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative:
      "34-year-old with fever and sore throat for two days. Suspected viral infection; completeness adequate for triage.",
    aiConfidence: 82,
    daysAgo: 1,
    hour: 10,
    stage: "Triage & Diagnostic Agent",
  },
  {
    patientName: "Priya Kapoor",
    age: 41,
    gender: "female",
    urgency: "urgent",
    description: "Abdominal pain and nausea since morning. No prior surgery.",
    topDiagnosis: "Abdominal pain — eval",
    photoUrl: photo(4),
    photoSource: "door_camera",
    assignedDoctor: null,
    aiNarrative:
      "41-year-old with abdominal pain and nausea. Door intake photo captured; needs assignment and further workup.",
    aiConfidence: 64,
    daysAgo: 1,
    hour: 16,
    stage: "Medical Record Agent",
    requires_human_review: true,
  },
  {
    patientName: "Omar Hassan",
    age: 52,
    gender: "male",
    urgency: "emergency",
    description: "Sudden weakness left side, slurred speech. Last known well 40 min ago.",
    topDiagnosis: "Stroke alert",
    photoUrl: photo(5),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.iyer,
    aiNarrative:
      "Stroke alert — acute focal deficits within window. Neuro pathway activated.",
    aiConfidence: 68,
    daysAgo: 1,
    hour: 7,
    stage: "Intake Agent",
    requires_human_review: true,
  },

  // —— 2–3 days ——
  {
    patientName: "Arjun Singh",
    age: 27,
    gender: "male",
    urgency: "routine",
    description: "Follow-up visit for ongoing asthma management. Stable, refill request.",
    topDiagnosis: "Asthma follow-up",
    photoUrl: photo(3),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.chen,
    aiNarrative:
      "27-year-old routine asthma follow-up. Stable with medication refill request.",
    aiConfidence: 88,
    daysAgo: 2,
    hour: 15,
    stage: "Follow-up Agent",
  },
  {
    patientName: "Leo Nguyen",
    age: 19,
    gender: "male",
    urgency: "routine",
    description: "Sports injury — twisted ankle during practice. Swelling noted.",
    topDiagnosis: "Ankle sprain",
    photoUrl: photo(5),
    photoSource: "upload",
    assignedDoctor: DOCTORS.anub,
    aiNarrative:
      "19-year-old with twisted ankle and swelling after sports. Routine ortho triage path.",
    aiConfidence: 79,
    daysAgo: 2,
    hour: 18,
    stage: "Prescription Safety Agent",
  },
  {
    patientName: "Ravi Verma",
    age: 66,
    gender: "male",
    urgency: "urgent",
    description: "Headache with photophobia. History of hypertension.",
    topDiagnosis: "Headache — HTN context",
    photoUrl: photo(6),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative:
      "66-year-old with headache and photophobia on hypertension background. Urgent pending neuro vitals.",
    aiConfidence: 75,
    daysAgo: 3,
    hour: 12,
    stage: "Triage & Diagnostic Agent",
    requires_human_review: true,
  },
  {
    patientName: "Sofia Almeida",
    age: 31,
    gender: "female",
    urgency: "routine",
    description: "UTI symptoms for 3 days. Mild dysuria, no fever.",
    topDiagnosis: "UTI — suspected",
    photoUrl: photo(4),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Classic lower UTI symptoms; urine culture ordered.",
    aiConfidence: 84,
    daysAgo: 3,
    hour: 9,
    stage: "Insurance & Billing Agent",
  },

  // —— 4–7 days ——
  {
    patientName: "Dev Patel",
    age: 48,
    gender: "male",
    urgency: "urgent",
    description: "New onset atrial fibrillation on home monitor. Palpitations.",
    topDiagnosis: "AFib — new",
    photoUrl: photo(6),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.rao,
    aiNarrative: "New AFib with palpitations; rate control and anticoagulation review.",
    aiConfidence: 77,
    daysAgo: 4,
    hour: 13,
    stage: "Triage & Diagnostic Agent",
  },
  {
    patientName: "Nina Brooks",
    age: 37,
    gender: "female",
    urgency: "routine",
    description: "Migraine follow-up. Preventive therapy adjustment.",
    topDiagnosis: "Migraine — eval",
    photoUrl: photo(7),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.iyer,
    aiNarrative: "Migraine prophylaxis titration; no red flags today.",
    aiConfidence: 90,
    daysAgo: 5,
    hour: 11,
    stage: "Explainability Agent",
  },
  {
    patientName: "Haruto Tanaka",
    age: 55,
    gender: "male",
    urgency: "emergency",
    description: "Severe epigastric pain, diaphoresis. Rule out ACS vs gastritis.",
    topDiagnosis: "ACS rule-out",
    photoUrl: photo(2),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.rao,
    aiNarrative: "Epigastric pain with diaphoresis — ACS pathway until cleared.",
    aiConfidence: 62,
    daysAgo: 5,
    hour: 20,
    stage: "Intake Agent",
    requires_human_review: true,
  },
  {
    patientName: "Fatima Khan",
    age: 29,
    gender: "female",
    urgency: "urgent",
    description: "Pregnancy-associated vomiting and dehydration. OB triage.",
    topDiagnosis: "Hyperemesis — eval",
    photoUrl: photo(1),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Dehydration risk in pregnancy; IV fluids and OB consult.",
    aiConfidence: 73,
    daysAgo: 6,
    hour: 8,
    stage: "Medical Record Agent",
  },
  {
    patientName: "Marcus Lee",
    age: 61,
    gender: "male",
    urgency: "routine",
    description: "COPD stable visit. Inhaler technique reviewed.",
    topDiagnosis: "COPD follow-up",
    photoUrl: photo(3),
    photoSource: "upload",
    assignedDoctor: DOCTORS.chen,
    aiNarrative: "Stable COPD; inhaler technique reinforced.",
    aiConfidence: 91,
    daysAgo: 7,
    hour: 10,
    stage: "Follow-up Agent",
  },
  {
    patientName: "Elena Rossi",
    age: 44,
    gender: "female",
    urgency: "urgent",
    description: "Right lower quadrant pain. Appendicitis workup.",
    topDiagnosis: "Abdominal pain — eval",
    photoUrl: photo(4),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.anub,
    aiNarrative: "RLQ pain; surgical abdomen not excluded — imaging pending.",
    aiConfidence: 70,
    daysAgo: 7,
    hour: 17,
    stage: "Triage & Diagnostic Agent",
    requires_human_review: true,
  },

  // —— 8–14 days ——
  {
    patientName: "James Okonkwo",
    age: 33,
    gender: "male",
    urgency: "routine",
    description: "Ankle sprain follow-up. Improving with RICE.",
    topDiagnosis: "Ankle sprain",
    photoUrl: photo(5),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.anub,
    aiNarrative: "Improving sprain; PT referral discussed.",
    aiConfidence: 87,
    daysAgo: 8,
    hour: 14,
    stage: "Follow-up Agent",
  },
  {
    patientName: "Aisha Rahman",
    age: 26,
    gender: "female",
    urgency: "urgent",
    description: "High fever, productive cough. Possible pneumonia.",
    topDiagnosis: "Community pneumonia",
    photoUrl: photo(1),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.chen,
    aiNarrative: "Febrile productive cough; CXR and empiric antibiotics pending.",
    aiConfidence: 74,
    daysAgo: 9,
    hour: 19,
    stage: "Prescription Safety Agent",
  },
  {
    patientName: "Chen Wei",
    age: 70,
    gender: "male",
    urgency: "emergency",
    description: "Syncope with chest discomfort. Telemetry started.",
    topDiagnosis: "Syncope — cardiac",
    photoUrl: photo(6),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.rao,
    aiNarrative: "Elderly syncope with chest discomfort — cardiac workup.",
    aiConfidence: 58,
    daysAgo: 10,
    hour: 6,
    stage: "Intake Agent",
    requires_human_review: true,
  },
  {
    patientName: "Lara Mendes",
    age: 39,
    gender: "female",
    urgency: "routine",
    description: "Viral pharyngitis resolving. Return precautions given.",
    topDiagnosis: "Viral pharyngitis",
    photoUrl: photo(7),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Resolving viral pharyngitis; supportive care.",
    aiConfidence: 89,
    daysAgo: 11,
    hour: 12,
    stage: "Explainability Agent",
  },
  {
    patientName: "Ibrahim Diallo",
    age: 50,
    gender: "male",
    urgency: "urgent",
    description: "Uncontrolled hypertension, headache. Home BP 180/110.",
    topDiagnosis: "Headache — HTN context",
    photoUrl: photo(2),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Hypertensive urgency with headache; meds adjusted.",
    aiConfidence: 76,
    daysAgo: 12,
    hour: 15,
    stage: "Triage & Diagnostic Agent",
  },
  {
    patientName: "Grace Kim",
    age: 28,
    gender: "female",
    urgency: "routine",
    description: "UTI culture follow-up. Sensitive to nitrofurantoin.",
    topDiagnosis: "UTI — suspected",
    photoUrl: photo(4),
    photoSource: "patient_app",
    assignedDoctor: null,
    aiNarrative: "Culture-guided therapy; unassigned for refill call.",
    aiConfidence: 85,
    daysAgo: 13,
    hour: 9,
    stage: "Insurance & Billing Agent",
  },
  {
    patientName: "Tom Hughes",
    age: 42,
    gender: "male",
    urgency: "urgent",
    description: "Asthma exacerbation after wildfire smoke exposure.",
    topDiagnosis: "Asthma exacerbation",
    photoUrl: photo(3),
    photoSource: "upload",
    assignedDoctor: DOCTORS.chen,
    aiNarrative: "Smoke-triggered asthma flare; steroids considered.",
    aiConfidence: 80,
    daysAgo: 14,
    hour: 21,
    stage: "Prescription Safety Agent",
  },

  // —— 15–21 days ——
  {
    patientName: "Yara Haddad",
    age: 35,
    gender: "female",
    urgency: "routine",
    description: "Migraine diary review. Trigger counseling.",
    topDiagnosis: "Migraine — eval",
    photoUrl: photo(7),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.iyer,
    aiNarrative: "Migraine diary reviewed; lifestyle triggers mapped.",
    aiConfidence: 93,
    daysAgo: 15,
    hour: 11,
    stage: "Follow-up Agent",
  },
  {
    patientName: "Pedro Silva",
    age: 59,
    gender: "male",
    urgency: "emergency",
    description: "Crushing chest pain at rest. STEMI pathway.",
    topDiagnosis: "ACS rule-out",
    photoUrl: photo(2),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.rao,
    aiNarrative: "Rest angina — STEMI pathway activated.",
    aiConfidence: 55,
    daysAgo: 16,
    hour: 5,
    stage: "Intake Agent",
    requires_human_review: true,
  },
  {
    patientName: "Hannah Cohen",
    age: 24,
    gender: "female",
    urgency: "routine",
    description: "Ankle sprain from trail run. X-ray negative.",
    topDiagnosis: "Ankle sprain",
    photoUrl: photo(5),
    photoSource: "upload",
    assignedDoctor: DOCTORS.anub,
    aiNarrative: "X-ray negative sprain; brace and rest.",
    aiConfidence: 88,
    daysAgo: 17,
    hour: 16,
    stage: "Explainability Agent",
  },
  {
    patientName: "Vikram Nair",
    age: 47,
    gender: "male",
    urgency: "urgent",
    description: "Abdominal pain after fatty meal. Gallbladder eval.",
    topDiagnosis: "Abdominal pain — eval",
    photoUrl: photo(6),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Postprandial RUQ pain; biliary ultrasound pending.",
    aiConfidence: 69,
    daysAgo: 18,
    hour: 13,
    stage: "Medical Record Agent",
    requires_human_review: true,
  },
  {
    patientName: "Olivia Park",
    age: 32,
    gender: "female",
    urgency: "routine",
    description: "COPD meds education for family caregiver (proxy visit).",
    topDiagnosis: "COPD follow-up",
    photoUrl: photo(3),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.chen,
    aiNarrative: "Caregiver education session logged.",
    aiConfidence: 94,
    daysAgo: 19,
    hour: 10,
    stage: "Follow-up Agent",
  },
  {
    patientName: "Samir Bose",
    age: 63,
    gender: "male",
    urgency: "urgent",
    description: "Community-acquired pneumonia on CXR. Admitted overnight.",
    topDiagnosis: "Community pneumonia",
    photoUrl: photo(1),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.chen,
    aiNarrative: "CXR-confirmed pneumonia; antibiotics started.",
    aiConfidence: 81,
    daysAgo: 20,
    hour: 22,
    stage: "Insurance & Billing Agent",
  },
  {
    patientName: "Mia Torres",
    age: 21,
    gender: "female",
    urgency: "routine",
    description: "Viral pharyngitis. Rapid strep negative.",
    topDiagnosis: "Viral pharyngitis",
    photoUrl: photo(4),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Strep negative; supportive care only.",
    aiConfidence: 86,
    daysAgo: 21,
    hour: 9,
    stage: "Prescription Safety Agent",
  },

  // —— 22–29 days (fills 30-day analytics range) ——
  {
    patientName: "Noah Bergman",
    age: 54,
    gender: "male",
    urgency: "urgent",
    description: "New AFib with RVR. Cardioversion considered.",
    topDiagnosis: "AFib — new",
    photoUrl: photo(6),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.rao,
    aiNarrative: "AFib with RVR; rate control underway.",
    aiConfidence: 72,
    daysAgo: 22,
    hour: 4,
    stage: "Triage & Diagnostic Agent",
    requires_human_review: true,
  },
  {
    patientName: "Zara Ali",
    age: 30,
    gender: "female",
    urgency: "routine",
    description: "Wellness labs review. Lipid panel borderline.",
    topDiagnosis: "Wellness visit",
    photoUrl: photo(7),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.mehta,
    aiNarrative: "Borderline lipids; lifestyle plan shared.",
    aiConfidence: 95,
    daysAgo: 24,
    hour: 11,
    stage: "Explainability Agent",
  },
  {
    patientName: "Ethan Brooks",
    age: 18,
    gender: "male",
    urgency: "emergency",
    description: "Suspected anaphylaxis after peanut exposure. Epi given.",
    topDiagnosis: "Anaphylaxis",
    photoUrl: photo(5),
    photoSource: "door_camera",
    assignedDoctor: DOCTORS.anub,
    aiNarrative: "Anaphylaxis treated with epinephrine; observation ongoing.",
    aiConfidence: 66,
    daysAgo: 25,
    hour: 18,
    stage: "Intake Agent",
    requires_human_review: true,
  },
  {
    patientName: "Amelia Wright",
    age: 40,
    gender: "female",
    urgency: "urgent",
    description: "Stroke-like symptoms resolved — TIA workup.",
    topDiagnosis: "Stroke alert",
    photoUrl: photo(2),
    photoSource: "patient_app",
    assignedDoctor: DOCTORS.iyer,
    aiNarrative: "Resolved focal deficits; TIA pathway and imaging.",
    aiConfidence: 61,
    daysAgo: 27,
    hour: 7,
    stage: "Medical Record Agent",
    requires_human_review: true,
  },
  {
    patientName: "Rajesh Gupta",
    age: 68,
    gender: "male",
    urgency: "routine",
    description: "Asthma follow-up after recent flare. Controllers optimized.",
    topDiagnosis: "Asthma follow-up",
    photoUrl: photo(3),
    photoSource: "upload",
    assignedDoctor: DOCTORS.chen,
    aiNarrative: "Post-flare controller optimization visit.",
    aiConfidence: 90,
    daysAgo: 28,
    hour: 14,
    stage: "Follow-up Agent",
  },
  {
    patientName: "Chloe Martin",
    age: 36,
    gender: "female",
    urgency: "urgent",
    description: "UTI with fever — possible pyelo. Fluids started.",
    topDiagnosis: "UTI — suspected",
    photoUrl: photo(1),
    photoSource: "door_camera",
    assignedDoctor: null,
    aiNarrative: "Febrile UTI; needs assignment and urine culture.",
    aiConfidence: 57,
    daysAgo: 29,
    hour: 23,
    stage: "Triage & Diagnostic Agent",
    requires_human_review: true,
  },
]

function mockTimeline(currentStage) {
  const idx = Math.max(0, STAGES.indexOf(currentStage))
  return STAGES.map((agent, i) => ({
    agent,
    status: i < idx ? "completed" : i === idx ? "in_progress" : "pending",
  }))
}

function createdAtFor(m, now = Date.now()) {
  if (typeof m.daysAgo === "number") {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - m.daysAgo)
    const hour = Number.isFinite(m.hour) ? m.hour : 10
    const minute = Number.isFinite(m.minute) ? m.minute : (m.patientName?.length || 0) % 60
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
  }
  const hours = typeof m.hoursAgo === "number" ? m.hoursAgo : 1
  return new Date(now - hours * 3600 * 1000).toISOString()
}

function toCaseState(m, caseId, createdAt) {
  const timeline = mockTimeline(m.stage)
  return {
    caseId,
    createdAt,
    patientName: m.patientName,
    patient_information: {
      name: m.patientName,
      age: m.age,
      gender: m.gender,
    },
    urgency: m.urgency,
    requires_human_review: m.requires_human_review ?? false,
    topDiagnosis: m.topDiagnosis,
    current_stage: m.stage,
    timeline,
    photoUrl: m.photoUrl,
    photoSource: m.photoSource,
    clinical: {
      assignedDoctor: m.assignedDoctor,
      description: m.description,
      labs: [],
      prescriptions: [],
      nextFollowUpDate: null,
      uploadedReports: [],
      autopsyEstimate: null,
      aiNarrative: m.aiNarrative,
      aiConfidence: m.aiConfidence,
    },
  }
}

function toIndexSummary(state) {
  return {
    caseId: state.caseId,
    patientName: state.patientName,
    urgency: state.urgency,
    requires_human_review: state.requires_human_review,
    topDiagnosis: state.topDiagnosis,
    timeline: state.timeline,
    current_stage: state.current_stage,
    assignedDoctor: state.clinical.assignedDoctor,
    nextFollowUpDate: null,
    description: state.clinical.description,
    aiNarrative: state.clinical.aiNarrative,
    aiConfidence: state.clinical.aiConfidence,
    photoUrl: state.photoUrl,
    photoSource: state.photoSource,
    createdAt: state.createdAt,
  }
}

export async function seedMockPatientsIfEmpty() {
  const existing = await getCaseIndex()
  if (existing.length > 0) return { seeded: false, count: existing.length }
  return seedMockPatients()
}

/**
 * Full analytics demo seed. Replaces the case index and writes each case
 * with a 30-day Redis TTL so charts stay populated.
 */
export async function seedMockPatients({ replace = true } = {}) {
  if (replace) await clearCaseIndex()

  const now = Date.now()
  const DEMO_TTL_SEC = 60 * 60 * 24 * 30

  for (const m of MOCK_PATIENTS) {
    const caseId = crypto.randomUUID()
    const createdAt = createdAtFor(m, now)
    const state = toCaseState(m, caseId, createdAt)
    await saveCaseState(caseId, state, DEMO_TTL_SEC)
    await addCaseToIndex(toIndexSummary(state), {
      max: 200,
      ttlSec: DEMO_TTL_SEC,
    })
  }

  return { seeded: true, count: MOCK_PATIENTS.length, replaced: replace }
}

export { MOCK_PATIENTS, STAGES, DOCTORS }
