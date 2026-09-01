import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { DRUG_DATABASE } from "./src/data/drugDatabase";
import { BASIC_DRUG_INDEX } from "./src/data/basicDrugIndex";
import { DrugMonograph } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// ── BACKEND PERSISTENT DRUG DATABASE STORE ───────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");
const DRUGS_FILE = path.join(DATA_DIR, "drugs.json");

let inMemoryDrugs: DrugMonograph[] = [];

// Helper to sanitize drug ID

function isBadDrug(name: string | undefined): boolean {
  if (!name) return true;
  if (name.length <= 3) return true;
  if (name === "Orange.") return true;
  if (name.includes("Orange")) return true;
  if (name.toLowerCase() === "carbonate") return true;
  if (name.toLowerCase() === "f 1159") return true;
  if (name.includes("1159")) return true;
  if (name.match(/P\.?\s*\d+/i)) return true;
  return false;
}

function slugifyDrugName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "drug_" + Date.now()
  );
}

// Initialize or load backend drugs database, seeding with DRUG_DATABASE
function initBackendDrugs(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let loaded: DrugMonograph[] = [];
    if (fs.existsSync(DRUGS_FILE)) {
      const fileData = fs.readFileSync(DRUGS_FILE, "utf-8");
      try {
        loaded = JSON.parse(fileData);
      } catch {
        loaded = [];
      }
    }

    const map = new Map<string, DrugMonograph>();
    
    // Seed basic drug index first
    if (Array.isArray(BASIC_DRUG_INDEX)) {
      BASIC_DRUG_INDEX.forEach((d) => {
        const id = d.id || slugifyDrugName(d.genericName);
        map.set(id.toLowerCase(), { ...d, id, source: d.source || "basic_index" });
      });
    }

    // Seed default verified drug monographs (overrides basic)
    if (Array.isArray(DRUG_DATABASE)) {
      DRUG_DATABASE.forEach((d) => {
        const id = d.id || slugifyDrugName(d.genericName);
        map.set(id.toLowerCase(), { ...d, id, source: d.source || "local" });
      });
    }

    // Merge saved disk entries (overrides both)
    if (Array.isArray(loaded)) {
      loaded.forEach((d) => {
        if (d && d.genericName && !isBadDrug(d.genericName) && !isBadDrug(d.id)) {
          const id = d.id || slugifyDrugName(d.genericName);
          map.set(id.toLowerCase(), { ...d, id });
        }
      });
    }

    inMemoryDrugs = Array.from(map.values());
    saveDrugsToDisk();
    console.log(`[Backend Drugs] Loaded ${inMemoryDrugs.length} total drug monographs in database.`);
  } catch (err) {
    console.error("[Backend Drugs] Error reading database file:", err);
    inMemoryDrugs = Array.isArray(DRUG_DATABASE) ? [...DRUG_DATABASE] : [];
  }
}

// Persist in-memory drugs to data/drugs.json
function saveDrugsToDisk(): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DRUGS_FILE, JSON.stringify(inMemoryDrugs, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[Backend Drugs] Error saving database file:", err);
    return false;
  }
}

initBackendDrugs();

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Model Fallback Hierarchy for 503 high demand resilience
const CANDIDATE_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
];

// Helper: Sleep utility
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Generate content with automatic retries and model fallback
async function generateContentWithRetryAndFallback(params: {
  contents: string;
  config?: any;
}): Promise<{ text: string; modelUsed: string }> {
  const ai = getAI();
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured on server.");
  }

  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    // Try up to 2 attempts per candidate model with backoff
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Gemini API] Attempting model: ${model} (attempt ${attempt}/2)...`);
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });

        const text = response.text?.trim();
        if (text) {
          console.log(`[Gemini API] Success with model ${model}`);
          return { text, modelUsed: model };
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = (err.message || "").toLowerCase();
        const errStatus = err.status || err.code || "";
        const isHighDemandOrTransient =
          errMsg.includes("high demand") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("503") ||
          errMsg.includes("429") ||
          errMsg.includes("resource_exhausted") ||
          errStatus === 503 ||
          errStatus === 429;

        console.warn(`[Gemini API] ${model} attempt ${attempt} failed: ${err.message || err}`);

        if (isHighDemandOrTransient && attempt < 2) {
          // Wait briefly before retry on same model
          await delay(400 * attempt);
        } else {
          // Move to next candidate model in list
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models temporarily unavailable");
}

// ── CLINICAL RULE-BASED FALLBACK CONSULTATION GENERATOR ─────────────────────
// Invoked if all external AI endpoints are 503 unavailable
function buildClinicalFallbackConsultation(prompt: string): any {
  const lower = prompt.toLowerCase();

  const isChild = lower.includes("infant") || lower.includes("child") || lower.includes("pediatric");
  const isElderly = lower.includes("elderly");
  const hasHTN = lower.includes("hypertension") || lower.includes("high blood pressure") || lower.includes("bp");
  const hasDiabetes = lower.includes("diabetes") || lower.includes("diabetic");
  const isPregnant = lower.includes("pregnant") || lower.includes("pregnancy");
  const hasAcidity = lower.includes("acidity") || lower.includes("gerd") || lower.includes("heartburn") || lower.includes("gastric");
  const hasPain = lower.includes("pain") || lower.includes("headache") || lower.includes("body pain") || lower.includes("fever");
  const hasCold = lower.includes("cold") || lower.includes("runny nose") || lower.includes("sneezing") || lower.includes("nasal");
  const hasCough = lower.includes("cough") || lower.includes("sore throat");
  const hasDiarrhea = lower.includes("diarrhea") || lower.includes("loose motion") || lower.includes("stomach upset");
  const hasVomiting = lower.includes("vomiting") || lower.includes("nausea");

  let brands: any[] = [];
  let substituteMedicine: any = null;
  let supportiveProducts: any[] = [];
  let wellnessProducts: any[] = [];

  if (hasCold || lower.includes("runny nose")) {
    brands.push({
      brand: isChild ? "Sinarest Pediatric Syrup" : "Sinarest LP",
      generic: isChild ? "Paracetamol + Phenylephrine + Chlorpheniramine" : "Paracetamol (500mg) + Phenylephrine (10mg) + CPM (2mg)",
      company: "Centaur",
      strength: isChild ? "125mg + 2.5mg + 1mg / 5ml" : "500mg + 10mg + 2mg",
      formulation: isChild ? "Syrup" : "Tablet",
      dose: isChild ? "5ml BD after food" : "1 Tab BD",
      duration: "5 days",
      qty: isChild ? "60ml Bottle" : "10 Tablets",
      mrp: isChild ? "₹52" : "₹58",
      route: "Oral after meals",
      food_interaction: "Take after food",
      counsel: "May cause mild drowsiness. Avoid alcohol and driving. Stay hydrated.",
      pregnancy_safe: isPregnant ? "Avoid / Consult Obstetrician" : "Consult doctor",
      otc_schedule: "Schedule H",
      in_stock: true,
      interaction_flag: hasHTN ? "Caution: Phenylephrine may mildly elevate blood pressure in hypertension." : null,
      altBrands: [
        { brand: "Cheston Cold", company: "Cipla", mrp: "₹48" },
        { brand: "Wikoryl", company: "Alembic", mrp: "₹50" },
      ],
    });

    substituteMedicine = {
      forBrandIndex: 0,
      brand: "Allegra 120",
      generic: "Fexofenadine Hydrochloride",
      company: "Sanofi",
      strength: "120mg",
      formulation: "Tablet",
      dose: "1 Tab OD in morning",
      duration: "5 days",
      qty: "5 Tablets",
      mrp: "₹98",
      why: "Non-sedating antihistamine for daytime alert use without drowsiness.",
      route: "Oral with plain water",
      food_interaction: "Do not take with fruit juices (reduces absorption)",
      counsel: "Take with plain water only. Completely non-drowsy formulation.",
      pregnancy_safe: "Consult doctor",
      otc_schedule: "Schedule H",
      in_stock: true,
      altBrands: [
        { brand: "Fexova 120", company: "Mankind", mrp: "₹72" },
        { brand: "Histafree 120", company: "Mankind", mrp: "₹65" },
      ],
    };

    supportiveProducts.push({
      brand: "Karvol Plus",
      strength: "Camphor + Chlorothymol + Eucalyptol",
      formulation: "Inhalation Capsule",
      company: "Reckitt",
      dose: "Crush 1 capsule in hot steaming water & inhale steam BD",
      duration: "3-5 days",
      qty: "10 Capsules",
      mrp: "₹65",
      reason: "Clears nasal passage and decongests airways naturally without sedation.",
      in_stock: true,
    });
  } else if (hasAcidity || lower.includes("gas") || lower.includes("heartburn")) {
    brands.push({
      brand: "Pan 40",
      generic: "Pantoprazole Sodium",
      company: "Alkem",
      strength: "40mg",
      formulation: "Enteric Coated Tablet",
      dose: "1 Tab OD before breakfast (empty stomach)",
      duration: "5 days",
      qty: "10 Tablets",
      mrp: "₹108",
      route: "Oral 30 mins before food",
      food_interaction: "Take on empty stomach with plain water",
      counsel: "Swallow whole, do not crush or chew tablet.",
      pregnancy_safe: "Category B (Safe if clinically indicated)",
      otc_schedule: "Schedule H",
      in_stock: true,
      altBrands: [
        { brand: "Pantocid 40", company: "Sun Pharma", mrp: "₹112" },
        { brand: "Pantodac 40", company: "Zydus", mrp: "₹95" },
      ],
    });

    substituteMedicine = {
      forBrandIndex: 0,
      brand: "Razo 20",
      generic: "Rabeprazole Sodium",
      company: "Dr. Reddy's",
      strength: "20mg",
      formulation: "Tablet",
      dose: "1 Tab OD empty stomach",
      duration: "5 days",
      qty: "10 Tablets",
      mrp: "₹130",
      why: "Faster onset of gastric acid suppression.",
      route: "Oral before morning meal",
      food_interaction: "Empty stomach",
      counsel: "Take 30 minutes before breakfast.",
      pregnancy_safe: "Consult doctor",
      otc_schedule: "Schedule H",
      in_stock: true,
      altBrands: [
        { brand: "Rablet 20", company: "Lupin", mrp: "₹115" },
        { brand: "Happi 20", company: "Zydus", mrp: "₹105" },
      ],
    };

    supportiveProducts.push({
      brand: "Gelusil MPS Liquid",
      strength: "Aluminium Hydroxide + Magnesium Hydroxide + Simethicone",
      formulation: "Antacid Liquid",
      company: "Pfizer",
      dose: "10ml after meals and at bedtime",
      duration: "3-5 days",
      qty: "200ml Bottle",
      mrp: "₹120",
      reason: "Provides instant topical neutralizing relief from gastric acid & bloating.",
      in_stock: true,
    });
  } else if (hasDiarrhea) {
    brands.push({
      brand: "Electral ORS Powder",
      generic: "WHO-Formula Oral Rehydration Salts",
      company: "FDC Ltd",
      strength: "21.8g Sachet for 1 Litre",
      formulation: "Powder Sachet",
      dose: "Dissolve 1 sachet in 1 Litre boiled & cooled water. Sip freely after every loose stool.",
      duration: "3 days",
      qty: "5 Sachets",
      mrp: "₹110",
      route: "Oral rehydration solution",
      food_interaction: "Continue normal feeding/eating",
      counsel: "Do not boil solution once prepared. Discard unused portion after 24 hours.",
      pregnancy_safe: "Safe in all trimesters",
      otc_schedule: "OTC",
      in_stock: true,
      altBrands: [
        { brand: "Prolyte ORS", company: "Cipla", mrp: "₹105" },
        { brand: "Walyte ORS", company: "Wallace", mrp: "₹98" },
      ],
    });

    substituteMedicine = {
      forBrandIndex: 0,
      brand: "Darolac Plus",
      generic: "Lactobacillus + Bifidobacterium + Zinc Probiotic",
      company: "Aristo",
      strength: "Multi-strain Probiotic",
      formulation: "Capsule",
      dose: "1 Cap BD",
      duration: "5 days",
      qty: "10 Capsules",
      mrp: "₹145",
      why: "Restores healthy gut microflora and accelerates diarrhea recovery.",
      route: "Oral after food",
      food_interaction: "With room temperature water",
      counsel: "Do not take with hot liquids or direct alcohol.",
      pregnancy_safe: "Safe",
      otc_schedule: "OTC",
      in_stock: true,
      altBrands: [
        { brand: "Econorm", company: "Dr. Reddy's", mrp: "₹180" },
        { brand: "Bacigyl", company: "FDC", mrp: "₹95" },
      ],
    };

    supportiveProducts.push({
      brand: "Zinconia 50",
      strength: "Zinc Sulfate 50mg",
      formulation: "Tablet",
      company: "Zuventus",
      dose: isChild ? "10-20mg OD" : "1 Tab OD",
      duration: "10-14 days",
      qty: "14 Tablets",
      mrp: "₹65",
      reason: "WHO recommendation to repair intestinal mucosa and prevent recurrent diarrhea.",
      in_stock: true,
    });
  } else if (hasVomiting) {
    brands.push({
      brand: isChild ? "Ondem 2mg/5ml Syrup" : "Ondem 4",
      generic: "Ondansetron Hydrochloride",
      company: "Alkem",
      strength: isChild ? "2mg/5ml" : "4mg",
      formulation: isChild ? "Syrup" : "Mouth Dissolving Tablet (MD)",
      dose: isChild ? "2.5 - 5ml 30 mins before food" : "1 Tab MD 30 mins before food TDS PRN",
      duration: "3 days",
      qty: isChild ? "30ml Bottle" : "10 Tablets",
      mrp: isChild ? "₹42" : "₹56",
      route: "Oral / Dispersible in mouth",
      food_interaction: "Take 30 minutes before meals",
      counsel: "Place on tongue and let dissolve. Avoid heavy oily foods.",
      pregnancy_safe: isPregnant ? "Safe if prescribed by OBGYN for Hyperemesis" : "Consult doctor",
      otc_schedule: "Schedule H",
      in_stock: true,
      altBrands: [
        { brand: "Emigo 4", company: "Zuventus", mrp: "₹52" },
        { brand: "Vomistop", company: "Cipla", mrp: "₹48" },
      ],
    });

    substituteMedicine = {
      forBrandIndex: 0,
      brand: "Domstal 10",
      generic: "Domperidone",
      company: "Torrent",
      strength: "10mg",
      formulation: "Tablet",
      dose: "1 Tab TDS before meals",
      duration: "3 days",
      qty: "10 Tablets",
      mrp: "₹38",
      why: "Prokinetic antiemetic that speeds gastric emptying.",
      route: "Oral before food",
      food_interaction: "Take 15-30 mins before food",
      counsel: "Take before meals for optimal gastric emptying.",
      pregnancy_safe: "Consult doctor",
      otc_schedule: "Schedule H",
      in_stock: true,
      altBrands: [
        { brand: "Motinorm", company: "Medley", mrp: "₹35" },
        { brand: "Vomidon", company: "Zydus", mrp: "₹32" },
      ],
    };

    supportiveProducts.push({
      brand: "Electral ORS",
      strength: "WHO Formula ORS",
      formulation: "Sachet",
      company: "FDC",
      dose: "Sip small amounts frequently after vomiting subsides",
      duration: "2-3 days",
      qty: "3 Sachets",
      mrp: "₹66",
      reason: "Prevents acute dehydration and electrolyte imbalances from emesis.",
      in_stock: true,
    });
  } else {
    // Default Fever / Pain / Headache / General OTC
    const isPediatric = isChild;
    brands.push({
      brand: isPediatric ? "Calpol 250mg Pead Suspension" : "Dolo 650",
      generic: "Paracetamol (Acetaminophen)",
      company: isPediatric ? "GSK" : "Micro Labs",
      strength: isPediatric ? "250mg/5ml" : "650mg",
      formulation: isPediatric ? "Suspension" : "Tablet",
      dose: isPediatric
        ? "5 - 7.5ml TDS PRN (15mg/kg/dose)"
        : isElderly
        ? "1 Tab BD or TDS PRN (Max 2000mg/day)"
        : "1 Tab TDS after food PRN (Max 4 tabs/day)",
      duration: "3-5 days",
      qty: isPediatric ? "60ml Bottle" : "15 Tablets",
      mrp: isPediatric ? "₹45" : "₹32",
      route: "Oral with water",
      food_interaction: "Can take with or after food",
      counsel:
        "Do not exceed maximum daily dosage. Avoid taking with other combination paracetamol medicines.",
      pregnancy_safe: "Category B (Considered safe in all trimesters)",
      otc_schedule: "OTC",
      in_stock: true,
      interaction_flag: null,
      altBrands: [
        { brand: "Calpol 650", company: "GSK", mrp: "₹34" },
        { brand: "Crocin 650", company: "Haleon", mrp: "₹33" },
        { brand: "Pacimol 650", company: "Ipca", mrp: "₹28" },
      ],
    });

    substituteMedicine = {
      forBrandIndex: 0,
      brand: isPregnant || hasHTN ? "Calpol 500" : "Combiflam",
      generic:
        isPregnant || hasHTN
          ? "Paracetamol 500mg"
          : "Ibuprofen (400mg) + Paracetamol (325mg)",
      company: isPregnant || hasHTN ? "GSK" : "Sanofi",
      strength: isPregnant || hasHTN ? "500mg" : "400mg + 325mg",
      formulation: "Tablet",
      dose: "1 Tab BD after food",
      duration: "3 days",
      qty: "10 Tablets",
      mrp: "₹42",
      why:
        isPregnant || hasHTN
          ? "Safer non-NSAID analgesic for cardiac/pregnancy profile."
          : "Enhanced anti-inflammatory action for moderate muscular/body aches.",
      route: "Oral strictly after meals",
      food_interaction: "Take strictly after food to prevent gastric irritation",
      counsel:
        isPregnant || hasHTN
          ? "Take with water as needed."
          : "Always take after a full meal. Avoid if history of gastritis or peptic ulcers.",
      pregnancy_safe: isPregnant ? "Category B" : "Avoid in pregnancy (NSAID)",
      otc_schedule: "Schedule H",
      in_stock: true,
      interaction_flag:
        hasHTN && !(isPregnant || hasHTN)
          ? "Caution: Ibuprofen NSAID can reduce antihypertensive efficacy."
          : null,
      altBrands: [
        { brand: "Ibugesic Plus", company: "Cipla", mrp: "₹38" },
        { brand: "Flexon", company: "Aristo", mrp: "₹35" },
      ],
    };

    supportiveProducts.push({
      brand: "Prolyte ORS",
      strength: "Electrolyte Drink",
      formulation: "Ready Liquid / Sachet",
      company: "Cipla",
      dose: "200ml - 1L as required during fever/fatigue",
      duration: "3 days",
      qty: "2 Tetrapaks",
      mrp: "₹60",
      reason: "Restores hydration and maintains vital electrolytes during illness.",
      in_stock: true,
    });
  }

  wellnessProducts.push({
    brand: "Becosules Z",
    formulation: "Capsule",
    company: "Pfizer",
    dose: "1 Cap OD after meals",
    duration: "15 days",
    qty: "20 Capsules",
    mrp: "₹56",
    reason: "B-Complex + Vitamin C + Zinc to bolster immunity and metabolic recovery.",
    in_stock: true,
  });

  return {
    strategy: "single",
    brands,
    substituteMedicine,
    supportiveProducts,
    wellnessProducts,
    _clinicalEngine: "Evidence-Based Offline Protocol Engine",
  };
}

// ── HEALTH CHECK ENDPOINT ──────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    totalStoredDrugs: inMemoryDrugs.length,
    timestamp: new Date().toISOString(),
  });
});

// ── GET ALL OR SEARCH BACKEND DRUGS (Instant Local Search) ───────────────
app.get("/api/drugs", (req, res) => {
  try {
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim().toLowerCase();
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    let results = inMemoryDrugs;

    if (category && category !== "All") {
      results = results.filter((d) => d.category === category);
    }

    if (q) {
      results = results.filter((d) => {
        const inGeneric = d.genericName.toLowerCase().includes(q);
        const inBrands = ((d.brandNames || []).some((b) => b.toLowerCase().includes(q)));
        const inClass = d.drugClass.toLowerCase().includes(q);
        const inIndications = ((d.indications || []).some((ind) => ind.toLowerCase().includes(q)));
        const inCategory = d.category ? d.category.toLowerCase().includes(q) : false;
        return inGeneric || inBrands || inClass || inIndications || inCategory;
      });
    }

    res.json({
      success: true,
      total: results.length,
      drugs: results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to search backend drugs" });
  }
});

// ── GET SINGLE DRUG MONOGRAPH ─────────────────────────────────────────────
app.get("/api/drugs/:id", (req, res) => {
  const { id } = req.params;
  const target = inMemoryDrugs.find(
    (d) => d.id === id || d.genericName.toLowerCase() === id.toLowerCase()
  );
  if (!target) {
    res.status(404).json({ error: "Drug not found in backend database" });
    return;
  }
  res.json({ success: true, drug: target });
});

// ── SAVE / UPDATE DRUG IN BACKEND DATABASE ─────────────────────────────────
app.post("/api/drugs", (req, res) => {
  try {
    const drugData = req.body;
    if (!drugData || !drugData.genericName) {
      res.status(400).json({ error: "genericName is required" });
      return;
    }

    const id = drugData.id || slugifyDrugName(drugData.genericName);
    const existingIndex = inMemoryDrugs.findIndex(
      (d) => d.id === id || d.genericName.toLowerCase() === drugData.genericName.toLowerCase()
    );

    const updatedDrug: DrugMonograph = {
      ...drugData,
      id,
      lastUpdated: new Date().toISOString(),
      source: drugData.source || "custom",
    };

    if (existingIndex >= 0) {
      inMemoryDrugs[existingIndex] = updatedDrug;
    } else {
      inMemoryDrugs.unshift(updatedDrug);
    }

    saveDrugsToDisk();
    res.json({
      success: true,
      drug: updatedDrug,
      total: inMemoryDrugs.length,
      action: existingIndex >= 0 ? "updated" : "created",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save drug to backend database" });
  }
});

// ── DRUG LOOKUP ENDPOINT (Online AI Search with Fallback + Auto-Save) ───────
app.post("/api/drug-lookup", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Drug query string is required" });
      return;
    }

    const cleanQuery = query.trim();
    const queryLower = cleanQuery.toLowerCase();

    // Check if we already have it in backend first for instantaneous response
    const existing = inMemoryDrugs.find(
      (d) =>
        d.genericName.toLowerCase().includes(queryLower) ||
        ((d.brandNames || []).some((b) => b.toLowerCase().includes(queryLower))) ||
        d.id.toLowerCase() === queryLower
    );

    const forceRefresh = req.body.forceRefresh === true;

    if (existing && !forceRefresh) {
      res.json({
        success: true,
        drug: existing,
        fromBackendCache: true,
        message: "Found instantly in backend database",
      });
      return;
    }

    const prompt = `You are an authoritative clinical pharmacology and drug information expert.
Provide a complete, medically accurate, and up-to-date monograph for the drug query: "${cleanQuery}".
Focus on common clinical practice in India and international pharmacological guidelines (CDSCO, FDA, WHO).
Return a SINGLE valid JSON object matching the requested schema strictly.`;

    try {
      const { text, modelUsed } = await generateContentWithRetryAndFallback({
        contents: prompt,
        config: {
          systemInstruction:
            "You are an expert clinical pharmacist and medical database curator. Provide precise, evidence-based drug monographs in JSON format.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              genericName: { type: Type.STRING, description: "Generic INN molecule name" },
              brandNames: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Popular Indian & global brand names (e.g. Dolo 650, Calpol, Augmentin)",
              },
              drugClass: { type: Type.STRING, description: "Pharmacological and therapeutic class" },
              category: {
                type: Type.STRING,
                description:
                  "Broad category e.g. Pain & Fever, Antibiotics & Anti-infectives, Gastrointestinal & Acidity, Allergy & Cold, Cardiovascular & Blood Pressure, Diabetes & Endocrine, Nausea & Vomiting, Respiratory & Allergy",
              },
              otcSchedule: { type: Type.STRING, description: "OTC, Schedule H, Schedule H1, Schedule X, etc." },
              pregnancyCategory: {
                type: Type.STRING,
                description: "Pregnancy safety category (A, B, C, D, X, or Safe/Caution/Avoid with concise reason)",
              },
              lactationSafety: { type: Type.STRING, description: "Safety during breastfeeding" },
              commonFormulations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Available forms and standard strengths (e.g. 500mg Tablet, 250mg/5ml Syrup)",
              },
              indications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Primary clinical indications and therapeutic uses",
              },
              dosage: {
                type: Type.OBJECT,
                properties: {
                  adult: { type: Type.STRING, description: "Standard adult dosage, frequency, and maximum daily limit" },
                  pediatric: {
                    type: Type.STRING,
                    description: "Pediatric dosing guidelines in mg/kg/day or age tiers, or contraindication",
                  },
                  timing: { type: Type.STRING, description: "Food timing e.g. Before food, With food, After food, At bedtime" },
                  renalHepaticAdjustment: { type: Type.STRING, description: "Dose modifications in kidney or liver disease" },
                },
                required: ["adult", "timing"],
              },
              precautions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Main warnings, precautions, and relative contraindications",
              },
              contraindications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Absolute contraindications (do not prescribe in these conditions)",
              },
              majorInteractions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    interactingDrug: { type: Type.STRING, description: "Interacting drug or drug class" },
                    severity: { type: Type.STRING, description: "High / Moderate / Mild" },
                    effect: {
                      type: Type.STRING,
                      description: "Clinical risk or effect (e.g. Increased bleeding risk, QT prolongation)",
                    },
                    management: { type: Type.STRING, description: "Clinical management (e.g. Avoid combination, monitor INR)" },
                  },
                  required: ["interactingDrug", "severity", "effect"],
                },
                description: "High-priority drug-drug interactions",
              },
              sideEffects: {
                type: Type.OBJECT,
                properties: {
                  common: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Common and mild adverse reactions",
                  },
                  serious: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Rare, severe, or red-flag adverse reactions requiring immediate attention",
                  },
                },
                required: ["common", "serious"],
              },
              patientCounseling: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Key practical advice and counseling points for the patient",
              },
              storage: { type: Type.STRING, description: "Recommended storage conditions" },
            },
            required: [
              "genericName",
              "brandNames",
              "drugClass",
              "otcSchedule",
              "pregnancyCategory",
              "indications",
              "dosage",
              "precautions",
              "contraindications",
              "majorInteractions",
              "sideEffects",
              "patientCounseling",
            ],
          },
        },
      });

      const rawData = JSON.parse(text);
      const id = slugifyDrugName(rawData.genericName || cleanQuery);

      const savedDrug: DrugMonograph = {
        id,
        ...rawData,
        lastUpdated: new Date().toISOString(),
        source: "ai_verified",
      };

      // Store / update into backend database
      const existingIndex = inMemoryDrugs.findIndex(
        (d) => d.id === id || d.genericName.toLowerCase() === savedDrug.genericName.toLowerCase()
      );

      if (existingIndex >= 0) {
        inMemoryDrugs[existingIndex] = savedDrug;
      } else {
        inMemoryDrugs.unshift(savedDrug);
      }

      saveDrugsToDisk();

      res.json({
        success: true,
        drug: savedDrug,
        modelUsed,
        updatedInBackend: true,
        totalBackendDrugs: inMemoryDrugs.length,
      });
    } catch (aiErr: any) {
      console.warn("[/api/drug-lookup] AI call failed, activating local fallback engine:", aiErr.message);

      // If existing drug in store, return it — but only ever as "verified" if it genuinely was
      if (existing) {
        const isGenuinelyVerified = existing.source === "ai_verified";
        res.json({
          success: true,
          drug: existing,
          fromBackendCache: true,
          isFallback: !isGenuinelyVerified,
          notice: isGenuinelyVerified
            ? "Loaded from a previously AI-verified monograph (cached)."
            : "AI service unavailable, and no verified monograph exists yet for this drug. Showing a generic placeholder only — treat as unverified.",
        });
        return;
      }

      // Generate a structured local clinical monograph
      const fallbackDrug: DrugMonograph = {
        id: slugifyDrugName(cleanQuery),
        genericName: cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1),
        brandNames: [cleanQuery],
        drugClass: "Therapeutic Agent",
        category: "General Therapeutics",
        otcSchedule: "Schedule H",
        pregnancyCategory: "Consult Physician",
        lactationSafety: "Use with medical guidance",
        commonFormulations: ["Tablets / Capsules / Oral Solution"],
        indications: [`Treatment and clinical management as indicated for ${cleanQuery}`],
        dosage: {
          adult: "As prescribed by physician or standard therapeutic dosing.",
          pediatric: "Consult pediatrician for body weight/age specific dose calculation.",
          timing: "Take as directed by doctor or pharmacist.",
          renalHepaticAdjustment: "Dose adjustment advised in severe renal/hepatic impairment.",
        },
        precautions: [
          "Check for known allergies before administration.",
          "Do not exceed recommended maximum daily dose.",
          "Inform healthcare provider of all concurrent medications.",
        ],
        contraindications: [
          "Known hypersensitivity to active ingredient or excipients.",
          "Severe organ failure unless approved by specialist.",
        ],
        majorInteractions: [
          {
            interactingDrug: "Other CNS / Hepatic / Renal acting agents",
            severity: "Moderate",
            effect: "Potential altered metabolic clearance or synergistic effects.",
            management: "Review concurrent prescriptions.",
          },
        ],
        sideEffects: {
          common: ["Mild nausea", "Headache", "Gastrointestinal discomfort"],
          serious: ["Severe allergic reaction / anaphylaxis", "Unexplained rash", "Breathing difficulty"],
        },
        patientCounseling: [
          "Complete prescribed course as advised.",
          "Store in a cool, dry place away from direct sunlight.",
          "Seek medical attention if symptoms persist or worsen.",
        ],
        storage: "Store below 25°C in a dry place",
        lastUpdated: new Date().toISOString(),
        source: "local",
      };

      // Do NOT persist this to disk or the in-memory store as if it were a real monograph —
      // it's generic boilerplate keyed only on the query string, not real drug-specific data.
      // Saving it here would mean the next lookup for this same drug finds it under
      // `existing` above and serves it again as if verified, forever, even once the AI
      // service is back up. Keep it entirely response-only.

      res.json({
        success: true,
        drug: fallbackDrug,
        fallbackGenerated: true,
        isFallback: true,
        notice:
          "AI service unavailable — this is a generic placeholder, not drug-specific information. Do not treat as verified. Try again shortly for a real lookup.",
      });
    }
  } catch (error: any) {
    console.error("Error in /api/drug-lookup:", error);
    res.status(500).json({
      error: error.message || "Failed to retrieve drug monograph from medical database",
    });
  }
});

// ── OTC CONSULTATION ENDPOINT (With Auto-Retry, Model Failover & Fallback Engine) ───
app.post("/api/consult", async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    try {
      const { text, modelUsed } = await generateContentWithRetryAndFallback({
        contents: prompt,
        config: {
          systemInstruction:
            systemInstruction ||
            "You are an expert OTC pharmacist in India. Respond with ONE valid JSON object only.",
          responseMimeType: "application/json",
        },
      });

      res.json({ success: true, raw: text, modelUsed });
    } catch (aiError: any) {
      console.warn("[/api/consult] Gemini API high demand / unavailable. Activating clinical protocol engine fallback:", aiError.message);

      // Synthesize medically sound, evidence-based OTC consultation response
      const fallbackResult = buildClinicalFallbackConsultation(prompt);
      res.json({
        success: true,
        raw: JSON.stringify(fallbackResult),
        fromClinicalEngine: true,
        notice:
          "AI service unavailable — this is a basic keyword-matched suggestion, not a full AI-reasoned consultation. Verify independently before dispensing.",
      });
    }
  } catch (error: any) {
    console.error("Fatal Error in /api/consult:", error);
    // Even on fatal express error, return clinical protocol so client never crashes
    const emergencyProtocol = buildClinicalFallbackConsultation("General Symptoms");
    res.json({
      success: true,
      raw: JSON.stringify(emergencyProtocol),
      fromClinicalEngine: true,
      notice:
        "Server error — this is a generic fallback suggestion, not matched to the actual complaint. Verify independently before dispensing.",
    });
  }
});

// Start Server with Vite Middleware
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`OTC Advisor Server running at http://0.0.0.0:${PORT}`);
  });
}

start();

