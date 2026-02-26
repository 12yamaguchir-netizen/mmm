// ========= 初期銘柄マスタ（未設定なら投入） =========
(function(){
  const key = "daytrade_master_v1";
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({}));
})();

// ========= Service Worker =========
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

// ========= Helpers =========
const $ = (id) => document.getElementById(id);

function nowYmdHms(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function todayKey(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
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
function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// 入力欄：1000円単位でコンマ（カーソル維持）
function formatCommaInput(el){
  const start = el.selectionStart ?? 0;
  const before = el.value;
  const raw = before.replace(/[^\d]/g, "");
  if (raw === "") { el.value = ""; return; }
  const n = Number(raw);
  const after = n.toLocaleString("ja-JP");

  // カーソル補正（ざっくり）
  const diff = after.length - before.length;
  el.value = after;
  const next = Math.max(0, Math.min(after.length, start + diff));
  try { el.setSelectionRange(next, next); } catch {}
}

// ========= Storage =========
const KEY_SETTINGS = "daytrade_settings_v1";
const KEY_HISTORY  = "daytrade_history_v1";
const KEY_MASTER   = "daytrade_master_v1";

function loadSettings(){
  const raw = localStorage.getItem(KEY_SETTINGS);
  if (!raw){
    const def = { tpPct: 1.0, slPct: 1.0, lossLimit: 10000 };
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(def));
    return def;
  }
  try { return JSON.parse(raw); } catch { return { tpPct:1.0, slPct:1.0, lossLimit:10000 }; }
}
function saveSettings(s){ localStorage.setItem(KEY_SETTINGS, JSON.stringify(s)); }
function loadHistory(){
  const raw = localStorage.getItem(KEY_HISTORY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function saveHistory(h){ localStorage.setItem(KEY_HISTORY, JSON.stringify(h)); }
function loadMaster(){
  const raw = localStorage.getItem(KEY_MASTER);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
function saveMaster(m){ localStorage.setItem(KEY_MASTER, JSON.stringify(m)); }

// ========= Elements =========
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

  todayKey: $("todayKey"),
  todaySum: $("todaySum"),

  btnCalc: $("btnCalc"),
  btnSave: $("btnSave"),
  btnClear: $("btnClear"),
  btnCsv: $("btnCsv"),
  btnClearHistory: $("btnClearHistory"),

  btnToggleSettings: $("btnToggleSettings"),
  btnSettingsBack: $("btnSettingsBack"),
  settingsCard: $("settingsCard"),

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

  historyBody: $("historyBody"),
};

// ========= Core calc =========
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

// 損切ライン：画像の式（P=max(P1,P2)、R<=0はP2無効）
function calcLines(){
  const buyP = parseNum(els.buyPrice.value);
  const s = loadSettings();
  const qty = parseNum(els.buyQty.value);

  if (!buyP || buyP <= 0){
    els.tpLine.textContent = "-";
    els.slLine.textContent = "-";
    return { tp:null, sl:null };
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
  return { tp, sl };
}

function renderTotals(){
  const t = todayKey();
  els.todayKey.textContent = t;

  const hist = loadHistory();
  const sum = hist
    .filter(r => (r.dateKey || "").slice(0,10) === t)
    .reduce((acc,r) => acc + parseNum(r.pl), 0);

  els.todaySum.textContent = fmt(sum);

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
  const code = els.code.value.trim();
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
  // 保存で銘柄コードもクリア
  resetInputs(false);
}

function deleteRecord(id){
  const hist = loadHistory().filter(r => r.id !== id);
  saveHistory(hist);
  render();
}

// 履歴編集
function openEditRow(id){
  const hist = loadHistory();
  const r = hist.find(x => x.id === id);
  if (!r) return;

  const tr = [...els.historyBody.querySelectorAll("tr")]
    .find(row => row.querySelector(`button[data-edit="${id}"]`));
  if (!tr) return;

  tr.innerHTML = `
    <td><input class="cell-input" id="e_dt_${id}" value="${r.datetime}" /></td>
    <td><input class="cell-input" id="e_code_${id}" value="${r.code}" /></td>
    <td><input class="cell-input" id="e_name_${id}" value="${r.name ?? ""}" /></td>
    <td class="num"><input class="cell-input num" id="e_qty_${id}" value="${r.qty}" /></td>
    <td class="num"><input class="cell-input num" id="e_buy_${id}" value="${r.buyPrice}" /></td>
    <td class="num"><input class="cell-input num" id="e_sell_${id}" value="${r.sellPrice}" /></td>
    <td class="num"><input class="cell-input num" id="e_sqty_${id}" value="${r.sellQty}" /></td>
    <td class="num"><output id="e_pl_${id}">${fmt(r.pl)}</output></td>
    <td>
      <button class="icon-btn" data-save="${id}">保存</button>
      <button class="icon-btn" data-cancel="${id}">取消</button>
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
  ["e_buy_","e_qty_","e_sell_","e_sqty_"].forEach(prefix => {
    const el = $(prefix + id);
    if (el) el.addEventListener("input", recalc);
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
function cancelEditRow(){ render(); }

function renderHistory(){
  const hist = loadHistory();
  els.historyBody.innerHTML = hist.map(r => `
    <tr>
      <td>${r.datetime}</td>
      <td>${r.code || ""}</td>
      <td>${r.name || ""}</td>
      <td class="num">${fmt(r.qty)}</td>
      <td class="num">${fmt(r.buyPrice)}</td>
      <td class="num">${fmt(r.sellPrice)}</td>
      <td class="num">${fmt(r.sellQty)}</td>
      <td class="num">${fmt(r.pl)}</td>
      <td>
        <button class="icon-btn" data-edit="${r.id}">編集</button>
        <button class="icon-btn" data-del="${r.id}">削除</button>
      </td>
    </tr>
  `).join("");
}

function exportCsv(){
  const header = ["日時","コード","銘柄名","株数","取得単価","売却単価","売数","確定損益"];
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
      <td><button class="icon-btn" data-mdel="${code}">削除</button></td>
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

// ========= Events =========
function init(){
  // defaults
  if (!els.buyQty.value) els.buyQty.value = "100";
  if (!els.sellQty.value) els.sellQty.value = "100";

  // 1000円単位でコンマ（買株価/売株価/手数料/損失限度額）
  [els.buyPrice, els.sellPrice, els.fee, els.lossLimit].forEach(el => {
    el.addEventListener("input", () => formatCommaInput(el));
    el.addEventListener("blur",  () => { if (el.value) el.value = fmt(el.value); });
  });

  // input calc live
  ["buyPrice","buyQty","sellPrice","sellQty","fee"].forEach(id => {
    $(id).addEventListener("input", () => { calcPL(); calcLines(); renderTotals(); });
  });

  // code autofill
  els.code.addEventListener("input", () => { tryAutofillName(); });

  // Enter移動
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

  // history edit/delete/save/cancel
  els.historyBody.addEventListener("click", (e) => {
    const saveBtn = e.target.closest("button[data-save]");
    if (saveBtn){ saveEditRow(saveBtn.getAttribute("data-save")); return; }

    const cancelBtn = e.target.closest("button[data-cancel]");
    if (cancelBtn){ cancelEditRow(); return; }

    const delBtn = e.target.closest("button[data-del]");
    if (delBtn){ deleteRecord(delBtn.getAttribute("data-del")); return; }

    const editBtn = e.target.closest("button[data-edit]");
    if (editBtn){ openEditRow(editBtn.getAttribute("data-edit")); return; }
  });

  // settings UI
  const s = loadSettings();
  els.tpPct.value = s.tpPct;
  els.slPct.value = s.slPct;
  els.lossLimit.value = fmt(s.lossLimit);

  // 設定へ行けない事故を防止（nullチェック）
  if (els.btnToggleSettings && els.settingsCard){
    els.btnToggleSettings.addEventListener("click", () => {
      els.settingsCard.hidden = !els.settingsCard.hidden;
      if (!els.settingsCard.hidden) renderMaster();
    });
  }
  if (els.btnSettingsBack && els.settingsCard){
    els.btnSettingsBack.addEventListener("click", () => { els.settingsCard.hidden = true; });
  }

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
    localStorage.removeItem(KEY_MASTER);
    localStorage.setItem(KEY_MASTER, JSON.stringify({}));
    renderMaster();
    tryAutofillName();
  });

  render();
}

init();
