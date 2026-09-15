const XLSX = require('./lib/xlsx.full.min.js');
const path = 'data/Checkpoints_and_Descriptions.xlsx';
const wb = XLSX.readFile(path, { cellNF: false, cellDates: false });
wb.SheetNames.forEach((name) => {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = rows[0].map((v) => `${v}`.trim());
  const recIdx = headers.findIndex((h) => /recommendation/i.test(h));
  if (recIdx < 0) {
    console.log(`Sheet ${name}: no recommendation column`);
    return;
  }
  let total = 0, filled = 0;
  const samples = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const val = `${row[recIdx] || ''}`.trim();
    if (val) filled++;
    if (i <= 10) samples.push({ row: i + 2, value: val.slice(0, 120) });
    total++;
  }
  console.log(`Sheet ${name}: recommendation column index=${recIdx}, total rows=${total}, filled=${filled}`);
  console.log(' samples:', samples.slice(0, 10));
});
