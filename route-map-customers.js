// Current responsibility comes from the complete latest customer roster.
const rosterMergedSources = mergedSources;
mergedSources = function () {
  const rows = rosterMergedSources();
  if (!customerMaster) return rows;
  const current = new Set(customerMaster.codes);
  return rows.filter(x => current.has(String(x.code)) || x.source === 'manual');
};
selectedRecords = function () {
  const byCode = new Map(scopeRecords().map(x => [x.code, x]));
  return [...chosen].map(code => byCode.get(code)).filter(Boolean);
};
function changeResponsibility() {
  groups.clear();
  if (customerMaster) {
    customerMaster.preferredOwner = document.getElementById('ownerFilter').value;
    customerMasterDirty = true;
  }
  render();
  dirty();
  if (activeView === 'map') updateMap(true);
}
function validateCompanyCustomers(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100000) throw Error('客戶名冊空白或格式不符，舊資料仍保留。');
  const seen = new Set();
  for (const x of items) {
    if (typeof x.code !== 'string' || !x.code.trim() || seen.has(x.code) || typeof x.name !== 'string' || !x.name.trim() || typeof x.owner !== 'string' || (x.gps !== null && (!Array.isArray(x.gps) || !validGps(x.gps)))) throw Error('客戶代碼、人員或座標格式不符，舊資料仍保留。');
    seen.add(x.code);
  }
}
function applyCompanyCustomers(data) {
  validateCompanyCustomers(data.customers);
  const hadMaster = !!customerMaster;
  const oldRows = new Map([...excel, ...db, ...customerDb].map(x => [String(x.code), x]));
  const byCode = new Map(customerDb.map(x => [String(x.code), x]));
  const codes = new Set(data.customers.map(x => x.code));
  const previousCodes = new Set(customerMaster?.codes || customerDb.map(x => String(x.code)));
  let preservedGps = 0, changedOwners = 0;
  for (const [code, x] of byCode) {
    if (!codes.has(code) && x.source !== 'manual') {
      byCode.set(code, {...x, companyCurrent: false});
      pendingCustomers.add(code);
    }
  }
  for (const x of data.customers) {
    const old = oldRows.get(x.code);
    const previousGps = gps[x.code] || old?.gps;
    const companyGps = validGps(x.gps);
    const point = companyGps ? x.gps.map(Number) : validGps(previousGps) ? previousGps.map(Number) : null;
    if (!companyGps && point) preservedGps++;
    if (old?.owner && old.owner !== x.owner) changedOwners++;
    byCode.set(x.code, {...old, ...x, gps: point, gpsSource: companyGps ? 'company' : point ? 'previous' : 'missing', source: 'company', companyCurrent: true});
    delete gps[x.code];
    pendingCustomers.add(x.code);
  }
  customerDb = [...byCode.values()];
  db = db.filter(x => !codes.has(String(x.code)));
  const existingOwner = document.getElementById('ownerFilter').value;
  const namedOwners = [...new Set(data.customers.map(x => x.owner).filter(x => x && !/^\d+$/.test(x)))];
  const preferredOwner = (hadMaster && !existingOwner) || data.customers.some(x => x.owner === existingOwner) ? existingOwner : namedOwners.length === 1 ? namedOwners[0] : '';
  customerMaster = {version: 1, codes: [...codes], preferredOwner, exportedAt: data.updatedAt || new Date().toISOString()};
  customerMasterDirty = true;
  const before = chosen.size;
  const active = new Set(mergedSources().map(x => String(x.code)));
  chosen = new Set([...chosen].filter(code => active.has(code)));
  groups.clear();
  removeRouteLine();
  routeHint = '';
  dirty();
  render();
  // When the roster has one named salesperson plus a shared office code,
  // start with that salesperson rather than including the shared stores.
  const ownerBox = document.getElementById('ownerFilter');
  ownerBox.value = preferredOwner;
  render();
  dirty();
  const retired = [...previousCodes].filter(code => !codes.has(code)).length;
  const note = '已更新 ' + codes.size + ' 間客戶與執行人員；' + retired + ' 間不再列入目前名冊，' + changedOwners + ' 間變更負責人員。' + (preservedGps ? ' ' + preservedGps + ' 間公司座標缺漏，暫留原座標。' : '') + (before > chosen.size ? ' 已移出 ' + (before - chosen.size) + ' 間非目前名冊的行程店家。' : '');
  document.getElementById('customerStatus').textContent = note;
  return {count: codes.size, retired, changedOwners, preservedGps};
}
const rosterUpsertCustomers = upsertCustomers;
upsertCustomers = function (items) {
  const current = new Set(customerMaster?.codes || []);
  const previous = new Map(customerDb.map(x => [String(x.code), x]));
  rosterUpsertCustomers(items.map(x => ({...previous.get(String(x.code)), ...x, source: current.has(String(x.code)) ? 'company' : 'manual'})));
};
const rosterRender = render;
render = function () {
  rosterRender();
  const rows = scopeRecords(), owner = document.getElementById('ownerFilter').value;
  document.getElementById('responsibilitySummary').textContent = (owner || '全部目前人員') + ' · ' + rows.length + ' 間店 · ' + new Set(rows.map(x => x.channel || x.group)).size + ' 個通路';
  document.getElementById('customerMasterStatus').textContent = customerMaster ? '目前轄區依最新客戶名冊；拜訪統計中的歷史店家不計入缺訪。名冊更新：' + new Date(customerMaster.exportedAt).toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}) : '尚未更新目前客戶名冊；請先更新客戶資料，才能排除歷史轄區。';
};
document.getElementById('customerFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), {type: 'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: ''});
    if (!Object.keys(rows[0] || {}).some(x => x.trim() === '執行人員')) throw Error('缺少執行人員');
    const byCode = new Map();
    for (const parsed of parseCustomerRows(rows)) {
      const x = Object.fromEntries(['code','name','type','channel','grade','status','owner','gps'].map(field => [field, parsed[field]]));
      x.channel = x.channel.replace(/^[ ,，、]+|[ ,，、]+$/g, '');
      const previous = byCode.get(x.code);
      if (previous && JSON.stringify(previous) !== JSON.stringify(x)) throw Error('同代碼有不同客戶資料');
      byCode.set(x.code, x);
    }
    applyCompanyCustomers({customers: [...byCode.values()], updatedAt: new Date().toISOString()});
    toast('目前客戶名冊已更新，拜訪紀錄保留；請儲存到雲端');
  } catch (e) {
    toast('客戶名冊匯入失敗：' + (e.message || '請確認完整匯出格式'));
  } finally { e.target.value = ''; }
};
render();