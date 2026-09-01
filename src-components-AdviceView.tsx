import React, { useState } from "react";
import { AIResult, AdviceSubTab, SubRxStep, DispenseBrand } from "../types";
import { Printer, RotateCcw, AlertTriangle, ShieldCheck, Clock, Utensils, AlertCircle } from "lucide-react";

interface AdviceViewProps {
  currentStep: SubRxStep;
  onSetStep: (step: SubRxStep) => void;
  result1: AIResult | null;
  result2: AIResult | null;
  result3: AIResult | null;
  step1Submitted: boolean;
  step2Submitted: boolean;
  step3Submitted: boolean;
  age: string;
  gender: string;
  complaints: string[];
  patientNumber?: number;
  onNewConsultation: () => void;
}

function humanizeDose(s?: string): string {
  if (!s) return "";
  return String(s)
    .replace(/\bOD\b/gi, "once a day")
    .replace(/\bBD\b/gi, "twice a day")
    .replace(/\bTDS\b/gi, "3 times a day")
    .replace(/\bQID\b/gi, "4 times a day")
    .replace(/\bHS\b/gi, "at bedtime")
    .replace(/\b(SOS|PRN)\b/gi, "as needed")
    .replace(/\bstat\b/gi, "right away, once");
}

export const AdviceView: React.FC<AdviceViewProps> = ({
  currentStep,
  onSetStep,
  result1,
  result2,
  result3,
  step1Submitted,
  step2Submitted,
  step3Submitted,
  age,
  gender,
  complaints,
  patientNumber,
  onNewConsultation,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AdviceSubTab>("patient");
  const [deletedItems, setDeletedItems] = useState<string[]>([]);

  const getActiveResult = () => {
    if (currentStep === "dispense") return result1;
    if (currentStep === "verify") return result2;
    return result3 || result2 || result1;
  };

  const activeResult = getActiveResult();

  const allItems: Array<DispenseBrand & { _kind: "main" | "sub" | "supportive" | "wellness" }> = [];
  if (activeResult && !activeResult.error) {
    if (activeResult.brands) {
      activeResult.brands.forEach((b) => allItems.push({ ...b, _kind: "main" }));
    }
    if (activeResult.substituteMedicine) {
      allItems.push({ ...activeResult.substituteMedicine, _kind: "sub" });
    }
    if (activeResult.supportiveProducts) {
      activeResult.supportiveProducts.forEach((s) => allItems.push({ ...s, _kind: "supportive" }));
    }
    if (activeResult.wellnessProducts) {
      activeResult.wellnessProducts.forEach((w) => allItems.push({ ...w, _kind: "wellness" }));
    }
  }

  const visibleItems = allItems.filter((it) => !deletedItems.includes(it.brand));

  const printLabels = () => {
    const printEl = document.getElementById("printable-patient-labels");
    if (!printEl) return;

    const win = window.open("", "_blank", "width=480,height=700");
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Patient Drug Labels - OTC Advisor</title>
  <style>
    body { font-family: sans-serif; padding: 16px; margin: 0; background: #fff; color: #111; }
    .label-card { border: 1.5px solid #000; border-left: 6px solid #0d9488; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .brand-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
    .inst { font-size: 14px; margin-top: 6px; }
    .delete-btn { display: none; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div style="font-size:12px;font-weight:bold;margin-bottom:12px;border-bottom:1px solid #ccc;padding-bottom:6px">
    Huda Medical · Patient Advice Sheet | Patient: ${age || "Adult"} ${gender || ""} | Complaints: ${complaints.join(", ")}
  </div>
  ${printEl.innerHTML}
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div id="adviceViewContainer" className="space-y-4">
      {/* Sub-step selector */}
      <div className="bg-white border-b border-slate-200 text-slate-700 flex items-center px-4 sm:px-6 gap-2 sticky top-12 z-30 shadow-2xs">
        {[
          { id: "dispense" as SubRxStep, label: "Step 1: Intake", ready: step1Submitted },
          { id: "verify" as SubRxStep, label: "Step 2: Profile", ready: step2Submitted },
          { id: "label" as SubRxStep, label: "Step 3: Full Context", ready: step3Submitted },
        ].map((s) => {
          const isActive = currentStep === s.id;
          return (
            <button
              key={s.id}
              onClick={() => s.ready && onSetStep(s.id)}
              disabled={!s.ready}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-all ${
                isActive
                  ? "border-indigo-600 text-indigo-600 bg-indigo-50/50 font-extrabold"
                  : s.ready
                  ? "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  : "border-transparent text-slate-300 cursor-not-allowed"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Main Tab Switch: Patient Guide vs Pharmacist Cautions */}
      <div className="max-w-2xl mx-auto px-4 pt-1">
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200 text-xs font-bold shadow-2xs">
          <button
            onClick={() => setActiveSubTab("patient")}
            className={`flex-1 py-2.5 rounded-lg text-center transition-all ${
              activeSubTab === "patient" ? "bg-slate-900 text-white shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            👤 Patient Instructions &amp; Sticker Labels
          </button>
          <button
            onClick={() => setActiveSubTab("pharmacist")}
            className={`flex-1 py-2.5 rounded-lg text-center transition-all ${
              activeSubTab === "pharmacist" ? "bg-slate-900 text-white shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            💊 Pharmacist Clinical Cautions
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
        {activeResult && !activeResult.error && activeResult._isFallback && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-amber-900">Not an AI-reasoned result</div>
              <p className="text-xs text-amber-800 mt-1">
                {activeResult._fallbackNotice ||
                  "The AI service was unavailable. This is a basic rule-based suggestion — verify independently before dispensing."}
              </p>
            </div>
          </div>
        )}
        {!activeResult || activeResult.error ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3 shadow-xs">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <h3 className="text-base font-extrabold text-slate-800">No Advice Generated Yet</h3>
            <p className="text-xs text-slate-500 font-medium">Complete the consultation steps and check the Dispense tab.</p>
          </div>
        ) : activeSubTab === "patient" ? (
          /* ── PATIENT INSTRUCTIONS TAB ──────────────────────────────────── */
          <div className="space-y-4">
            {/* Header with Print & Reset */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-900 uppercase tracking-wider">
                🏷️ Patient Dosage Sticker Labels
              </span>
              <div className="flex items-center gap-2">
                {deletedItems.length > 0 && (
                  <button
                    onClick={() => setDeletedItems([])}
                    className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-semibold underline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset ({deletedItems.length} removed)</span>
                  </button>
                )}
                <button
                  onClick={printLabels}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Labels</span>
                </button>
              </div>
            </div>

            {/* Patient Demographic Banner */}
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xs border border-slate-800">
              <div>
                <div className="text-xs font-extrabold text-indigo-300">{[age, gender].filter(Boolean).join(" · ")}</div>
                <div className="text-xs text-white/70 font-medium mt-0.5">{complaints.join(", ")}</div>
              </div>
              {patientNumber && (
                <div className="bg-white/10 text-white font-extrabold text-xs px-3 py-1 rounded-xl border border-white/15">
                  P{String(patientNumber).padStart(3, "0")}
                </div>
              )}
            </div>

            {/* Printable Labels List */}
            <div id="printable-patient-labels" className="space-y-3">
              {visibleItems.length === 0 ? (
                <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs shadow-xs">
                  All items removed from this label.
                </div>
              ) : (
                visibleItems.map((it) => {
                  const humanDose = humanizeDose(it.dose);
                  const timingLine = [humanDose, it.duration ? `for ${it.duration}` : ""].filter(Boolean).join(", ");
                  const accentBadge =
                    it._kind === "sub"
                      ? "bg-slate-800 text-indigo-300"
                      : it._kind === "supportive"
                      ? "bg-slate-800 text-emerald-300"
                      : "bg-slate-800 text-amber-300";

                  return (
                    <div
                      key={it.brand}
                      className="relative rounded-2xl p-5 border border-slate-800 bg-slate-900 shadow-md text-white space-y-3"
                    >
                      <button
                        onClick={() => setDeletedItems((prev) => [...prev, it.brand])}
                        className="delete-btn absolute right-3 top-3 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center text-xs"
                        title="Remove from print label"
                      >
                        ✕
                      </button>

                      <div className="pr-8">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xl font-extrabold tracking-tight text-white">{it.brand}</h4>
                          {it._kind === "sub" && (
                            <span className="text-[9px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md uppercase">
                              Alternative
                            </span>
                          )}
                          {it._kind === "supportive" && (
                            <span className="text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase">
                              Supportive
                            </span>
                          )}
                        </div>

                        {it.qty && <div className="text-xs text-amber-300 font-bold mt-0.5">{it.qty}</div>}

                        <div className="mt-3.5 space-y-2 text-xs">
                          {timingLine && (
                            <div className="flex items-start gap-2 text-white">
                              <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                              <span className="font-bold text-sm text-indigo-100">{timingLine}</span>
                            </div>
                          )}

                          {it.route && (
                            <div className="flex items-start gap-2 text-white/80 font-medium">
                              <span className="text-indigo-300">💊</span>
                              <span>{it.route}</span>
                            </div>
                          )}

                          {it.food_interaction && (
                            <div className="flex items-start gap-2 text-white/80 font-medium">
                              <Utensils className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                              <span>{it.food_interaction}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={onNewConsultation}
              className="w-full py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 rounded-2xl font-extrabold text-xs transition-all shadow-xs"
            >
              + Start New Patient Consultation
            </button>
          </div>
        ) : (
          /* ── PHARMACIST CAUTIONS TAB ───────────────────────────────────── */
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
              ⚠️ Pharmacist Clinical Warnings &amp; Legal Schedules
            </div>

            {allItems.map((it) => (
              <div key={it.brand} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-lg font-extrabold tracking-tight text-slate-900">{it.brand}</h4>
                    {(it.generic || it.strength) && (
                      <div className="text-xs text-slate-500 font-medium">
                        {[it.generic, it.strength].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  {it.mrp && <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">{it.mrp}</span>}
                </div>

                {/* Interaction Alert */}
                {it.interaction_flag && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-rose-700 uppercase font-extrabold text-[10px]">Interaction Alert</strong>
                      <span className="font-medium">{it.interaction_flag}</span>
                    </div>
                  </div>
                )}

                {/* Regulatory and Safety Badges */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {it.pregnancy_safe && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Pregnancy Safety</span>
                      <span className="font-extrabold text-slate-800">{it.pregnancy_safe}</span>
                    </div>
                  )}

                  {it.otc_schedule && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Legal Schedule</span>
                      <span className="font-extrabold text-slate-800">{it.otc_schedule}</span>
                    </div>
                  )}
                </div>

                {/* Caution Sentence */}
                {it.counsel && (
                  <div className="bg-amber-50/60 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-950 space-y-1">
                    <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Clinical Caution</span>
                    </div>
                    <p className="leading-relaxed font-medium">{it.counsel}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
