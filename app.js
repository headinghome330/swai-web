// SWAi Web (純前端)
// - 全中文
// - short / safe / field 三版本
// - safe checklist 可勾選狀態
// - 生成 SOAP / 綜合評估 / 服務計畫
// - 下載 txt / 匯出 json / localStorage 草稿

const $ = (id) => document.getElementById(id);

const DEFAULT_ESCALATION =
  "若出現明確自殺計畫/工具可近性提升/近期自傷加劇/拒絕合作且風險訊號升高，應即升級通報與急性處置流程。";

const DEFAULT_CHECKLIST = [
  { item: "意念強度與變化（當下/近期）", status: "unknown" },
  { item: "計畫與工具可近性（是否已取得/是否具體化）", status: "unknown" },
  { item: "支持與監護安排（今晚安全性）", status: "unknown" },
];

const STATUS_MAP = {
  confirmed: "已確認",
  pending: "待確認",
  unknown: "資訊不足",
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMode() {
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : "safe";
}

function splitSemicolon(s) {
  if (!s) return [];
  return s
    .split(/[;；]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildStateFromUI() {
  const checklist = readChecklistFromUI();

  return {
    meta: {
      caseId: $("caseId").value.trim() || "",
      date: $("date").value || todayISO(),
      updatedAt: new Date().toISOString(),
    },
    client: {
      name: $("clientName").value.trim() || "",
      age: $("age").value.trim() || "",
    },
    case: {
      type: $("caseType").value,
      setting: $("setting").value.trim() || "",
    },
    notes: {
      relationshipFocus: $("relationshipFocus").value.trim() || "",
      constraints: $("constraints").value.trim() || "",
    },
    actions: {
      done: splitSemicolon($("actionsDone").value),
      next: splitSemicolon($("actionsNext").value),
    },
    risk: {
      level: $("riskLevel").value,
      escalationRule: $("escalationRule").value.trim() || DEFAULT_ESCALATION,
      safeChecklist: checklist,
    },
    rawText: $("rawText").value || "",
  };
}

function applyStateToUI(state) {
  $("caseId").value = state?.meta?.caseId || "";
  $("date").value = state?.meta?.date || todayISO();
  $("clientName").value = state?.client?.name || "";
  $("age").value = state?.client?.age || "";
  $("caseType").value = state?.case?.type || "追蹤中";
  $("setting").value = state?.case?.setting || "";
  $("relationshipFocus").value = state?.notes?.relationshipFocus || "";
  $("constraints").value = state?.notes?.constraints || "";
  $("actionsDone").value = (state?.actions?.done || []).join("；");
  $("actionsNext").value = (state?.actions?.next || []).join("；");
  $("riskLevel").value = state?.risk?.level || "暫定";
  $("escalationRule").value = state?.risk?.escalationRule || DEFAULT_ESCALATION;
  $("rawText").value = state?.rawText || "";

  const list = state?.risk?.safeChecklist?.length ? state.risk.safeChecklist : structuredClone(DEFAULT_CHECKLIST);
  renderChecklist(list);
}

function renderChecklist(list) {
  const root = $("checklist");
  root.innerHTML = "";

  list.slice(0, 3).forEach((x, idx) => {
    const row = document.createElement("div");
    row.className = "check-item";

    const left = document.createElement("div");
    const input = document.createElement("input");
    input.type = "text";
    input.value = x.item || "";
    input.dataset.idx = String(idx);
    input.dataset.kind = "item";
    left.appendChild(input);

    const right = document.createElement("div");
    right.className = "status";

    const sel = document.createElement("select");
    sel.dataset.idx = String(idx);
    sel.dataset.kind = "status";
    [
      ["unknown", "資訊不足"],
      ["pending", "待確認"],
      ["confirmed", "已確認"],
    ].forEach(([v, label]) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = label;
      sel.appendChild(opt);
    });
    sel.value = x.status || "unknown";

    right.appendChild(sel);

    row.appendChild(left);
    row.appendChild(right);

    root.appendChild(row);
  });
}

function readChecklistFromUI() {
  const root = $("checklist");
  const rows = [...root.querySelectorAll(".check-item")];

  return rows.map((row) => {
    const item = row.querySelector('input[data-kind="item"]').value.trim();
    const status = row.querySelector('select[data-kind="status"]').value;
    return { item, status };
  });
}

function checklistRender(state) {
  const list = state?.risk?.safeChecklist || [];
  const lines = [];
  const pending = [];

  list.slice(0, 3).forEach((x, i) => {
    const item = (x.item || "").trim();
    const st = (x.status || "unknown").trim();
    const stZh = STATUS_MAP[st] || "資訊不足";
    lines.push(`${i + 1}) ${item}｜${stZh}`);
    if (st !== "confirmed") pending.push(item);
  });

  return { text: lines.join("；"), pending };
}

function keywordRiskHeuristic(raw) {
  // 粗估：只當提醒，不取代專業判斷
  const high = ["自殺", "跳樓", "割腕", "吞藥", "想死", "去死", "刀片", "計畫", "藥物", "工具"];
  const mid = ["自傷", "情緒低落", "焦慮", "失眠", "拒學", "衝突", "威脅"];
  const protect = ["保護", "家暴", "性侵", "兒少", "通報"];

  const signals = [];
  let score = 0;

  for (const kw of high) {
    if (raw.includes(kw)) { signals.push(`高風險關鍵字：${kw}`); score += 2; }
  }
  for (const kw of mid) {
    if (raw.includes(kw)) { signals.push(`中風險關鍵字：${kw}`); score += 1; }
  }
  for (const kw of protect) {
    if (raw.includes(kw)) { signals.push(`保護/通報脈絡：${kw}`); score += 1; }
  }

  let level = "暫定";
  if (score >= 4) level = "高";
  else if (score >= 2) level = "中";
  else if (score >= 1) level = "低";

  return { level, signals: signals.slice(-12) };
}

function wrap(text, width = 88) {
  // 簡易換行（中文也可用，效果是控制行長）
  const s = String(text || "");
  const lines = [];
  let line = "";
  for (const ch of s) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    line += ch;
    if (line.length >= width && ch === "，") {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function genServicePlan(state, mode) {
  const done = state.actions.done || [];
  const nxt = state.actions.next || [];
  const focus = state.notes.relationshipFocus || "";
  const constraints = state.notes.constraints || "";

  let bullets = [];

  if (mode === "short") {
    bullets = [
      "持續追蹤風險與壓力源變動，必要時依升級條件啟動處置。",
      "以可行節奏建立合作關係與求助路徑，協助發展替代性調節策略。",
    ];
  } else if (mode === "safe") {
    bullets = [
      "持續監測自傷自殺意念、計畫/工具可近性與行為變化，依升級條件啟動通報/急性處置與跨單位協作。",
      "以不過度推論原則進行功能性評估，採可驗證訊號逐步建立介入目標與安全計畫。",
      "與家屬/學校/醫療保持資訊同步與分工，降低資訊落差與風險空窗。",
    ];
  } else {
    bullets = [
      "持續評估安全風險與壓力源變動，必要時依升級條件啟動通報/急性處置與跨單位協作。",
      "聚焦建立合作關係與可行目標（以案主可接受的節奏），協助辨識替代性情緒調節方式與求助路徑。",
      "與家屬/學校/醫療等系統保持資訊同步與分工，提升支持一致性並降低風險落差。",
    ];
  }

  if (focus) {
    bullets[1] = mode === "short"
      ? `${bullets[1]}（焦點：${focus}）`
      : `${bullets[1]}（關係推動焦點：${focus}）`;
  }

  if (constraints) {
    bullets.push(mode === "short"
      ? `限制/例外：${constraints}。`
      : `例外/限制：${constraints}；將以替代接觸方式（電話/校訪/與家屬協作）維持追蹤。`);
  }

  if (done.length) bullets.push(`本次已執行：${done.join("；")}。`);
  if (nxt.length) bullets.push(`近期規劃：${nxt.join("；")}。`);

  const maxPoints = mode === "short" ? 3 : 4;
  bullets = bullets.slice(0, maxPoints);

  return bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");
}

function genAssessment(state, mode) {
  const level = state.risk.level || "暫定";
  const focus = state.notes.relationshipFocus || "";
  const constraints = state.notes.constraints || "";

  // 用 checklist 項目或 keyword signals 做提示（不強推）
  const { text: checklistText } = checklistRender(state);

  let s = "";
  if (mode === "short") {
    s = `綜合評估：風險層級暫評「${level}」。後續以安全監測與關係合作並進，視訊號調整介入。`;
  } else if (mode === "safe") {
    s = `綜合評估：目前風險層級暫評為「${level}」。本評估採保留彈性原則，避免超出既有資料之推論；後續將持續追蹤意念/計畫/工具可近性、近期行為變化與支持系統，並依升級條件啟動必要之通報/急性處置與跨單位協作。`;
    if (constraints) s += `另因${constraints}，將以替代接觸方式維持資訊更新與追蹤。`;
  } else {
    s = `綜合評估：目前風險層級暫評為「${level}」。觀察案主在壓力情境下可能出現情緒/行為波動，仍需持續追蹤其自傷自殺意念、工具可近性及家庭/校園脈絡變化；後續將以安全監測與關係合作並進，逐步建立可行的求助與替代性調節方案。`;
    if (constraints) s += `（限制/例外：${constraints}）`;
  }

  if (focus && mode !== "safe") s += `（關係推動焦點：${focus}）`;
  if (mode !== "short") s += `\n\nsafe checklist（供追蹤）：${checklistText || "（未設定）"}。`;

  return wrap(s, 88);
}

function genSoap(state, mode) {
  const level = state.risk.level || "暫定";
  const esc = state.risk.escalationRule || DEFAULT_ESCALATION;
  const done = state.actions.done || [];
  const nxt = state.actions.next || [];
  const constraints = state.notes.constraints || "";
  const { text: checklistText } = checklistRender(state);

  if (mode === "short") {
    const O = "O：接觸情境與客觀觀察（摘）。";
    const S = "S：案主陳述重點（摘）。";
    const A = `A：風險暫評「${level}」，持續依訊號調整。`;
    const P = `P：${done.length ? done.join("；") : "依計畫追蹤"}${nxt.length ? `；近期：${nxt.join("；")}` : ""}`;
    const P2 = `升級條件：${esc}`;
    return [O, S, A, P, P2].join("\n");
  }

  if (mode === "safe") {
    const O = "O：本次接觸情境、客觀觀察與可核對事實（請依原始資料摘錄）。";
    const S = "S：案主主觀陳述（原話或摘要，避免過度推論）。";
    const A = `A：風險層級暫評「${level}」。採保留彈性之功能性評估，將依後續可觀察訊號（意念/計畫/工具可近性/近期行為變化/支持系統）滾動修正。`;
    const NC = `需確認（safe checklist）：${checklistText || "（未設定）"}。`;
    let P = "P：";
    P += done.length ? `本次已執行：${done.join("；")}。` : "本次已執行：待補。";
    P += nxt.length ? ` 近期規劃：${nxt.join("；")}。` : " 近期規劃：依風險與合作度調整追蹤頻率。";
    if (constraints) P += `（限制/例外：${constraints}）`;
    const P2 = `升級條件：${esc}`;
    return [O, S, A, NC, P, P2].join("\n");
  }

  // field
  const O = "O：本次接觸情境與客觀觀察（請依原始資料擷取重點貼上）。";
  const S = "S：案主主觀陳述重點（請依原始資料擷取原話/摘要）。";
  const A = `A：風險層級暫評「${level}」，採功能性評估並保留彈性，持續依訊號變化調整。`;
  let P = `P：${done.length ? done.join("；") + "；" : ""}${nxt.length ? "近期：" + nxt.join("；") : "後續依計畫追蹤。"}`
  if (constraints) P += `（限制/例外：${constraints}）`;
  const P2 = `升級條件：${esc}`;
  return [O, S, A, P, P2].join("\n");
}

function setOutput(tab, text, state) {
  $("outputArea").value = text || "";
  const mode = getMode();
  const meta = [
    state.meta.caseId ? `案件：${state.meta.caseId}` : "案件：未填",
    `日期：${state.meta.date || todayISO()}`,
    `版本：${mode}`,
    `輸出：${tab.toUpperCase()}`,
  ].join("｜");
  $("outputMeta").textContent = meta;

  const { pending } = checklistRender(state);
  if (mode === "safe" && pending.length) {
    $("pendingHint").textContent = `⚠ safe checklist 尚未確認：${pending.join("、")}`;
  } else {
    $("pendingHint").textContent = "";
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJSON(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function currentTab() {
  const active = document.querySelector(".tab.active");
  return active ? active.dataset.tab : "soap";
}

function setTab(tab) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  // 重新顯示對應輸出（如果已生成）
  const state = window.__lastState;
  const outputs = window.__lastOutputs;
  if (!state || !outputs) return;
  setOutput(tab, outputs[tab] || "", state);
}

function init() {
  $("date").value = todayISO();
  $("escalationRule").value = DEFAULT_ESCALATION;
  renderChecklist(structuredClone(DEFAULT_CHECKLIST));

  // Tabs
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });

  // File upload
  $("fileInput").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const text = await f.text();
    if (f.name.toLowerCase().endsWith(".json")) {
      try {
        const obj = JSON.parse(text);
        applyStateToUI(obj);
      } catch {
        alert("JSON 解析失敗。");
      }
    } else {
      $("rawText").value = text;
    }
    e.target.value = "";
  });

  // Clear
  $("btnClear").addEventListener("click", () => {
    applyStateToUI({
      meta: { caseId: "", date: todayISO() },
      client: { name: "", age: "" },
      case: { type: "追蹤中", setting: "" },
      notes: { relationshipFocus: "", constraints: "" },
      actions: { done: [], next: [] },
      risk: { level: "暫定", escalationRule: DEFAULT_ESCALATION, safeChecklist: structuredClone(DEFAULT_CHECKLIST) },
      rawText: "",
    });
    window.__lastOutputs = null;
    window.__lastState = null;
    $("outputArea").value = "";
    $("outputMeta").textContent = "";
    $("pendingHint").textContent = "";
  });

  // Save / Load local
  $("btnSaveLocal").addEventListener("click", () => {
    const state = buildStateFromUI();
    localStorage.setItem("swai_draft_v1", JSON.stringify(state));
    alert("已儲存到本機草稿。");
  });

  $("btnLoadLocal").addEventListener("click", () => {
    const s = localStorage.getItem("swai_draft_v1");
    if (!s) return alert("找不到本機草稿。");
    try {
      const obj = JSON.parse(s);
      applyStateToUI(obj);
      alert("已讀取本機草稿。");
    } catch {
      alert("本機草稿解析失敗。");
    }
  });

  // Auto check
  $("btnAutoCheck").addEventListener("click", () => {
    const raw = $("rawText").value || "";
    const { level, signals } = keywordRiskHeuristic(raw);
    $("riskLevel").value = level;
    const msg = signals.length ? `建議層級：${level}\n\n依據（節錄）：\n- ${signals.join("\n- ")}`
                              : `建議層級：${level}\n\n（未偵測到關鍵字，仍建議依專業判斷）`;
    alert(msg);
  });

  // Generate
  $("btnGenerate").addEventListener("click", () => {
    const state = buildStateFromUI();
    const mode = getMode();

    const outputs = {
      soap: genSoap(state, mode),
      assessment: genAssessment(state, mode),
      plan: genServicePlan(state, mode),
    };

    window.__lastState = state;
    window.__lastOutputs = outputs;

    setOutput(currentTab(), outputs[currentTab()], state);
  });

  // Copy
  $("btnCopy").addEventListener("click", async () => {
    const txt = $("outputArea").value || "";
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      alert("已複製。");
    } catch {
      alert("複製失敗（瀏覽器權限限制）。你仍可手動選取複製。");
    }
  });

  // Download txt
  $("btnDownload").addEventListener("click", () => {
    const txt = $("outputArea").value || "";
    if (!txt) return;

    const state = window.__lastState || buildStateFromUI();
    const tab = currentTab();
    const mode = getMode();
    const id = state.meta.caseId || "SWAi";
    const date = state.meta.date || todayISO();
    downloadText(`${id}_${date}_${tab}_${mode}.txt`, txt);
  });

  // Export JSON
  $("btnExportJson").addEventListener("click", () => {
    const state = buildStateFromUI();
    const id = state.meta.caseId || "SWAi";
    const date = state.meta.date || todayISO();
    downloadJSON(`${id}_${date}_backup.json`, state);
  });
}

init();
