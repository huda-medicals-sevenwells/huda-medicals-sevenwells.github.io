export interface DrugInteraction {
  interactingDrug: string;
  severity: "High" | "Moderate" | "Mild" | string;
  effect: string;
  management?: string;
}

export interface DrugDosage {
  adult: string;
  pediatric?: string;
  timing: string;
  renalHepaticAdjustment?: string;
}

export interface DrugSideEffects {
  common: string[];
  serious: string[];
}

export interface DrugMonograph {
  id?: string;
  genericName: string;
  brandNames: string[];
  drugClass: string;
  category?: string;
  otcSchedule?: string;
  pregnancyCategory?: string;
  lactationSafety?: string;
  commonFormulations?: string[];
  indications?: string[];
  dosage?: DrugDosage;
  precautions?: string[];
  contraindications?: string[];
  majorInteractions?: DrugInteraction[];
  sideEffects?: DrugSideEffects;
  patientCounseling?: string[];
  storage?: string;
  lastUpdated?: string;
  source?: "local" | "ai_verified" | "custom" | "basic_index";
  isBasicOnly?: boolean;
}

export interface AltBrand {
  brand: string;
  company?: string;
  mrp?: string;
}

export interface DispenseBrand {
  brand: string;
  strength?: string;
  formulation?: string;
  generic?: string;
  company?: string;
  dose?: string;
  duration?: string;
  qty?: string;
  mrp?: string;
  route?: string;
  food_interaction?: string;
  counsel?: string;
  pregnancy_safe?: string;
  otc_schedule?: string;
  in_stock?: boolean;
  interaction_flag?: string | null;
  altBrands?: AltBrand[];
  why?: string;
  forBrandIndex?: number;
  reason?: string;
  _cardType?: "main" | "subBrand" | "subMed" | "supportive" | "wellness";
  _kind?: "main" | "sub" | "supportive" | "wellness";
}

export interface SupportiveProduct {
  brand: string;
  strength?: string;
  formulation?: string;
  company?: string;
  dose?: string;
  duration?: string;
  qty?: string;
  mrp?: string;
  reason?: string;
  in_stock?: boolean;
}

export interface WellnessProduct {
  brand: string;
  formulation?: string;
  dose?: string;
  duration?: string;
  qty?: string;
  mrp?: string;
  reason?: string;
  in_stock?: boolean;
}

export interface AIResult {
  strategy?: "single" | "either" | "together" | string;
  brands: DispenseBrand[];
  substituteBrand?: DispenseBrand | null;
  substituteMedicine?: DispenseBrand | null;
  supportiveProducts?: SupportiveProduct[];
  wellnessProducts?: WellnessProduct[];
  error?: string;
  _truncated?: boolean;
  _isFallback?: boolean;
  _fallbackNotice?: string;
}

export interface HistoryItem {
  id: number;
  num: number;
  date: string;
  time: string;
  age: string;
  gender: string;
  complaints: string;
  result: AIResult;
}

export interface TokenStats {
  sessionIn: number;
  sessionOut: number;
  calls: Array<{
    label: string;
    in: number;
    out: number;
    ts: number;
  }>;
}

export type MainTab = "consult" | "rx" | "counsel";
export type SubRxStep = "dispense" | "verify" | "label";
export type AdviceSubTab = "patient" | "pharmacist";
export type PanelType = "menu" | "history" | "settings" | "about" | "stocklist" | "sysprompt" | null;
