import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { ConsultView } from "./components/ConsultView";
import { DispenseView } from "./components/DispenseView";
import { AdviceView } from "./components/AdviceView";
import { Panels } from "./components/Panels";
import { LocationModal } from "./components/LocationModal";
import { DrugSearchModal } from "./components/DrugSearchModal";
import { MainTab, SubRxStep, PanelType, AIResult, HistoryItem, TokenStats } from "./types";
import { INSTANT_ANSWERS } from "./components/ConsultView";

const DEFAULT_SYSTEM_PROMPT = `You are an expert OTC pharmacist in India. Respond with ONE valid JSON object only. No markdown, no backticks, no explanation. Start immediately with {.

Return ONLY this JSON:
{"strategy":"single",
"brands":[{
"brand":"BrandName","strength":"500mg","formulation":"Tablet","generic":"INN name","company":"Manufacturer",
"dose":"1 Tab TDS","duration":"5 days",
"qty":"15 Tablets","mrp":"₹27","route":"Oral after food",
"food_interaction":"With food","counsel":"1 sentence: main warning only.",
"pregnancy_safe":"Safe/Avoid/Consult","otc_schedule":"OTC/Schedule H/H1","in_stock":true,"interaction_flag":null,
"altBrands":[{"brand":"Alt1","company":"Mfr1","mrp":"₹X"},{"brand":"Alt2","company":"Mfr2","mrp":"₹X"}]
}],
"substituteMedicine":{"forBrandIndex":0,"brand":"Brand","strength":"Str","formulation":"Form","generic":"INN","company":"Mfr","dose":"Dose","duration":"Dur","qty":"Qty","mrp":"₹X","why":"Short reason.","route":"Route","food_interaction":"Note","counsel":"1 sentence warning.","pregnancy_safe":"Safe/Avoid/Consult","otc_schedule":"Schedule","in_stock":true,"interaction_flag":null,"altBrands":[{"brand":"S1","company":"M1","mrp":"₹X"},{"brand":"S2","company":"M2","mrp":"₹X"}]},
"supportiveProducts":[{"brand":"Brand","strength":"Str","formulation":"Form","company":"Mfr","dose":"Dose","duration":"Dur","qty":"Qty","mrp":"₹X","reason":"Why this helps THIS case, 1 short phrase.","in_stock":true}],
"wellnessProducts":[{"brand":"Brand","formulation":"Form","dose":"Dose","duration":"Dur","qty":"Qty","mrp":"₹X","reason":"Generic, honest reason — general wellness, not tied to this complaint.","in_stock":true}]}

RULES:
- Indian brands only (Mankind, Cipla, Alkem, Torrent, Intas, Zydus, Macleods, FDC, Lupin, Sun, Ipca, Alembic, Micro Labs).
- substituteMedicine: DIFFERENT molecule treating SAME complaint. Null if none.
- substituteMedicine.forBrandIndex: 0-based index of brand it replaces.
- altBrands: same molecule, different brand only — include realistic MRP for same qty.
- supportiveProducts: adjunct/supportive items — genuinely useful alongside it for THIS specific case (e.g. steam capsule, ORS).
- wellnessProducts: general preventive/wellness items.
- qty: dose × freq × days. mrp: realistic Indian MRP for that exact qty with ₹.
- counsel: 1 concise sentence with avoid/do not/monitor/consult.
- For Diabetes: sugar-free only. Hypertension: flag NSAIDs. Pregnancy: avoid NSAIDs/aspirin. Kidney: no NSAIDs.
- If Weight (kg) is given: calculate pediatric dose by weight (mg/kg).
- If Current Medications given: check each recommended brand for real drug interaction. If found, set interaction_flag.
- Start response with { immediately.`;

export default function App() {
  // Navigation & View States
  const [mainTab, setMainTab] = useState<MainTab>("consult");
  const [subRxStep, setSubRxStep] = useState<SubRxStep>("dispense");
  const [slide, setSlide] = useState(0);
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isDrugSearchOpen, setIsDrugSearchOpen] = useState(false);

  // Patient inputs
  const [selectedComplaints, setSelectedComplaints] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weight, setWeight] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [currentMeds, setCurrentMeds] = useState("");
  const [sortAlpha, setSortAlpha] = useState(false);
  const [location, setLocation] = useState("Detecting…");

  // Step submissions & Loading
  const [step1Submitted, setStep1Submitted] = useState(false);
  const [step2Submitted, setStep2Submitted] = useState(false);
  const [step3Submitted, setStep3Submitted] = useState(false);

  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [loading3, setLoading3] = useState(false);

  // AI Results for 3 steps
  const [result1, setResult1] = useState<AIResult | null>(null);
  const [result2, setResult2] = useState<AIResult | null>(null);
  const [result3, setResult3] = useState<AIResult | null>(null);

  // Settings and History
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem("otc_history_v2");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [stockList, setStockList] = useState(() => {
    return localStorage.getItem("otc_stock_list_v2") || "";
  });

  const [stockUrl, setStockUrl] = useState(() => {
    return localStorage.getItem("otc_stock_url_v2") || "";
  });

  const [stockUrlStatus, setStockUrlStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [stockUrlCount, setStockUrlCount] = useState(0);

  const [systemPrompt, setSystemPrompt] = useState(() => {
    return localStorage.getItem("otc_system_prompt_v2") || DEFAULT_SYSTEM_PROMPT;
  });

  const [aiProvider, setAiProvider] = useState<"gemini" | "claude">(() => {
    return (localStorage.getItem("otc_ai_provider_v2") as "gemini" | "claude") || "gemini";
  });

  const [claudeKey, setClaudeKey] = useState(() => {
    return localStorage.getItem("otc_claude_key_v2") || "";
  });

  const [geminiKey, setGeminiKey] = useState(() => {
    return localStorage.getItem("otc_gemini_key_v2") || "";
  });

  const [tokenStats, setTokenStats] = useState<TokenStats>({
    sessionIn: 0,
    sessionOut: 0,
    calls: [],
  });

  const [isSavedInHistory, setIsSavedInHistory] = useState(false);
  const [patientNumber, setPatientNumber] = useState<number | undefined>(undefined);

  // Auto-detect GPS location once on mount
  useEffect(() => {
    const savedLoc = localStorage.getItem("otc_location_v2");
    if (savedLoc) {
      setLocation(savedLoc);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude.toFixed(4);
          const lon = pos.coords.longitude.toFixed(4);
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
            const d = await res.json();
            const addr = d.address || {};
            const locName = addr.suburb || addr.neighbourhood || addr.city || addr.county || `${lat}, ${lon}`;
            setLocation(locName);
            localStorage.setItem("otc_location_v2", locName);
          } catch {
            setLocation(`${lat}, ${lon}`);
          }
        },
        () => {
          setLocation("India");
        },
        { timeout: 6000 }
      );
    } else {
      setLocation("India");
    }
  }, []);

  // Auto-load stock list from URL if configured
  const loadStockFromUrl = useCallback(async (url: string) => {
    if (!url.trim()) return;
    setStockUrlStatus("loading");
    try {
      const res = await fetch(url.trim() + (url.includes("?") ? "&_=" : "?_=") + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      let list: string[] = [];

      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          list = parsed
            .map((item) => {
              if (typeof item === "string") return item;
              if (item && item.name) return item.price ? `${item.name} — ${item.price}` : item.name;
              return null;
            })
            .filter(Boolean) as string[];
        }
      } catch {
        list = text.split("\n").map((s) => s.trim()).filter(Boolean);
      }

      if (list.length > 0) {
        const joined = list.join("\n");
        setStockList(joined);
        setStockUrlStatus("ok");
        setStockUrlCount(list.length);
        localStorage.setItem("otc_stock_list_v2", joined);
      } else {
        setStockUrlStatus("error");
      }
    } catch {
      setStockUrlStatus("error");
    }
  }, []);

  useEffect(() => {
    if (stockUrl) {
      loadStockFromUrl(stockUrl);
    }
  }, [stockUrl, loadStockFromUrl]);

  // AI Pipeline Helper Call
  const executeAICall = async (userPrompt: string, stepLabel: string) => {
    let effectiveSystemPrompt = systemPrompt;
    if (stockList && stockList.trim()) {
      effectiveSystemPrompt += `\n\nPHARMACY STOCK LIST:\n${stockList.trim()}\nPrioritize stocked medicines where clinically appropriate and set in_stock: true.`;
    }

    try {
      if (aiProvider === "gemini") {
        const response = await fetch("/api/consult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userPrompt,
            systemInstruction: effectiveSystemPrompt,
          }),
        });

        const data = await response.json();
        if (!response.ok && !data.raw) {
          throw new Error(data.error || "Failed to generate recommendation");
        }

        if (data.raw) {
          const raw = data.raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
          const start = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          if (start !== -1 && end !== -1) {
            const parsed = JSON.parse(raw.substring(start, end + 1));
            if (data.fromClinicalEngine) {
              parsed._isFallback = true;
              parsed._fallbackNotice =
                data.notice ||
                "Basic rule-based suggestion — the AI service was unavailable. This was not reasoned about by AI. Verify independently before dispensing.";
            }
            return parsed;
          }
        }
        throw new Error(data.error || "Invalid response format from consultation engine");
      } else {
        // Claude Direct Call
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            ...(claudeKey ? { "x-api-key": claudeKey } : {}),
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1500,
            temperature: 0,
            system: effectiveSystemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Claude API Error");
        const raw = data.content?.[0]?.text?.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        return JSON.parse(raw.substring(start, end + 1));
      }
    } catch (err: any) {
      console.error(`AI ${stepLabel} error:`, err);
      // If single complaint matches INSTANT_ANSWERS, provide instant clinical answer
      for (const comp of selectedComplaints) {
        if (INSTANT_ANSWERS[comp]) {
          return INSTANT_ANSWERS[comp];
        }
      }
      return { error: err.message || "Temporary consultation service delay. Please retry." };
    }
  };

  // Run Step 1 (Complaints only)
  const runCall1 = async () => {
    setLoading1(true);
    const prompt = `Complaints: ${selectedComplaints.join(", ")}\nLocation: ${location}\nReturn JSON only. Start with { immediately.`;
    const res = await executeAICall(prompt, "Call 1");
    setResult1(res);
    setLoading1(false);
  };

  // Run Step 2 (Age + Gender)
  const runCall2 = async () => {
    setLoading2(true);
    const prompt = `Complaints: ${selectedComplaints.join(", ")}\nPatient: ${age}, ${gender}${
      weight.trim() ? `, Weight: ${weight.trim()}kg` : ""
    }\nLocation: ${location}\nReturn JSON only. Start with { immediately.`;
    const res = await executeAICall(prompt, "Call 2");
    setResult2(res);
    setLoading2(false);
  };

  // Run Step 3 (Conditions + Medications)
  const runCall3 = async () => {
    setLoading3(true);
    const condStr = conditions.length && !conditions.includes("None") ? conditions.join(", ") : "None";
    const prompt = `Complaints: ${selectedComplaints.join(", ")}\nPatient: ${age}, ${gender}${
      weight.trim() ? `, Weight: ${weight.trim()}kg` : ""
    }\nConditions: ${condStr}${
      currentMeds.trim() ? `\nCurrent Medications: ${currentMeds.trim()}` : ""
    }\nLocation: ${location}\nReturn JSON only. Start with { immediately.`;
    const res = await executeAICall(prompt, "Call 3");
    setResult3(res);
    setLoading3(false);
  };

  // Step transitions
  const handleNextStep = () => {
    if (slide === 0) {
      setStep1Submitted(true);
      setSlide(1);
      runCall1();
    } else if (slide === 1) {
      setStep2Submitted(true);
      setSlide(2);
      runCall2();
    } else if (slide === 2) {
      setStep3Submitted(true);
      setMainTab("rx");
      setSubRxStep("dispense");
      runCall3();
    }
  };

  const handlePrevStep = () => {
    if (slide > 0) setSlide(slide - 1);
  };

  const handleFireInstantAnswer = (complaint: string) => {
    const instant = INSTANT_ANSWERS[complaint];
    if (instant) {
      setStep1Submitted(true);
      setStep2Submitted(true);
      setStep3Submitted(true);
      setResult1(instant);
      setResult2(instant);
      setResult3(instant);
      setMainTab("rx");
      setSubRxStep("dispense");
    }
  };

  const handleSaveHistory = () => {
    const activeRes = result3 || result2 || result1;
    if (!activeRes || activeRes.error || isSavedInHistory) return;

    const newNum = history.length + 1;
    const now = new Date();
    const item: HistoryItem = {
      id: Date.now(),
      num: newNum,
      date: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      age: age || "Adult",
      gender: gender || "Unknown",
      complaints: selectedComplaints.join(", "),
      result: activeRes,
    };

    const updated = [item, ...history];
    setHistory(updated);
    setIsSavedInHistory(true);
    setPatientNumber(newNum);
    localStorage.setItem("otc_history_v2", JSON.stringify(updated));
  };

  const handleResetConsultation = () => {
    setSelectedComplaints([]);
    setAge("");
    setGender("");
    setWeight("");
    setConditions([]);
    setCurrentMeds("");
    setSlide(0);
    setStep1Submitted(false);
    setStep2Submitted(false);
    setStep3Submitted(false);
    setResult1(null);
    setResult2(null);
    setResult3(null);
    setIsSavedInHistory(false);
    setPatientNumber(undefined);
    setMainTab("consult");
    setSubRxStep("dispense");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <Header
        subTitle="Medical Reference & Dispense Guide"
        location={location}
        onOpenLocation={() => setIsLocationModalOpen(true)}
        onOpenDrugSearch={() => setIsDrugSearchOpen(true)}
        onOpenMenu={() => setActivePanel("menu")}
        onClosePanel={() => setActivePanel(null)}
        isPanelOpen={!!activePanel}
        canSaveHistory={mainTab === "rx" && !!(result3 || result2 || result1) && !(result3 || result2 || result1)?.error}
        isSaved={isSavedInHistory}
        onSaveHistory={handleSaveHistory}
      />

      {/* ── MAIN TAB NAVIGATION STRIP (Bento Style) ─────────────────────────── */}
      {!activePanel && (
        <div className="bg-white border-b border-slate-200 text-slate-600 flex items-center px-4 sm:px-6 gap-1 shadow-2xs">
          <button
            id="tabBtnConsult"
            onClick={() => setMainTab("consult")}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 rounded-t-md ${
              mainTab === "consult"
                ? "border-indigo-600 text-indigo-600 bg-indigo-50/50 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <span>Consult Patient</span>
          </button>

          <button
            id="tabBtnRx"
            onClick={() => setMainTab("rx")}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 rounded-t-md ${
              mainTab === "rx"
                ? "border-indigo-600 text-indigo-600 bg-indigo-50/50 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <span>Dispense Matrix</span>
            {loading1 || loading2 || loading3 ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            ) : result3 || result2 || result1 ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            ) : null}
          </button>

          <button
            id="tabBtnAdvice"
            onClick={() => {
              if (result3 || result2 || result1) setMainTab("counsel");
              else setMainTab("rx");
            }}
            disabled={!result1 && !result2 && !result3}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 rounded-t-md ${
              mainTab === "counsel"
                ? "border-indigo-600 text-indigo-600 bg-indigo-50/50 font-extrabold"
                : result1 || result2 || result3
                ? "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                : "border-transparent text-slate-300 cursor-not-allowed"
            }`}
          >
            <span>🏷️ Patient Labels &amp; Cautions</span>
          </button>
        </div>
      )}

      {/* ── BODY CONTENT AREA ────────────────────────────────────────────────── */}
      <main className="flex-1 pb-16">
        {activePanel ? (
          <Panels
            panel={activePanel}
            onClose={() => setActivePanel(null)}
            history={history}
            onDeleteHistoryItem={(id) => {
              const updated = history.filter((h) => h.id !== id);
              setHistory(updated);
              localStorage.setItem("otc_history_v2", JSON.stringify(updated));
            }}
            location={location}
            onSaveLocation={(l) => {
              setLocation(l);
              localStorage.setItem("otc_location_v2", l);
            }}
            onDetectGPS={() => {}}
            stockList={stockList}
            onSaveStockList={(list) => {
              setStockList(list);
              localStorage.setItem("otc_stock_list_v2", list);
            }}
            stockUrl={stockUrl}
            onSaveStockUrl={(url) => {
              setStockUrl(url);
              localStorage.setItem("otc_stock_url_v2", url);
              loadStockFromUrl(url);
            }}
            onRefreshStockUrl={() => loadStockFromUrl(stockUrl)}
            stockUrlStatus={stockUrlStatus}
            stockUrlCount={stockUrlCount}
            systemPrompt={systemPrompt}
            onSaveSystemPrompt={(p) => {
              setSystemPrompt(p);
              localStorage.setItem("otc_system_prompt_v2", p);
            }}
            onResetSystemPrompt={() => {
              setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
              localStorage.removeItem("otc_system_prompt_v2");
            }}
            aiProvider={aiProvider}
            onSetAiProvider={(prov) => {
              setAiProvider(prov);
              localStorage.setItem("otc_ai_provider_v2", prov);
            }}
            claudeKey={claudeKey}
            onSaveClaudeKey={(k) => {
              setClaudeKey(k);
              localStorage.setItem("otc_claude_key_v2", k);
            }}
            geminiKey={geminiKey}
            onSaveGeminiKey={(k) => {
              setGeminiKey(k);
              localStorage.setItem("otc_gemini_key_v2", k);
            }}
            onSelectPanel={setActivePanel}
          />
        ) : mainTab === "consult" ? (
          <ConsultView
            slide={slide}
            onSetSlide={setSlide}
            selectedComplaints={selectedComplaints}
            onToggleComplaint={(c) => {
              setSelectedComplaints((prev) =>
                prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
              );
            }}
            onAddCustomComplaint={(c) => {
              if (c && !selectedComplaints.includes(c)) {
                setSelectedComplaints((prev) => [...prev, c]);
              }
            }}
            age={age}
            gender={gender}
            onSelectAgeGender={(a, g) => {
              setAge(a);
              setGender(g);
            }}
            weight={weight}
            onSetWeight={setWeight}
            conditions={conditions}
            onToggleCondition={(cond) => {
              if (cond === "None") {
                setConditions(["None"]);
              } else {
                setConditions((prev) => {
                  const cleaned = prev.filter((x) => x !== "None");
                  return cleaned.includes(cond) ? cleaned.filter((x) => x !== cond) : [...cleaned, cond];
                });
              }
            }}
            currentMeds={currentMeds}
            onSetCurrentMeds={setCurrentMeds}
            sortAlpha={sortAlpha}
            onSetSortAlpha={setSortAlpha}
            onNextStep={handleNextStep}
            onPrevStep={handlePrevStep}
            onFireInstantAnswer={handleFireInstantAnswer}
            isLoading={loading1 || loading2 || loading3}
          />
        ) : mainTab === "rx" ? (
          <DispenseView
            currentStep={subRxStep}
            onSetStep={setSubRxStep}
            result1={result1}
            result2={result2}
            result3={result3}
            step1Submitted={step1Submitted}
            step2Submitted={step2Submitted}
            step3Submitted={step3Submitted}
            loading1={loading1}
            loading2={loading2}
            loading3={loading3}
            onGoToAdvice={() => setMainTab("counsel")}
            onGoToConsult={() => setMainTab("consult")}
            onRetry={() => {
              if (subRxStep === "dispense") runCall1();
              else if (subRxStep === "verify") runCall2();
              else runCall3();
            }}
          />
        ) : (
          <AdviceView
            currentStep={subRxStep}
            onSetStep={setSubRxStep}
            result1={result1}
            result2={result2}
            result3={result3}
            step1Submitted={step1Submitted}
            step2Submitted={step2Submitted}
            step3Submitted={step3Submitted}
            age={age}
            gender={gender}
            complaints={selectedComplaints}
            patientNumber={patientNumber}
            onNewConsultation={handleResetConsultation}
          />
        )}
      </main>

      {/* ── DRUG MONOGRAPH MODAL (Requested Feature) ────────────────────────── */}
      <DrugSearchModal
        isOpen={isDrugSearchOpen}
        onClose={() => setIsDrugSearchOpen(false)}
        currentConsultationMeds={currentMeds}
        onSelectDrugForConsult={(drug) => {
          setSelectedComplaints((prev) => (prev.length === 0 ? [drug] : prev));
          setIsDrugSearchOpen(false);
          setMainTab("consult");
        }}
      />

      {/* ── LOCATION MODAL ───────────────────────────────────────────────────── */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={location}
        onSaveLocation={(l) => {
          setLocation(l);
          localStorage.setItem("otc_location_v2", l);
        }}
      />
    </div>
  );
}
