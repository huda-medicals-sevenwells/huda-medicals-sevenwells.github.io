import React from "react";
import { DispenseBrand, AIResult, SubRxStep } from "../types";
import { Pill, Sparkles, RefreshCw, AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

interface DispenseViewProps {
  currentStep: SubRxStep;
  onSetStep: (step: SubRxStep) => void;
  result1: AIResult | null;
  result2: AIResult | null;
  result3: AIResult | null;
  step1Submitted: boolean;
  step2Submitted: boolean;
  step3Submitted: boolean;
  loading1: boolean;
  loading2: boolean;
  loading3: boolean;
  onGoToAdvice: () => void;
  onGoToConsult: () => void;
  onRetry: () => void;
}

export const DispenseView: React.FC<DispenseViewProps> = ({
  currentStep,
  onSetStep,
  result1,
  result2,
  result3,
  step1Submitted,
  step2Submitted,
  step3Submitted,
  loading1,
  loading2,
  loading3,
  onGoToAdvice,
  onGoToConsult,
  onRetry,
}) => {
  const getActiveData = () => {
    if (currentStep === "dispense") {
      return { result: result1, submitted: step1Submitted, loading: loading1, label: "Step 1 (Complaints Only)" };
    }
    if (currentStep === "verify") {
      return { result: result2, submitted: step2Submitted, loading: loading2, label: "Step 2 (Age & Gender Refined)" };
    }
    return { result: result3, submitted: step3Submitted, loading: loading3, label: "Step 3 (Full Clinical Context)" };
  };

  const { result, submitted, loading, label } = getActiveData();

  const renderDispenseCard = (b: DispenseBrand, isSubstitute: boolean) => {
    const isSub = isSubstitute;
    const bgTile = isSub
      ? "bg-slate-900 text-slate-100 border border-slate-800"
      : "bg-indigo-900 text-white border border-indigo-800";
    const accentTag = isSub ? "text-indigo-300" : "text-indigo-200";

    return (
      <div
        key={b.brand}
        className={`${bgTile} rounded-2xl p-6 shadow-lg flex flex-col justify-between space-y-4 relative overflow-hidden`}
      >
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] uppercase font-extrabold tracking-wider ${accentTag}`}>
              {isSub ? "🔄 Clinical Alternative" : "⭐ Recommended Primary Medicine"}
            </span>
            {b.in_stock === false ? (
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-400/30 px-2 py-0.5 rounded-full font-bold">
                Not In Stock
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                In Stock
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">{b.brand}</h3>
              {b.company && <div className="text-xs text-white/60 font-medium mt-0.5">{b.company}</div>}
              {(b.generic || b.strength || b.formulation) && (
                <div className="text-xs text-indigo-200/80 font-medium mt-1">
                  {[b.generic, b.strength, b.formulation].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            {b.mrp && (
              <div className="bg-white/10 border border-white/20 px-3 py-1.5 rounded-xl text-center shrink-0">
                <span className="text-[9px] uppercase font-bold text-white/60 block">MRP</span>
                <span className="text-sm font-black text-amber-300">{b.mrp}</span>
              </div>
            )}
          </div>

          {/* Interaction Alert Banner if present */}
          {b.interaction_flag && (
            <div className="bg-rose-950/80 border border-rose-500/50 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-300 block text-[11px] uppercase tracking-wider">Interaction Warning</strong>
                <span>{b.interaction_flag}</span>
              </div>
            </div>
          )}

          {/* Clinical Reason if substitute */}
          {b.why && (
            <div className="text-xs text-indigo-200 bg-white/5 border border-white/10 p-3 rounded-xl">
              <strong>Clinical Rationale:</strong> {b.why}
            </div>
          )}

          {/* Dose and Qty Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            {b.dose && (
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold uppercase text-white/50 block">Dosage &amp; Timing</span>
                <span className="font-extrabold text-white text-xs">{b.dose}</span>
              </div>
            )}

            {b.duration && (
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold uppercase text-white/50 block">Course Duration</span>
                <span className="font-extrabold text-white text-xs">{b.duration}</span>
              </div>
            )}

            {b.qty && (
              <div className="col-span-2 bg-white/10 p-2.5 rounded-xl border border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-white/60">Dispense Pack Size</span>
                <span className="font-extrabold text-amber-300">{b.qty}</span>
              </div>
            )}
          </div>

          {/* Sub-Brands / Alternate Brands */}
          {b.altBrands && b.altBrands.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                Equivalent Formulations
              </div>
              <div className="space-y-1">
                {b.altBrands.map((alt) => (
                  <div
                    key={alt.brand}
                    className="flex items-center justify-between bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-bold text-white/90">{alt.brand}</span>
                      {alt.company && <span className="text-white/40 text-[10px] ml-2">({alt.company})</span>}
                    </div>
                    {alt.mrp && <span className="text-amber-300/90 font-bold text-xs">{alt.mrp}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-700/30 rounded-full blur-3xl pointer-events-none"></div>
      </div>
    );
  };

  return (
    <div id="dispenseViewContainer" className="space-y-4">
      {/* Sub-Step Selector Strip */}
      <div className="bg-white border-b border-slate-200 text-slate-700 flex items-center px-4 sm:px-6 gap-2 sticky top-12 z-30 shadow-2xs">
        {[
          { id: "dispense" as SubRxStep, label: "Step 1: Complaints Intake", ready: step1Submitted },
          { id: "verify" as SubRxStep, label: "Step 2: Demographics Refined", ready: step2Submitted },
          { id: "label" as SubRxStep, label: "Step 3: Full Context Matrix", ready: step3Submitted },
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

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        {/* Loading State */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="text-sm font-extrabold text-slate-900">Formulating Clinical Dispense Matrix...</div>
            <p className="text-xs text-slate-500 font-medium">Checking drug-drug interactions, dosage rules, and regional pharmacy availability</p>
          </div>
        )}

        {/* Not Started State */}
        {!submitted && !loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3 shadow-xs">
            <Pill className="w-12 h-12 text-slate-300 mx-auto stroke-1" />
            <h3 className="text-base font-extrabold text-slate-800">Consultation not started</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto font-medium">
              Select symptoms in the Consult Patient tab to generate evidence-based OTC dispense recommendations.
            </p>
            <button
              onClick={onGoToConsult}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              ← Go to Consult Patient
            </button>
          </div>
        )}

        {/* Error State */}
        {result?.error && !loading && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-800 space-y-3 shadow-xs">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Generation failed</span>
            </div>
            <p className="text-xs">{result.error}</p>
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Result Cards */}
        {result && !result.error && !loading && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {result._isFallback && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm text-amber-900">Not an AI-reasoned result</div>
                  <p className="text-xs text-amber-800 mt-1">
                    {result._fallbackNotice ||
                      "The AI service was unavailable. This is a basic rule-based suggestion — verify independently before dispensing."}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
              <span>{label}</span>
              <span
                className={
                  result._isFallback
                    ? "text-amber-600 font-bold uppercase tracking-wider"
                    : "text-indigo-600 font-bold uppercase tracking-wider"
                }
              >
                {result._isFallback ? "Rule-Based Fallback — Not AI" : "Evidence-Based Clinical Protocol"}
              </span>
            </div>

            {/* Primary & Substitute Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.brands && result.brands.map((b) => renderDispenseCard(b, false))}
              {result.substituteMedicine && renderDispenseCard(result.substituteMedicine, true)}
            </div>

            {/* Supportive Care Section (Bento Tile) */}
            {result.supportiveProducts && result.supportiveProducts.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                  <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">Supportive &amp; Adjunct Care</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.supportiveProducts.map((s, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-extrabold text-sm">{s.brand}</strong>
                        {s.mrp && <span className="text-amber-700 font-black">{s.mrp}</span>}
                      </div>
                      <div className="text-slate-600 font-medium leading-relaxed">{s.reason}</div>
                      <div className="text-slate-400 text-[11px]">{[s.dose, s.duration].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Wellness Section (Bento Tile) */}
            {result.wellnessProducts && result.wellnessProducts.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
                  <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">Preventive &amp; General Wellness</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.wellnessProducts.map((w, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-900 font-extrabold text-sm">{w.brand}</strong>
                        {w.mrp && <span className="text-amber-700 font-black">{w.mrp}</span>}
                      </div>
                      <div className="text-slate-600 font-medium leading-relaxed">{w.reason}</div>
                      <div className="text-slate-400 text-[11px]">{[w.dose, w.duration].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Go to Patient Advice Button */}
            <button
              onClick={onGoToAdvice}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
            >
              <span>View Patient Counseling Labels &amp; Warnings →</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
