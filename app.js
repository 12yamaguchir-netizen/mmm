// ===== Service Worker =====
if ("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    try{
      const reg = await navigator.serviceWorker.register("./sw.js?v=9");
      reg.update?.();
    }catch{}
  });
}

// ===== Helpers =====
const $ = (id) => document.getElementById(id);

function pad2(n){ return String(n).padStart(2,"0"); }
function nowYmdHms(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseNum(v){
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g,"").trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmt(n){
  const x = Math.round(parseNum(n));
  return x.toLocaleString("ja-JP");
}
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

// 入力欄：コンマ整形
function formatCommaInput(el){
  const start = el.selectionStart ?? 0;
  const before = el.value;
  const raw = before.replace(/[^\d]/g, "");
  if (raw === "") { el.value = ""; return; }
  const n = Number(raw);
  const after = n.toLocaleString("ja-JP");
  const diff = after.length - before.length;
  el.value = after;
  const next = Math.max(0, Math.min(after.length, start + diff));
  try { el.setSelectionRange(next, next); } catch {}
}

// ===== Storage =====
const KEY_SETTINGS = "daytrade_settings_v2";
const KEY_HISTORY  = "daytrade_history_v2";
const KEY_MASTER   = "daytrade_master_v2";

function loadSettings(){
  const raw = localStorage.getItem(KEY_SETTINGS);
  if (!raw){
    const def = { tpPct: 1.0, slPct: 1.0, lossLimit: 10000 };
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(def));
    return def;
  }
  try{ return JSON.parse(raw); }catch{ return { tpPct:1.0, slPct:1.0, lossLimit:10000 }; }
}
function saveSettings(s){ localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); }

function loadHistory(){
  const raw = localStorage.getItem(KEY_HISTORY);
  if (!raw) return [];
  try{ return JSON.parse(raw); }catch{ return []; }
}
function saveHistory(h){ localStorage.setItem(KEY_HISTORY, JSON.stringify(h)); }

function loadMaster(){
  const raw = localStorage.getItem(KEY_MASTER);
  if (!raw){
    localStorage.setItem(KEY_MASTER, JSON.stringify({}));
    return {};
  }
  try{ return JSON.parse(raw); }catch{ return {}; }
}
function saveMaster(m){ localStorage.setItem(KEY_MASTER, JSON.stringify(m)); }

// ===== Elements =====
const els = {
  code: $("code"),
  name: $("name"),
  buyPrice: $("buyPrice"),
  buyQty: $("buyQty"),
  sellPrice: $("sellPrice"),
  sellQty: $("sellQty"),
  fee: $("fee"),
  pl: $("pl"),

  tpLine: $("tpLine"),
  slLine: $("slLine"),
  remainLoss: $("remainLoss"),
  lossHint: $("lossHint"),
  todaySumIn: $("todaySumIn"),
  headRealized: $("headRealized"),

  btnCalc: $("btnCalc"),
  btnSave: $("btnSave"),
  btnClear: $("btnClear"),
  btnCsv: $("btnCsv"),
  btnClearHistory: $("btnClearHistory"),

  historyBody: $("historyBody"),

  // modal
  settingsModal: $("settingsModal"),
  modalBackdrop: $("modalBackdrop"),
  btnOpenSettings: $("btnOpenSettings"),
  btnCloseSettings: $("btnCloseSettings"),
  btnBackSettings: $("btnBackSettings"),

  tpPct: $("tpPct"),
  slPct: $("slPct"),
  lossLimit: $("lossLimit"),
  btnSaveSettings: $("btnSaveSettings"),

  mCode: $("mCode"),
  mName: $("mName"),
  btnMasterAdd: $("btnMasterAdd"),
  btnMasterExport: $("btnMasterExport"),
  masterImport: $("masterImport"),
  btnMasterReset: $("btnMasterReset"),
  masterBody: $("masterBody"),
};

// ===== Logic =====
function calcPL(){
  const buyP = parseNum(els.buyPrice.value);
  const qty = parseNum(els.buyQty.value);
  const sellP = parseNum(els.sellPrice.value);
  const sellQty = parseNum(els.sellQty.value);
  const fee = parseNum(els.fee.value);
  const q = Math.min(qty, sellQty);
  const pl = (sellP - buyP) * q - fee;
  els.pl.textContent = fmt(pl);
  return pl;
}

// 損切ライン：P=max(P1,P2)、R<=0ならP2無効
function calcLines(){
  const buyP = parseNum(els.buyPrice.value);
  const s = loadSettings();
  const qty = parseNum(els.buyQty.value);

  if (!buyP || buyP <= 0){
    els.tpLine.textContent = "-";
    els.slLine.textContent = "-";
    return;
  }

  const tp = buyP * (1 + (parseNum(s.tpPct)/100));
  els.tpLine.textContent = fmt(tp);

  const x = parseNum(s.slPct);
  const P1 = buyP * (1 - (x/100));

  const hist = loadHistory();
  const t = todayKey();
  const sum = hist
    .filter(r => (r.dateKey || "").slice(0,10) === t)
    .reduce((acc,r) => acc + parseNum(r.pl), 0);

  const lossLimit = parseNum(s.lossLimit);
  const R = lossLimit ? (lossLimit + sum) : 0;

  let sl = P1;
  if (qty > 0 && R > 0){
    const P2 = buyP - (R / qty);
    sl = Math.max(P1, P2);
  } else {
    sl = P1;
  }
  els.slLine.textContent = fmt(sl);
}

function renderTotals(){
  const t = todayKey();
  const hist = loadHistory();
  const sum = hist
    .filter(r => (r.dateKey || "").slice(0,10) === t)
    .reduce((acc,r) => acc + parseNum(r.pl), 0);

  els.todaySumIn.textContent = fmt(sum);
  els.headRealized.textContent = fmt(sum);

  const s = loadSettings();
  const L = parseNum(s.lossLimit);
  if (!L){
    els.remainLoss.textContent = "-";
    els.lossHint.textContent = "設定→損失限度額を入れてください";
  } else {
    const remainRaw = L + sum;
    if (remainRaw >= 0){
      els.remainLoss.textContent = fmt(remainRaw);
      els.lossHint.textContent = `損失限度額：${fmt(L)}円（利益で上乗せ）`;
    } else {
      els.remainLoss.textContent = "0";
      els.lossHint.textContent = `損失限度額超過：${fmt(-remainRaw)}円`;
    }
  }
}

function resetInputs(keepCode){
  if (!keepCode){
    els.code.value = "";
    els.name.value = "";
  }
  els.buyPrice.value = "";
  els.sellPrice.value = "";
  els.fee.value = "";
  els.buyQty.value = "100";
  els.sellQty.value = "100";
  els.pl.textContent = "0";
  els.tpLine.textContent = "-";
  els.slLine.textContent = "-";
}

function addRecord(){
  const code = els.code.value.trim().replace(/\.$/,"");
  const name = els.name.value.trim();
  const buyPrice = parseNum(els.buyPrice.value);
  const sellPrice = parseNum(els.sellPrice.value);
  const qty = parseNum(els.buyQty.value);
  const sellQty = parseNum(els.sellQty.value);
  const fee = parseNum(els.fee.value);

  const datetime = nowYmdHms();
  const dateKey = datetime.slice(0,10);

  const q = Math.min(qty, sellQty);
  const pl = (sellPrice - buyPrice) * q - fee;

  const hist = loadHistory();
  hist.unshift({
    id: uid(),
    datetime,
    dateKey,
    code,
    name,
    qty,
    buyPrice,
    sellPrice,
    sellQty,
    fee,
    pl
  });
  saveHistory(hist);

  render();
  resetInputs(false); // 保存で銘柄コードもクリア
}

function deleteRecord(id){
  const hist = loadHistory().filter(r => r.id !== id);
  saveHistory(hist);
  render();
}

function openEditRow(id){
  const hist = loadHistory();
  const r = hist.find(x => x.id === id);
  if (!r) return;

  const tr = [...els.historyBody.querySelectorAll("tr")]
    .find(row => row.dataset.id === id);
  if (!tr) return;

  tr.innerHTML = `
    <td><input class="cell-input" id="e_dt_${id}" value="${r.datetime}" /></td>
    <td><input class="cell-input" id="e_code_${id}" value="${r.code ?? ""}" /></td>
    <td><input class="cell-input" id="e_name_${id}" value="${r.name ?? ""}" /></td>
    <td class="num"><input class="cell-input num" id="e_qty_${id}" value="${r.qty ?? 0}" /></td>
    <td class="num"><input class="cell-input num" id="e_buy_${id}" value="${r.buyPrice ?? 0}" /></td>
    <td class="num"><input class="cell-input num" id="e_sell_${id}" value="${r.sellPrice ?? 0}" /></td>
    <td class="num"><input class="cell-input num" id="e_sqty_${id}" value="${r.sellQty ?? 0}" /></td>
    <td class="num">
      <div class="realizedCell">
        <span id="e_pl_${id}">${fmt(r.pl)}</span>
        <button class="smallBtn" data-save="${id}">訂正</button>
        <button class="smallBtn danger" data-cancel="${id}">取消</button>
      </div>
    </td>
  `;

  const recalc = () => {
    const buyP = parseNum($(`e_buy_${id}`).value);
    const qty = parseNum($(`e_qty_${id}`).value);
    const sellP = parseNum($(`e_sell_${id}`).value);
    const sellQty = parseNum($(`e_sqty_${id}`).value);
    const q = Math.min(qty, sellQty);
    const pl = (sellP - buyP) * q;
    $(`e_pl_${id}`).textContent = fmt(pl);
  };

  ["e_qty_","e_buy_","e_sell_","e_sqty_"].forEach(p => {
    const el = $(p + id);
    if (!el) return;
    el.addEventListener("input", recalc);
    el.addEventListener("input", () => formatCommaInput(el));
    el.addEventListener("blur",  () => { if (el.value) el.value = fmt(el.value); });
  });
}

function saveEditRow(id){
  const hist = loadHistory();
  const i = hist.findIndex(x => x.id === id);
  if (i === -1) return;

  const buyPrice = parseNum($(`e_buy_${id}`).value);
  const qty = parseNum($(`e_qty_${id}`).value);
  const sellPrice = parseNum($(`e_sell_${id}`).value);
  const sellQty = parseNum($(`e_sqty_${id}`).value);
  const q = Math.min(qty, sellQty);
  const pl = (sellPrice - buyPrice) * q;

  const dt = $(`e_dt_${id}`).value.trim() || hist[i].datetime;

  hist[i] = {
    ...hist[i],
    datetime: dt,
    dateKey: dt.slice(0,10) || hist[i].dateKey,
    code: $(`e_code_${id}`).value.trim(),
    name: $(`e_name_${id}`).value.trim(),
    qty,
    buyPrice,
    sellPrice,
    sellQty,
    pl
  };
  saveHistory(hist);
  render();
}

function renderHistory(){
  const hist = loadHistory();
  els.historyBody.innerHTML = hist.map(r => `
    <tr data-id="${r.id}">
      <td>${r.datetime}</td>
      <td>${r.code || ""}</td>
      <td>${r.name || ""}</td>
      <td class="num">${fmt(r.qty)}</td>
      <td class="num">${fmt(r.buyPrice)}</td>
      <td class="num">${fmt(r.sellPrice)}</td>
      <td class="num">${fmt(r.sellQty)}</td>
      <td class="num">
        <div class="realizedCell">
          <span>${fmt(r.pl)}</span>
          <button class="smallBtn" data-edit="${r.id}">訂正</button>
          <button class="smallBtn danger" data-del="${r.id}">削除</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function exportCsv(){
  const header = ["日時","コード","銘柄名","株数","取得単価","売却単価","売数","実現損益"];
  const hist = loadHistory();
  const rows = hist.map(r => [r.datetime, r.code, r.name, r.qty, r.buyPrice, r.sellPrice, r.sellQty, r.pl]);

  const toCsv = (arr) =>
    arr.map(row => row.map(v => {
      const s = String(v ?? "");
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(",")).join("\n");

  const csv = toCsv([header, ...rows]);
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daytrade_history_${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderMaster(){
  const m = loadMaster();
  const keys = Object.keys(m).sort((a,b)=>Number(a)-Number(b));
  els.masterBody.innerHTML = keys.map(code => `
    <tr>
      <td>${code}</td>
      <td>${m[code]}</td>
      <td><button class="smallBtn danger" data-mdel="${code}">削除</button></td>
    </tr>
  `).join("");
}

function tryAutofillName(){
  const code = els.code.value.trim().replace(/\.$/,"");
  if (!code) return;
  const m = loadMaster();
  if (m[code] && !els.name.value.trim()){
    els.name.value = m[code];
  }
}

function render(){
  renderTotals();
  renderHistory();
  calcPL();
  calcLines();
}

// ===== Modal =====
function openSettings(){
  els.settingsModal.setAttribute("aria-hidden","false");
}
function closeSettings(){
  els.settingsModal.setAttribute("aria-hidden","true");
}

// ===== Init =====
function init(){
  // defaults
  if (!els.buyQty.value) els.buyQty.value = "100";
  if (!els.sellQty.value) els.sellQty.value = "100";

  // comma format
  [els.buyPrice, els.sellPrice, els.fee].forEach(el => {
    el.addEventListener("input", () => formatCommaInput(el));
    el.addEventListener("blur",  () => { if (el.value) el.value = fmt(el.value); });
  });

  // live calc
  ["buyPrice","buyQty","sellPrice","sellQty","fee"].forEach(id => {
    $(id).addEventListener("input", () => { calcPL(); calcLines(); renderTotals(); });
  });

  // code autofill
  els.code.addEventListener("input", () => { tryAutofillName(); });

  // Enter move
  els.code.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){ e.preventDefault(); els.buyPrice.focus(); }
  });
  els.buyQty.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){ e.preventDefault(); els.sellPrice.focus(); }
  });

  // buttons
  els.btnCalc.addEventListener("click", () => { calcPL(); calcLines(); renderTotals(); });
  els.btnSave.addEventListener("click", () => { addRecord(); });
  els.btnClear.addEventListener("click", () => { resetInputs(true); });

  els.btnCsv.addEventListener("click", exportCsv);
  els.btnClearHistory.addEventListener("click", () => { saveHistory([]); render(); });

  // history actions
  els.historyBody.addEventListener("click", (e) => {
    const saveBtn = e.target.closest("button[data-save]");
    if (saveBtn){ saveEditRow(saveBtn.getAttribute("data-save")); return; }

    const cancelBtn = e.target.closest("button[data-cancel]");
    if (cancelBtn){ render(); return; }

    const delBtn = e.target.closest("button[data-del]");
    if (delBtn){ deleteRecord(delBtn.getAttribute("data-del")); return; }

    const editBtn = e.target.closest("button[data-edit]");
    if (editBtn){ openEditRow(editBtn.getAttribute("data-edit")); return; }
  });

  // modal events
  els.btnOpenSettings.addEventListener("click", () => { openSettings(); renderMaster(); });
  els.btnCloseSettings.addEventListener("click", closeSettings);
  els.btnBackSettings.addEventListener("click", closeSettings);
  els.modalBackdrop.addEventListener("click", closeSettings);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });

  // settings default
  const s = loadSettings();
  els.tpPct.value = s.tpPct;
  els.slPct.value = s.slPct;
  els.lossLimit.value = fmt(s.lossLimit);

  // lossLimit comma
  els.lossLimit.addEventListener("input", () => formatCommaInput(els.lossLimit));
  els.lossLimit.addEventListener("blur",  () => { if (els.lossLimit.value) els.lossLimit.value = fmt(els.lossLimit.value); });

  els.btnSaveSettings.addEventListener("click", () => {
    const ns = {
      tpPct: parseNum(els.tpPct.value),
      slPct: parseNum(els.slPct.value),
      lossLimit: parseNum(els.lossLimit.value)
    };
    saveSettings(ns);
    els.lossLimit.value = fmt(ns.lossLimit);
    render();
  });

  // master add/update/delete/export/import/reset
  els.btnMasterAdd.addEventListener("click", () => {
    const code = els.mCode.value.trim();
    const name = els.mName.value.trim();
    if (!code || !name) return;
    const m = loadMaster();
    m[code] = name;
    saveMaster(m);
    els.mCode.value = "";
    els.mName.value = "";
    renderMaster();
    tryAutofillName();
  });

  els.masterBody.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mdel]");
    if (!b) return;
    const code = b.getAttribute("data-mdel");
    const m = loadMaster();
    delete m[code];
    saveMaster(m);
    renderMaster();
  });

  els.btnMasterExport.addEventListener("click", () => {
    const m = loadMaster();
    const blob = new Blob([JSON.stringify(m, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `master_${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  els.masterImport.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    try{
      const obj = JSON.parse(text);
      if (obj && typeof obj === "object"){
        saveMaster(obj);
        renderMaster();
        tryAutofillName();
      }
    }catch{}
    e.target.value = "";
  });

  els.btnMasterReset.addEventListener("click", () => {
    localStorage.setItem(KEY_MASTER, JSON.stringify({}));
    renderMaster();
    tryAutofillName();
  });

  // initial
  render();
}

init();
