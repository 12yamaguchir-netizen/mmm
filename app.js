// デイトレ管理（PWA）
// 仕様対応：
// ① 保存しても buyQty/sellQty は 100 に戻す
// ② Enter移動：code→buyPrice、buyQty→sellPrice
// ③ 今日の確定損益合計：履歴の「同日」だけ合計

const $ = (id) => document.getElementById(id);

const els = {
  code: $("code"),
  name: $("name"),
  buyPrice: $("buyPrice"),
  buyQty: $("buyQty"),
  sellPrice: $("sellPrice"),
  sellQty: $("sellQty"),
  fee: $("fee"),
  pl: $("pl"),
  todaySum: $("todaySum"),
  todayLabel: $("todayLabel"),
  historyBody: $("historyBody"),
  btnCalc: $("btnCalc"),
  btnSave: $("btnSave"),
  btnClear: $("btnClear"),
  btnExport: $("btnExport"),
  btnDeleteAll: $("btnDeleteAll"),
};

const STORAGE_KEY = "daytrade_history_v1";

function parseNum(v){
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("ja-JP", {maximumFractionDigits: 2});
}

function nowIso(){
  const d = new Date();
  // 例: 2026-02-26 13:10:05
  const pad = (k) => String(k).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayKey(d=new Date()){
  const pad = (k) => String(k).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; // YYYY-MM-DD
}

function loadHistory(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  }catch(e){
    return [];
  }
}

function saveHistory(arr){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function calcPL(){
  const buyP = parseNum(els.buyPrice.value);
  const buyQ = parseNum(els.buyQty.value);
  const sellP = parseNum(els.sellPrice.value);
  const sellQ = parseNum(els.sellQty.value);
  const fee = parseNum(els.fee.value);

  // 基本：売買が揃ってる数量だけで計算（ミスマッチは小さい方に合わせる）
  const q = Math.min(buyQ, sellQ);
  const pl = (sellP - buyP) * q - fee;

  els.pl.textContent = fmt(pl);
  return pl;
}

function resetInputs(keepCodeName=false){
  // ① デフォルト数量は100
  if (!keepCodeName){
    els.code.value = "";
    els.name.value = "";
  }
  els.buyPrice.value = "";
  els.sellPrice.value = "";
  els.fee.value = "";

  els.buyQty.value = "100";
  els.sellQty.value = "100";

  els.pl.textContent = "0";

  // 使い勝手：次の入力へ
  (keepCodeName ? els.buyPrice : els.code).focus();
}

function render(){
  const hist = loadHistory();
  els.historyBody.innerHTML = "";

  for (let i = hist.length - 1; i >= 0; i--){
    const r = hist[i];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.datetime}</td>
      <td>${r.code}</td>
      <td>${r.name ?? ""}</td>
      <td class="num">${fmt(r.buyPrice)}</td>
      <td class="num">${fmt(r.buyQty)}</td>
      <td class="num">${fmt(r.sellPrice)}</td>
      <td class="num">${fmt(r.sellQty)}</td>
      <td class="num">${fmt(r.fee)}</td>
      <td class="num">${fmt(r.pl)}</td>
      <td><button class="icon-btn" data-del="${r.id}">削除</button></td>
    `;
    els.historyBody.appendChild(tr);
  }

  // 今日合計
  const t = todayKey();
  const sum = hist
    .filter(r => (r.dateKey === t))
    .reduce((acc, r) => acc + parseNum(r.pl), 0);

  els.todaySum.textContent = fmt(sum);
  const d = new Date();
  els.todayLabel.textContent = `対象日：${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function addRecord(){
  const code = els.code.value.trim();
  const name = els.name.value.trim();
  const buyPrice = parseNum(els.buyPrice.value);
  const buyQty = parseNum(els.buyQty.value);
  const sellPrice = parseNum(els.sellPrice.value);
  const sellQty = parseNum(els.sellQty.value);
  const fee = parseNum(els.fee.value);

  // 最低限：コードと価格が入っていないと記録できない
  if (!code || buyPrice === 0 || sellPrice === 0){
    alert("銘柄コード・買株価・売株価は入力してください。");
    return;
  }

  const pl = calcPL();

  const rec = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    datetime: nowIso(),
    dateKey: todayKey(),
    code,
    name,
    buyPrice,
    buyQty,
    sellPrice,
    sellQty,
    fee,
    pl,
  };

  const hist = loadHistory();
  hist.push(rec);
  saveHistory(hist);

  // ① 保存後もデフォルト100
  resetInputs(true); // コード/銘柄名は残したいなら true（運用に合わせやすい）
  render();
}

function deleteRecord(id){
  const hist = loadHistory().filter(r => r.id !== id);
  saveHistory(hist);
  render();
}

function exportCSV(){
  const hist = loadHistory();
  if (hist.length === 0){
    alert("履歴がありません。");
    return;
  }
  const header = ["日時","日付キー","銘柄コード","銘柄名","買株価","買株数","売株価","売株数","手数料","確定損益"];
  const rows = hist.map(r => [
    r.datetime, r.dateKey, r.code, (r.name ?? ""),
    r.buyPrice, r.buyQty, r.sellPrice, r.sellQty, r.fee, r.pl
  ]);
  const csv = [header, ...rows].map(cols => cols.map(v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  }).join(",")).join("\n");

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

function wireEnterMoves(){
  // ② Enter移動
  els.code.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      els.buyPrice.focus();
    }
  });

  els.buyQty.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      els.sellPrice.focus();
    }
  });

  // ついで：売株数でEnter→保存（便利）
  els.sellQty.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      addRecord();
    }
  });
}

function wireAutoCalc(){
  const targets = [els.buyPrice, els.buyQty, els.sellPrice, els.sellQty, els.fee];
  for (const el of targets){
    el.addEventListener("input", () => calcPL());
  }
}

function init(){
  // 初期値
  els.buyQty.value = "100";
  els.sellQty.value = "100";
  els.pl.textContent = "0";

  wireEnterMoves();
  wireAutoCalc();

  els.btnCalc.addEventListener("click", () => calcPL());
  els.btnSave.addEventListener("click", () => addRecord());
  els.btnClear.addEventListener("click", () => resetInputs(false));

  els.historyBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    const id = btn.getAttribute("data-del");
    deleteRecord(id);
  });

  els.btnExport.addEventListener("click", () => exportCSV());
  els.btnDeleteAll.addEventListener("click", () => {
    if (!confirm("履歴を全削除します。よろしいですか？")) return;
    saveHistory([]);
    render();
  });

  render();
}

init();
