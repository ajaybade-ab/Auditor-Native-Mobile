import { makeKey, normalizeText } from './utils.js';

const aliases = {
  checkpoint: ['checkpoint', 'success criterion', 'wcag'],
  description: ['description', 'issue description'],
  details: ['details', 'detail'],
  recommendation: ['recommendation', 'recommendation to fix', 'recommendation to fix / how to fix', 'how to fix']
};
const findColumn = (headers, names) => headers.findIndex((header) => names.includes(normalizeText(header)));
// Strip a single pair of surrounding double/smart quotes that Excel sometimes stores around cell text.
const stripSurroundingQuotes = (text) => text.replace(/^["“”]+|["“”]+$/g, '').trim();
const normalizeSheetName = (name) => String(name || '').trim().toLocaleLowerCase();
const platformFromSheet = (name) => {
  const normalized = normalizeSheetName(name);
  if (normalized.includes('ios')) return 'ios';
  if (normalized.includes('android')) return 'android';
  return null;
};

function parseSheet(sheet, sheetName) {
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!values.length) return null;
  const headers = values[0].map((cell) => String(cell));
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, findColumn(headers, names)]));
  const required = ['checkpoint', 'description', 'details'].filter((field) => columns[field] < 0);
  if (required.length) throw new Error(`Sheet "${sheetName}" is missing required column(s): ${required.join(', ')}.`);
  const duplicates = [];
  const seen = new Set();
  const rows = values.slice(1).map((cells, index) => ({
    checkpoint: String(cells[columns.checkpoint] ?? '').trim(),
    description: String(cells[columns.description] ?? '').trim(),
    details: String(cells[columns.details] ?? '').trim(),
    recommendation: columns.recommendation >= 0 ? stripSurroundingQuotes(String(cells[columns.recommendation] ?? '').trim()) : '',
    row: index + 2
  })).filter((row) => row.checkpoint && row.description);
  rows.forEach((row) => { const key = makeKey(row.checkpoint, row.description); if (seen.has(key)) duplicates.push(row.row); seen.add(key); });
  return { rows, report: { rows: rows.length, duplicates, missingDetails: rows.filter((row) => !row.details).map((row) => row.row) } };
}

export function parseWorkbook(arrayBuffer) {
  if (!globalThis.XLSX) throw new Error('The SheetJS library is unavailable. Reload the extension and try again.');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheets = {};
  const report = {};
  workbook.SheetNames.forEach((sheetName) => {
    const platform = platformFromSheet(sheetName);
    if (!platform) return;
    const parsed = parseSheet(workbook.Sheets[sheetName], sheetName);
    if (!parsed) return;
    sheets[platform] = parsed.rows;
    report[platform] = parsed.report;
  });
  if (!sheets.ios && !sheets.android) {
    const fallbackSheet = workbook.SheetNames[0];
    const parsed = parseSheet(workbook.Sheets[fallbackSheet], fallbackSheet);
    sheets.ios = sheets.android = parsed.rows;
    report.ios = report.android = parsed.report;
  }
  if (!sheets.ios && sheets.android) sheets.ios = sheets.android;
  if (!sheets.android && sheets.ios) sheets.android = sheets.ios;
  return { sheets, report };
}
