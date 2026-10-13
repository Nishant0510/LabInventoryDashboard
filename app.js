/* Equipment register runs entirely in the browser. Imported data is never uploaded. */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let records = [];
let sourceHeaders = { Master: [], General: [] };
let connectedFileHandle = null;
let localWorkbookConnected = false;
let chartFilter = null;
const connectionDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('equipment-dashboard', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('connections');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const getSavedConnection = async () => {
  const db = await connectionDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction('connections', 'readonly').objectStore('connections').get('onedrive-workbook');
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
};
const saveConnection = async (handle) => {
  const db = await connectionDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction('connections', 'readwrite').objectStore('connections').put(handle, 'onedrive-workbook');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
};
let editingId = null;
let pendingRemoval = null;

const statusTone = (status = '') => {
  const s = status.toLowerCase();
  if (s.includes('calibrated - in-use') || s.includes('completed')) return 'completed';
  if (s.includes('work in process') || s.includes('work-in-process') || s.includes('under')) return 'progress';
  if (s.includes('not calibrated') || s.includes('do not') || s.includes('inactive') || s.includes('not in use')) return 'attention';
  return '';
};
const STATUS_OPTIONS = ['Calibrated - In-use', 'Calibration Not Required', 'Calibration Work in Process - Not in Use', 'Inactive – Not in USE', 'Not Calibrated – DO NOT USE'];
const isCalibrationComplete = (status = '') => /calibrated\s*-\s*in-use|calibration not required|completed/i.test(status);
const normalizeStatus = (status = '') => {
  const value = clean(status).toLowerCase();
  if (/calibrated\s*-\s*in-use|calibration not required|calibration work in process\s*-\s*not in use|inactive\s*[–-]\s*not in use|not calibrated\s*[–-]\s*do not use/.test(value)) return STATUS_OPTIONS.find(option => option.toLowerCase() === value) || STATUS_OPTIONS.find(option => option.toLowerCase().replace('–', '-').replace(/\s+/g, ' ') === value.replace('–', '-').replace(/\s+/g, ' ')) || status;
  if (value.includes('completed') || value === 'calibrated' || value === 'calibrated - in use') return STATUS_OPTIONS[0];
  if (value.includes('not required')) return STATUS_OPTIONS[1];
  if (value.includes('work') || value.includes('under calibration')) return STATUS_OPTIONS[2];
  if (value.includes('inactive')) return STATUS_OPTIONS[3];
  if (value.includes('yet to send') || value.includes('not calibrated') || value.includes('do not use') || value.includes('out of calibration')) return STATUS_OPTIONS[4];
  return clean(status);
};
const REGISTER_HEADERS = ['Sr. No.', 'Equipment Unique ID No.', 'Equipment Name', 'Description', 'Make', 'Model', 'Equipment serial no.', 'Calibration Required [Yes/No]', 'Calibration Frequency', 'Remark Justification if calibration is not required', 'Registration ID', 'Calibration Date (DD-MMM-YY)', 'Calibration Due Date (DD-MMM-YY)', 'Current Status', 'Calibration Certiifcate ID', 'Master Validation Plan Document ID(If Applicable)', 'Qualification Done on date (DD-MMM-YY)', 'Qualification Report No (Not applicable for manufacturing aid tool)', 'Requalification Frequency', 'Remark', 'PM/Maintenance Required [Yes/No]', 'PM Registration Form ID', 'PM Status', 'PM Date (DD-MMM-YY)', 'PM Due Date (DD-MMM-YY)', 'PM Report ID', 'OOT Record ID, if any'];
const normalizeHeader = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_KEYS = {
  id: ['Equipment Unique ID No.'], name: ['Equipment Name'], description: ['Description'], make: ['Make'], model: ['Model'], serial: ['Equipment serial no.'], calibrationRequired: ['Calibration Required [Yes/No]'], calibrationFrequency: ['Calibration Frequency'], calibrationNotRequiredRemark: ['Remark Justification if calibration is not required'], registrationId: ['Registration ID'], calibrationDate: ['Calibration Date (DD-MMM-YY)', 'Calibration Date'], calibrationDue: ['Calibration Due Date (DD-MMM-YY)', 'Calibration Due Date'], status: ['Current Status'], calibrationCertificateId: ['Calibration Certificate ID', 'Calibration Certiifcate ID'], validationPlanId: ['Master Validation Plan Document ID (If Applicable)', 'Master Validation Plan Document ID(If Applicable)'], qualificationDate: ['Qualification Done on date (DD-MMM-YY)', 'Qualification Done on date'], qualificationReportId: ['Qualification Report No (Not applicable for manufacturing aid tool)'], requalificationFrequency: ['Requalification Frequency'], remark: ['Remark'], pmRequired: ['PM/Maintenance Required [Yes/No]'], pmRegistrationFormId: ['PM Registration Form ID'], pmStatus: ['PM Status'], pmDate: ['PM Date (DD-MMM-YY)', 'PM Date'], pmDue: ['PM Due Date (DD-MMM-YY)', 'PM Due Date'], pmReportId: ['PM Report ID'], ootRecordId: ['OOT Record ID, if any', 'OOT Record ID']
};
function headerIndexes(headers) {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(Object.entries(HEADER_KEYS).map(([key, candidates]) => [key, candidates.map(normalizeHeader).map(candidate => normalized.indexOf(candidate)).find(index => index >= 0) ?? -1]));
}
const display = (value) => value && value !== 'N/A' ? value : '—';
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const isMissing = (value) => !clean(value) || clean(value).toLowerCase() === 'n/a';
const isoDate = (value) => {
  if (!value || clean(value).toUpperCase() === 'N/A') return '';
  if (value instanceof Date && !Number.isNaN(value)) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};
const formatDate = (date) => date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`)) : '—';
const formatRegisterDate = (date) => date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).format(new Date(`${date}T00:00:00`)).replace(/ /g, '-') : '';
const dueBucket = (date) => {
  if (!date) return 'No due date';
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(`${date}T00:00:00`);
  const days = Math.ceil((target - today) / 86400000);
  if (days < 0) return 'Overdue';
  if (days <= 30) return 'Due in 30 days';
  if (days <= 90) return 'Due in 31–90 days';
  return 'Due later';
};
const nearestDueDays = (record) => {
  const dates = [record.calibrationDue, record.pmDue].filter(Boolean).map(date => Math.ceil((new Date(`${date}T00:00:00`) - new Date(new Date().setHours(0,0,0,0))) / 86400000));
  return dates.length ? Math.min(...dates) : null;
};
const countBy = (items, value) => items.reduce((out, item) => { const key = value(item) || 'Not specified'; out[key] = (out[key] || 0) + 1; return out; }, {});
const topEntries = (object, take = 6) => Object.entries(object).sort((a,b) => b[1] - a[1]).slice(0, take);

function showView(view) {
  $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `${view}-view`));
  $('#page-title').textContent = ({ overview: 'S&RC Pune Lab Equipment Inventory', equipment: 'S&RC Pune Lab Equipment Inventory', visuals: 'S&RC Pune Lab Equipment Inventory', restricted: 'S&RC Pune Lab Equipment Inventory' })[view];
}

function makeDonut(container, data, size = 'donut', filterType = '') {
  const entries = topEntries(data, 6);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) { container.className = `${size} empty-chart`; container.textContent = 'No data available'; return; }
  const colors = ['#2e69ff','#7657eb','#1cae9e','#f59a44','#e65d6f','#8c98aa'];
  let cursor = 0;
  const stops = entries.map(([, value], index) => { const start = cursor; cursor += value / total * 360; return `${colors[index]} ${start}deg ${cursor}deg`; }).join(',');
  container.className = size === 'donut' ? 'donut-area' : 'large-donut';
  container.innerHTML = `<div class="${size}" style="background:conic-gradient(${stops})"><span class="donut-label"><b>${total}</b><span>items</span></span></div><div class="legend">${entries.map(([label, value], index) => `<button class="legend-row chart-control" data-chart-filter="${filterType}" data-value="${encodeURIComponent(label)}"><span><i style="background:${colors[index]}"></i>${label}</span><b>${value}</b></button>`).join('')}</div>`;
}

function makeBars(container, data, filterType = '') {
  const entries = topEntries(data, 6);
  const max = Math.max(...entries.map(([,value]) => value), 1);
  if (!entries.length) { container.className = 'bar-chart empty-chart'; container.textContent = 'No data available'; return; }
  container.className = 'bar-chart';
  container.innerHTML = entries.map(([label, value]) => `<button class="bar-row chart-control" data-chart-filter="${filterType}" data-value="${encodeURIComponent(label)}"><span class="bar-label" title="${label}">${label}</span><div class="bar-track"><div class="bar-fill" style="width:${value / max * 100}%"></div></div><b>${value}</b></button>`).join('');
}

function makeMonthChart(container) {
  const today = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date), calibration: 0, pm: 0 };
  });
  const lookup = Object.fromEntries(months.map(month => [month.key, month]));
  records.forEach(record => {
    if (record.calibrationDue?.slice(0, 7) in lookup) lookup[record.calibrationDue.slice(0, 7)].calibration++;
    if (record.pmDue?.slice(0, 7) in lookup) lookup[record.pmDue.slice(0, 7)].pm++;
  });
  const max = Math.max(...months.flatMap(month => [month.calibration, month.pm]), 1);
  container.className = 'month-chart';
  container.innerHTML = months.map(month => `<button class="month-column chart-control" data-chart-filter="month" data-value="${month.key}"><span class="month-value">${month.calibration + month.pm}</span><div class="month-bars" title="${month.label}: ${month.calibration} calibration, ${month.pm} maintenance"><i class="month-bar" style="height:${Math.max(3, month.calibration / max * 130)}px"></i><i class="month-bar pm" style="height:${Math.max(3, month.pm / max * 130)}px"></i></div><span class="month-label">${month.label}</span></button>`).join('') + '<div class="month-legend"><span><i></i>Calibration</span><span><i class="pm"></i>Maintenance</span></div>';
}

function makeAlertChart(container) {
  const counts = { Overdue: 0, 'Due in 7 days': 0, 'Due in 30 days': 0, 'Due in 90 days': 0 };
  records.forEach(record => {
    const days = nearestDueDays(record);
    if (days === null) return;
    if (days < 0) counts.Overdue++;
    else if (days <= 7) counts['Due in 7 days']++;
    else if (days <= 30) counts['Due in 30 days']++;
    else if (days <= 90) counts['Due in 90 days']++;
  });
  container.className = 'alert-grid';
  container.innerHTML = Object.entries(counts).map(([label, value]) => `<button class="alert-card chart-control ${label === 'Overdue' ? 'overdue' : ''}" data-chart-filter="alertWindow" data-value="${encodeURIComponent(label)}"><b>${value}</b><span>${label}</span></button>`).join('');
}

function makeComplianceGauge(container) {
  const required = records.filter(record => record.calibrationRequired.toLowerCase() === 'yes');
  const completed = required.filter(record => isCalibrationComplete(record.status)).length;
  const percent = required.length ? Math.round(completed / required.length * 100) : 0;
  container.className = 'gauge-wrap';
  container.innerHTML = `<button class="gauge chart-control" data-chart-filter="status" data-value="Completed" title="View completed calibration equipment"><span class="gauge-ring" style="--completion:${percent * 1.8}deg"></span><span class="gauge-value">${percent}%<small>${completed} of ${required.length} complete</small></span></button>`;
}

function makeDocumentationTracker(container) {
  const calMissing = records.filter(record => record.calibrationRequired.toLowerCase() === 'yes' && (!record.calibrationCertificateId || record.calibrationCertificateId.toLowerCase() === 'n/a')).length;
  const pmMissing = records.filter(record => record.pmRequired.toLowerCase() === 'yes' && (!record.pmReportId || record.pmReportId.toLowerCase() === 'n/a')).length;
  makeBars(container, { 'Calibration certificate missing': calMissing, 'PM report missing': pmMissing }, 'documentation');
}

function makeSapChart(container) {
  makeDonut(container, countBy(records, record => record.sapUploaded?.toLowerCase() === 'yes' ? 'Uploaded to SAP' : 'Pending SAP update'), 'mini-donut', 'sap');
}

function makeQualityChart(container) {
  makeBars(container, {
    'Serial number missing': records.filter(record => isMissing(record.serial)).length,
    'Model missing': records.filter(record => isMissing(record.model)).length,
    'Calibration due date missing': records.filter(record => record.calibrationRequired.toLowerCase() === 'yes' && isMissing(record.calibrationDue)).length,
    'Equipment make missing': records.filter(record => isMissing(record.make)).length
  }, 'dataQuality');
}

function updateDashboard() {
  const statuses = countBy(records, record => record.status || 'Not specified');
  const completed = records.filter(record => isCalibrationComplete(record.status)).length;
  const attention = records.filter(record => !isCalibrationComplete(record.status) && record.status && record.status.toUpperCase() !== 'N/A').length;
  const dueSoon = records.filter(record => ['Overdue', 'Due in 30 days'].includes(dueBucket(record.calibrationDue)) || ['Overdue', 'Due in 30 days'].includes(dueBucket(record.pmDue))).length;
  $('#total-count').textContent = records.length.toLocaleString();
  $('#total-detail').textContent = `${records.filter(r => r.type === 'Master').length} master · ${records.filter(r => r.type === 'General').length} general`;
  $('#complete-count').textContent = completed.toLocaleString();
  $('#complete-detail').textContent = records.length ? `${Math.round(completed / records.length * 100)}% of register` : 'Status not loaded';
  $('#attention-count').textContent = attention.toLocaleString();
  $('#attention-detail').textContent = attention ? 'Calibration status needs action' : 'No open calibration actions';
  $('#due-count').textContent = dueSoon.toLocaleString();
  $('#due-detail').textContent = dueSoon ? 'Calibration or maintenance' : 'No upcoming dates';
  $('#attention-badge').textContent = `${attention + dueSoon} items`;
  makeDonut($('#status-chart'), statuses, 'donut', 'status');
  makeDonut($('#visual-status'), statuses, 'mini-donut', 'status');
  makeBars($('#make-chart'), countBy(records, record => record.make || 'Not specified'), 'make');
  makeBars($('#due-chart'), countBy(records.filter(record => record.calibrationDue), record => dueBucket(record.calibrationDue)), 'dueBucket');
  makeDonut($('#maintenance-chart'), countBy(records, record => record.pmRequired || 'Not specified'), 'mini-donut', 'pmRequired');
  makeMonthChart($('#month-chart'));
  makeAlertChart($('#alert-chart'));
  makeComplianceGauge($('#compliance-gauge'));
  makeDocumentationTracker($('#documentation-chart'));
  makeSapChart($('#sap-chart'));
  makeQualityChart($('#quality-chart'));
  renderAttention(); renderRecent(); renderRestricted(); populateStatusFilter(); renderEquipmentTable();
}

function renderAttention() {
  const allCandidates = records.map(record => ({ record, bucket: dueBucket(record.calibrationDue), pmBucket: dueBucket(record.pmDue) })).filter(({record, bucket, pmBucket}) => bucket === 'Overdue' || bucket === 'Due in 30 days' || pmBucket === 'Overdue' || pmBucket === 'Due in 30 days' || statusTone(record.status) === 'attention');
  const candidates = allCandidates.slice(0, 5);
  const overdueCount = allCandidates.filter(({ bucket, pmBucket }) => bucket === 'Overdue' || pmBucket === 'Overdue').length;
  $('#view-all-overdue').hidden = overdueCount === 0;
  $('#view-all-overdue').textContent = `View all overdue items (${overdueCount}) →`;
  $('#attention-list').className = candidates.length ? 'action-list' : 'action-list empty-list';
  $('#attention-list').innerHTML = candidates.length ? candidates.map(({record, bucket, pmBucket}) => { const overdue = bucket === 'Overdue' || pmBucket === 'Overdue'; const label = overdue ? 'Overdue' : bucket === 'Due in 30 days' ? 'Calibration due soon' : pmBucket === 'Due in 30 days' ? 'PM due soon' : record.status; return `<div class="action-item"><i class="urgency ${overdue ? 'overdue' : ''}"></i><div><b>${record.name || record.id}</b><span>${record.id} · ${label}</span></div></div>`; }).join('') : 'No immediate calibration or maintenance actions.';
}

function renderRecent() {
  const rows = records.slice(-6).reverse();
  $('#recent-table').innerHTML = rows.length ? rows.map(record => `<tr><td>${record.name || 'Unnamed equipment'}<br><button class="detail-id" data-details="${record.uid}">${record.id}</button></td><td>${record.type}</td><td><span class="status-pill ${statusTone(record.status)}">${display(record.status)}</span></td><td>${formatDate(record.calibrationDue)}</td><td>${display(record.pmStatus)}</td><td><button class="text-button" data-edit="${record.uid}">Edit</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Your register will appear here after import.</td></tr>';
}

function renderRestricted() {
  const rows = records.filter(record => /inactive|do not use|not in use|not calibrated|out of calibration/.test(record.status.toLowerCase()));
  $('#restricted-table').innerHTML = rows.length ? rows.map(record => `<tr><td><button class="detail-id" data-details="${record.uid}">${record.id}</button></td><td>${record.name}</td><td><span class="status-pill attention">${record.status}</span></td><td>${formatDate(record.calibrationDue)}</td><td>${display(record.remark)}</td><td><button class="text-button" data-edit="${record.uid}">Edit</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">No inactive or do-not-use equipment records found.</td></tr>';
}

function renderEquipmentTable() {
  const term = clean($('#search-input').value).toLowerCase();
  const type = $('#type-filter').value, status = $('#status-filter').value, due = $('#due-filter').value;
  const isOverdue = (record) => dueBucket(record.calibrationDue) === 'Overdue' || dueBucket(record.pmDue) === 'Overdue';
  const isDueSoon = (record) => ['Overdue', 'Due in 30 days'].includes(dueBucket(record.calibrationDue)) || ['Overdue', 'Due in 30 days'].includes(dueBucket(record.pmDue));
  const matchesChart = (record) => {
    if (!chartFilter) return true;
    if (chartFilter.type === 'make') return (record.make || 'Not specified') === chartFilter.value;
    if (chartFilter.type === 'pmRequired') return (record.pmRequired || 'Not specified') === chartFilter.value;
    if (chartFilter.type === 'dueBucket') return dueBucket(record.calibrationDue) === chartFilter.value;
    if (chartFilter.type === 'month') return record.calibrationDue?.startsWith(chartFilter.value) || record.pmDue?.startsWith(chartFilter.value);
    if (chartFilter.type === 'documentation') return chartFilter.value === 'Calibration certificate missing' ? record.calibrationRequired.toLowerCase() === 'yes' && (!record.calibrationCertificateId || record.calibrationCertificateId.toLowerCase() === 'n/a') : record.pmRequired.toLowerCase() === 'yes' && (!record.pmReportId || record.pmReportId.toLowerCase() === 'n/a');
    if (chartFilter.type === 'sap') return chartFilter.value === 'Uploaded to SAP' ? clean(record.sapUploaded).toLowerCase() === 'yes' : clean(record.sapUploaded).toLowerCase() !== 'yes';
    if (chartFilter.type === 'dataQuality') return chartFilter.value === 'Serial number missing' ? isMissing(record.serial) : chartFilter.value === 'Model missing' ? isMissing(record.model) : chartFilter.value === 'Calibration due date missing' ? record.calibrationRequired.toLowerCase() === 'yes' && isMissing(record.calibrationDue) : isMissing(record.make);
    if (chartFilter.type === 'alertWindow') {
      const days = nearestDueDays(record);
      return chartFilter.value === 'Overdue' ? days < 0 : chartFilter.value === 'Due in 7 days' ? days >= 0 && days <= 7 : chartFilter.value === 'Due in 30 days' ? days > 7 && days <= 30 : days > 30 && days <= 90;
    }
    return true;
  };
  const rows = records.filter(record => (!term || [record.id, record.name, record.make, record.model, record.serial].join(' ').toLowerCase().includes(term)) && (type === 'all' || record.type === type) && (status === 'all' || record.status === status) && (due === 'all' || due === 'overdue' && isOverdue(record) || due === 'due-soon' && isDueSoon(record)) && matchesChart(record));
  $('#equipment-table').innerHTML = rows.length ? rows.map(record => `<tr><td><button class="detail-id" data-details="${record.uid}">${display(record.id)}</button></td><td>${display(record.name)}</td><td>${display([record.make, record.model].filter(Boolean).join(' · '))}</td><td>${record.type}</td><td><span class="status-pill ${statusTone(record.status)}">${display(record.status)}</span></td><td>${formatDate(record.calibrationDue)}</td><td>${display(record.pmStatus)}</td><td><div class="row-actions"><button data-edit="${record.uid}">Edit</button><button class="remove" data-remove="${record.uid}">Remove</button></div></td></tr>`).join('') : '<tr><td colspan="8" class="empty-cell">No equipment matches these filters.</td></tr>';
  $('#table-footer').textContent = `${rows.length.toLocaleString()} of ${records.length.toLocaleString()} records`;
}

function populateStatusFilter() {
  const select = $('#status-filter'), current = select.value;
  select.innerHTML = '<option value="all">All statuses</option>' + Object.keys(countBy(records, record => record.status || 'Not specified')).sort().map(status => `<option>${status}</option>`).join('');
  select.value = [...select.options].some(option => option.value === current) ? current : 'all';
}

function recordFromRow(row, type, uid, headers) {
  const indexes = headerIndexes(headers);
  const get = (key) => indexes[key] >= 0 ? row[indexes[key]] : '';
  const date = (key) => isoDate(get(key));
  return { uid, type, raw: [...row], id: clean(get('id')), name: clean(get('name')), description: clean(get('description')), make: clean(get('make')), model: clean(get('model')), serial: clean(get('serial')), calibrationRequired: clean(get('calibrationRequired')), calibrationFrequency: clean(get('calibrationFrequency')), calibrationNotRequiredRemark: clean(get('calibrationNotRequiredRemark')), registrationId: clean(get('registrationId')), calibrationDate: date('calibrationDate'), calibrationDue: date('calibrationDue'), status: normalizeStatus(get('status')), calibrationCertificateId: clean(get('calibrationCertificateId')), validationPlanId: clean(get('validationPlanId')), qualificationDate: date('qualificationDate'), qualificationReportId: clean(get('qualificationReportId')), requalificationFrequency: clean(get('requalificationFrequency')), remark: clean(get('remark')), pmRequired: clean(get('pmRequired')), pmRegistrationFormId: clean(get('pmRegistrationFormId')), pmStatus: clean(get('pmStatus')), pmDate: date('pmDate'), pmDue: date('pmDue'), pmReportId: clean(get('pmReportId')), ootRecordId: clean(get('ootRecordId')) };
}

function importWorkbook(file, { connected = false } = {}) {
  if (!window.XLSX) { alert('The Excel reader could not be loaded. Please check your internet connection and try again.'); return; }
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const workbook = XLSX.read(event.target.result, { type: 'array', cellDates: true });
      const findEquipmentSheet = (type) => {
        const expectedNames = [`List of ${type} Equipment`, `${type} Equipment`];
        const directMatch = expectedNames.find(name => workbook.Sheets[name]);
        if (directMatch) return workbook.Sheets[directMatch];
        const matchingName = workbook.SheetNames.find(name => {
          const header = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, range: 0, defval: '' })[0] || [];
          return name.toLowerCase().includes(type.toLowerCase()) && header.some(cell => clean(cell).toLowerCase().includes('equipment unique'));
        });
        return matchingName ? workbook.Sheets[matchingName] : null;
      };
      const master = findEquipmentSheet('Master');
      const general = findEquipmentSheet('General');
      if (!master && !general) throw new Error('The expected equipment tabs were not found.');
      records = [];
      [[master, 'Master'], [general, 'General']].forEach(([sheet, type]) => {
        if (!sheet) return;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
        sourceHeaders[type] = rows[0] || [];
        rows.slice(1).forEach((row, index) => {
          if (clean(row[headerIndexes(sourceHeaders[type]).id]) && clean(row[headerIndexes(sourceHeaders[type]).id]).toLowerCase() !== 'equipment unique id no.') records.push(recordFromRow(row, type, `${type}-${index}-${Date.now()}`, sourceHeaders[type]));
        });
      });
      $('#source-label').textContent = `${file.name.length > 27 ? `${file.name.slice(0, 27)}…` : file.name}`;
      $('#notice').innerHTML = connected ? `<span>✓</span><div><b>Connected to ${file.name}</b><p>${records.length.toLocaleString()} equipment records loaded. Use <b>Save to OneDrive file</b> to write dashboard changes back to this workbook.</p></div>` : `<span>✓</span><div><b>${records.length.toLocaleString()} equipment records imported</b><p>You can now add, edit, remove, filter, visualise, and export the updated register. Connect the OneDrive file to save back to it directly.</p></div>`;
      updateDashboard();
    } catch (error) { alert(`Could not import this workbook: ${error.message}`); }
  };
  reader.readAsArrayBuffer(file);
}

async function connectOneDriveWorkbook() {
  if (!window.showOpenFilePicker) { alert('Direct file connection is supported in Microsoft Edge. Use Import workbook if your browser does not support it.'); return; }
  try {
    if (connectedFileHandle) {
      const permission = await connectedFileHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        const file = await connectedFileHandle.getFile();
        $('#reload-sheet').hidden = false; $('#save-sheet').hidden = false;
        importWorkbook(file, { connected: true });
        return;
      }
    }
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Excel workbooks', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] } }]
    });
    connectedFileHandle = handle;
    await saveConnection(handle);
    const file = await handle.getFile();
    $('#reload-sheet').hidden = false; $('#save-sheet').hidden = false;
    importWorkbook(file, { connected: true });
  } catch (error) {
    if (error.name !== 'AbortError') alert(`Could not connect the workbook: ${error.message}`);
  }
}

async function restoreSavedConnection() {
  if (!window.showOpenFilePicker) return;
  try {
    const handle = await getSavedConnection();
    if (!handle) return;
    connectedFileHandle = handle;
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      $('#reload-sheet').hidden = false; $('#save-sheet').hidden = false;
      importWorkbook(await handle.getFile(), { connected: true });
    } else {
      $('#connect-sheet').textContent = '⌁ Reconnect saved OneDrive file';
      $('#notice').innerHTML = '<span>ⓘ</span><div><b>Saved OneDrive connection found</b><p>Select <b>Reconnect saved OneDrive file</b> to grant Edge access again. You will not need to locate the workbook.</p></div>';
    }
  } catch (_) {
    // Browser policies can block persisted file handles; manual connection remains available.
  }
}

async function reloadConnectedWorkbook() {
  if (localWorkbookConnected) return loadLocalWorkbook();
  if (!connectedFileHandle) return;
  try { importWorkbook(await connectedFileHandle.getFile(), { connected: true }); }
  catch (error) { alert(`Could not reload the connected workbook: ${error.message}`); }
}

async function loadLocalWorkbook() {
  try {
    const response = await fetch('/api/equipment-workbook', { cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    localWorkbookConnected = true;
    $('#reload-sheet').hidden = false; $('#save-sheet').hidden = false;
    $('#connect-sheet').textContent = '⌁ OneDrive file connected';
    importWorkbook(new File([blob], 'ER2248444_SRC Pune_Master List of Equipment & Tools_V_ _.xlsx', { type: blob.type }), { connected: true });
  } catch (error) {
    $('#notice').innerHTML = `<span>ⓘ</span><div><b>Automatic OneDrive connection is unavailable</b><p>${error.message} Use Connect OneDrive file as a fallback.</p></div>`;
  }
}

function openEditor(record) {
  editingId = record?.uid || null;
  const form = $('#equipment-form'); form.reset();
  $('#form-mode').textContent = record ? 'Edit record' : 'New record'; $('#dialog-title').textContent = record ? 'Update equipment' : 'Add equipment';
  if (record) Object.entries(record).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ''; });
  $('#equipment-dialog').showModal();
}

function saveRecord(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  const value = Object.fromEntries(form.entries());
  if (editingId) { const index = records.findIndex(record => record.uid === editingId); records[index] = { ...records[index], ...value }; }
  else records.push({ ...value, uid: `manual-${Date.now()}`, raw: [], description: '', calibrationFrequency: '', calibrationDate: '', pmDate: '' });
  $('#equipment-dialog').close(); updateDashboard(); showView('equipment');
}

function openDetails(record) {
  if (!record) return;
  $('#details-title').textContent = `${record.name || 'Equipment'} · ${record.id}`;
  const fields = {
    'Equipment type': record.type, 'Equipment ID': record.id, 'Equipment name': record.name, 'Description': record.description, 'Make': record.make, 'Model': record.model, 'Equipment serial no.': record.serial,
    'Calibration required': record.calibrationRequired, 'Calibration frequency': record.calibrationFrequency, 'Calibration not-required justification': record.calibrationNotRequiredRemark, 'Registration ID': record.registrationId, 'Calibration date': formatDate(record.calibrationDate), 'Calibration due date': formatDate(record.calibrationDue), 'Current status': record.status,
    'Calibration certificate ID': record.calibrationCertificateId, 'Master validation plan document ID': record.validationPlanId, 'Qualification date': formatDate(record.qualificationDate), 'Qualification report no.': record.qualificationReportId, 'Requalification frequency': record.requalificationFrequency, 'Remark': record.remark,
    'PM/maintenance required': record.pmRequired, 'PM registration form ID': record.pmRegistrationFormId, 'PM status': record.pmStatus, 'PM date': formatDate(record.pmDate), 'PM due date': formatDate(record.pmDue), 'PM report ID': record.pmReportId, 'OOT record ID': record.ootRecordId
  };
  $('#details-content').innerHTML = Object.entries(fields).map(([label, value]) => `<div class="detail-item"><small>${label}</small><b>${display(value)}</b></div>`).join('');
  $('#details-dialog').showModal();
}

function reportRecords(type) {
  if (type === 'overdue') return records.filter(record => nearestDueDays(record) < 0);
  if (type === 'monthly') return records.filter(record => { const days = nearestDueDays(record); return days !== null && days >= 0 && days <= 183; });
  if (type === 'documentation') return records.filter(record => record.calibrationRequired.toLowerCase() === 'yes' && isMissing(record.calibrationCertificateId) || record.pmRequired.toLowerCase() === 'yes' && isMissing(record.pmReportId));
  return records.filter(record => clean(record.sapUploaded).toLowerCase() !== 'yes');
}

function exportReport() {
  if (!window.XLSX) { alert('The Excel exporter could not be loaded. Please check your internet connection and try again.'); return; }
  const type = $('#report-type').value, items = reportRecords(type);
  const labels = { overdue: 'Overdue Equipment', monthly: 'Six Month Work Plan', documentation: 'Missing Documentation', sap: 'SAP Pending' };
  const data = items.map(record => ({ 'Equipment ID': record.id, 'Equipment Name': record.name, Type: record.type, Make: record.make, Model: record.model, 'Serial No.': record.serial, 'Calibration Status': record.status, 'Calibration Due Date': record.calibrationDue, 'Calibration Certificate ID': record.calibrationCertificateId, 'PM Status': record.pmStatus, 'PM Due Date': record.pmDue, 'PM Report ID': record.pmReportId, 'Uploaded in SAP': record.sapUploaded, Remarks: record.remark }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), labels[type].slice(0, 31));
  XLSX.writeFile(book, `${labels[type].replace(/ /g, '_')}_Report.xlsx`);
}

function buildWorkbook() {
  if (!records.length) { alert('Import or add equipment before exporting.'); return; }
  if (!window.XLSX) { alert('The Excel exporter could not be loaded. Please check your internet connection and try again.'); return; }
  const values = (items) => [REGISTER_HEADERS, ...items.map((record, index) => [index + 1, record.id, record.name, record.description, record.make, record.model, record.serial, record.calibrationRequired, record.calibrationFrequency, record.calibrationNotRequiredRemark, record.registrationId, formatRegisterDate(record.calibrationDate), formatRegisterDate(record.calibrationDue), record.status, record.calibrationCertificateId, record.validationPlanId, formatRegisterDate(record.qualificationDate), record.qualificationReportId, record.requalificationFrequency, record.remark, record.pmRequired, record.pmRegistrationFormId, record.pmStatus, formatRegisterDate(record.pmDate), formatRegisterDate(record.pmDue), record.pmReportId, record.ootRecordId])];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(values(records.filter(record => record.type === 'Master'))), 'Master Equipment');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(values(records.filter(record => record.type === 'General'))), 'General Equipment');
  return book;
}

function exportWorkbook() {
  const book = buildWorkbook();
  if (!book) return;
  XLSX.writeFile(book, 'Pune_Equipment_Register_Updated.xlsx');
}

async function saveConnectedWorkbook() {
  const book = buildWorkbook();
  if (!book) return;
  try {
    if (localWorkbookConnected) {
      const response = await fetch('/api/equipment-workbook', { method: 'PUT', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: XLSX.write(book, { bookType: 'xlsx', type: 'array' }) });
      if (!response.ok) throw new Error(await response.text());
      $('#notice').innerHTML = '<span>✓</span><div><b>Workbook saved to OneDrive</b><p>Your current equipment register and dashboard edits were written to the configured Excel file.</p></div>';
      return;
    }
    if (!connectedFileHandle) { alert('Connect a OneDrive workbook before saving to it.'); return; }
    const writable = await connectedFileHandle.createWritable();
    await writable.write(XLSX.write(book, { bookType: 'xlsx', type: 'array' }));
    await writable.close();
    $('#notice').innerHTML = '<span>✓</span><div><b>Workbook saved to OneDrive</b><p>Your current equipment register and dashboard edits were written to the connected Excel file.</p></div>';
  } catch (error) { alert(`Could not save to the connected workbook: ${error.message}`); }
}

$('#workbook-input').addEventListener('change', event => event.target.files[0] && importWorkbook(event.target.files[0]));
$('#connect-sheet').addEventListener('click', connectOneDriveWorkbook);
$('#add-equipment').addEventListener('click', () => openEditor());
$('#close-dialog').addEventListener('click', () => $('#equipment-dialog').close());
$('#cancel-dialog').addEventListener('click', () => $('#equipment-dialog').close());
$('#equipment-form').addEventListener('submit', saveRecord);
$('#search-input').addEventListener('input', renderEquipmentTable);
$('#type-filter').addEventListener('change', renderEquipmentTable);
$('#status-filter').addEventListener('change', renderEquipmentTable);
$('#due-filter').addEventListener('change', renderEquipmentTable);
$('#export-report').addEventListener('click', exportReport);
$('#view-all-overdue').addEventListener('click', () => { $('#due-filter').value = 'overdue'; showView('equipment'); renderEquipmentTable(); });
$('#clear-chart-filter').addEventListener('click', () => { chartFilter = null; $('#clear-chart-filter').hidden = true; renderEquipmentTable(); });
restoreSavedConnection();
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') loadLocalWorkbook();
$('#export-workbook').addEventListener('click', exportWorkbook);
$('#reload-sheet').addEventListener('click', reloadConnectedWorkbook);
$('#save-sheet').addEventListener('click', saveConnectedWorkbook);
$$('.nav-link').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener('click', () => showView(button.dataset.go)));
document.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit]'); const remove = event.target.closest('[data-remove]');
  const details = event.target.closest('[data-details]');
  const filter = event.target.closest('[data-chart-filter]');
  if (edit) openEditor(records.find(record => record.uid === edit.dataset.edit));
  if (remove) { pendingRemoval = remove.dataset.remove; $('#confirm-copy').textContent = `Remove ${records.find(record => record.uid === pendingRemoval)?.name || 'this equipment'} from the register?`; $('#confirm-dialog').showModal(); }
  if (details) openDetails(records.find(record => record.uid === details.dataset.details));
  if (filter) {
    const type = filter.dataset.chartFilter, value = decodeURIComponent(filter.dataset.value);
    if (type === 'status') { $('#status-filter').value = value; chartFilter = null; $('#clear-chart-filter').hidden = true; }
    else { chartFilter = { type, value }; $('#clear-chart-filter').hidden = false; }
    showView('equipment'); renderEquipmentTable();
  }
});
$('#confirm-remove').addEventListener('click', () => { records = records.filter(record => record.uid !== pendingRemoval); pendingRemoval = null; updateDashboard(); });
