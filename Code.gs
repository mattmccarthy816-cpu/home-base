// Home Base — Google Apps Script
// Paste this entire file into Extensions → Apps Script → replace all code → Save → Deploy as Web App

const SS = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = p.action;
  const sheet  = p.sheet;

  try {
    let result;
    if      (action === "read")        result = readSheet(sheet);
    else if (action === "appendRow")   result = appendRow(sheet, JSON.parse(p.data));
    else if (action === "updateRow")   result = updateRow(sheet, p.matchCol, p.matchVal, JSON.parse(p.data));
    else if (action === "deleteRow")   result = deleteRow(sheet, p.matchCol, p.matchVal);
    else if (action === "resetHabits") result = resetHabits();
    else throw new Error("Unknown action: " + action);
    return ok(result);
  } catch(err) {
    return fail(String(err));
  }
}

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ success: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function fail(msg) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheet(name) {
  const s = SS.getSheetByName(name);
  if (!s) throw new Error("Sheet not found: " + name);
  const data = s.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] === undefined ? "" : row[i]; });
    return obj;
  });
}

function appendRow(name, rowData) {
  const s = SS.getSheetByName(name);
  if (!s) throw new Error("Sheet not found: " + name);
  const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    const v = rowData[String(h).trim()];
    return v !== undefined ? v : "";
  });
  s.appendRow(row);
  return { appended: true };
}

function updateRow(name, matchCol, matchVal, newData) {
  const s = SS.getSheetByName(name);
  if (!s) throw new Error("Sheet not found: " + name);
  const data    = s.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const colIdx  = headers.indexOf(String(matchCol).trim());
  if (colIdx === -1) throw new Error("Column not found: " + matchCol);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]).trim() === String(matchVal).trim()) {
      headers.forEach((h, j) => {
        if (newData[h] !== undefined) s.getRange(i + 1, j + 1).setValue(newData[h]);
      });
      return { updated: true, row: i + 1 };
    }
  }
  return { updated: false };
}

function deleteRow(name, matchCol, matchVal) {
  const s = SS.getSheetByName(name);
  if (!s) throw new Error("Sheet not found: " + name);
  const data    = s.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const colIdx  = headers.indexOf(String(matchCol).trim());
  if (colIdx === -1) throw new Error("Column not found: " + matchCol);
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIdx]).trim() === String(matchVal).trim()) {
      s.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

function resetHabits() {
  const s = SS.getSheetByName("Habits");
  if (!s) throw new Error("Habits sheet not found");
  const data    = s.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const doneCol = headers.indexOf("Done") + 1;
  if (!doneCol) throw new Error("Done column not found");
  for (let i = 2; i <= data.length; i++) s.getRange(i, doneCol).setValue(false);
  return { reset: true };
}

function createDailyTrigger() {
  ScriptApp.newTrigger("resetHabits").timeBased().atHour(0).everyDays(1).create();
}
