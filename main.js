import { parseWorkbook } from './excelParser.js';
import { MappingService } from './mappingService.js';
import { DialogObserver } from './domObserver.js';
import { DialogController } from './dialogController.js';
import { settingsStore } from './storage.js';
import { Widget } from './widget.js';
import { logger } from './utils.js';

if (globalThis.__auditorAutoFillBooted) {
  logger.debug('Already running; ignoring duplicate content-script injection.');
} else {
  globalThis.__auditorAutoFillBooted = true;

let service = new MappingService(); let controller; let observer; let enabled = true; let platform = 'ios'; let widget; let recommendationsEnabled = true; let screenshotNamingEnabled = true; let nativeMobileDetailsEnabled = true;
const DEFAULT_MAPPING_VERSION = '2026-07-22-03';
const PRIMARY_MAPPING_FILE = 'data/Checkpoints_and_Descriptions.xlsx';
const FALLBACK_MAPPING_FILE = 'data/default-checkpoints.xlsx';
function status(message, level) { widget?.setStatus(message, level); }
function isPlatformCache(cache) {
  return cache && !Array.isArray(cache) && Array.isArray(cache.ios) && Array.isArray(cache.android);
}
function isPlatformReport(report) {
  return report && typeof report === 'object' && report.ios && report.android;
}
async function loadDefaultMapping(settings) {
  status('Loading checkpoint mapping…');
  const tryFile = async (filePath, allowFallback) => {
    const response = await fetch(chrome.runtime.getURL(filePath));
    if (!response.ok) {
      if (!allowFallback) throw new Error(`Unable to load ${filePath} (${response.status}).`);
      return null;
    }
    const { sheets, report } = parseWorkbook(await response.arrayBuffer());
    const mappingFileName = filePath.split('/').pop();
    logger.debug('Loaded workbook sheets', Object.keys(sheets), report, mappingFileName);
    await settingsStore.saveMapping(sheets, mappingFileName, report, DEFAULT_MAPPING_VERSION);
    return { ...settings, mappingCache: sheets, mappingFileName, mappingReport: report, mappingVersion: DEFAULT_MAPPING_VERSION };
  };
  let loaded = null;
  try {
    loaded = await tryFile(PRIMARY_MAPPING_FILE, true);
  } catch (primaryError) {
    logger.error('Primary mapping file failed to load or parse', primaryError);
    throw primaryError;
  }
  if (loaded) return loaded;
  try {
    const fallback = await tryFile(FALLBACK_MAPPING_FILE, false);
    if (fallback) return fallback;
  } catch (fallbackError) {
    logger.error('Fallback mapping file failed to load or parse', fallbackError);
    throw fallbackError;
  }
  throw new Error('No checkpoint mapping file found.');
}
function setPlatform(next) {
  platform = next === 'android' ? 'android' : 'ios';
  settingsStore.saveUi({ platform });
  if (widget) widget.setPlatform(platform);
  if (service) service.setPlatform(platform);
  if (controller?.refresh) controller.refresh();
  const count = service?.rows?.length ?? 0;
  status(`${platform === 'ios' ? 'iOS' : 'Android'} selected — ${count} rows available`, count ? 'success' : 'warning');
  observer?.scan();
}
function setRecommendationsEnabled(next) {
  recommendationsEnabled = Boolean(next);
  controller?.setRecommendationsEnabled?.(recommendationsEnabled);
}
function setScreenshotNamingEnabled(next) {
  screenshotNamingEnabled = Boolean(next);
  controller?.setScreenshotNamingEnabled?.(screenshotNamingEnabled);
}
// Native Mobile Details master toggle. When off, native autofill (Details +
// Recommendation) is disabled entirely; screenshot naming is unaffected.
function setNativeMobileDetailsEnabled(next) {
  nativeMobileDetailsEnabled = Boolean(next);
  controller?.setNativeMobileDetailsEnabled?.(nativeMobileDetailsEnabled);
}
async function boot() {
  let settings = await settingsStore.load(); platform = settings.platform || 'ios';
  recommendationsEnabled = settings.recommendations !== false;
  screenshotNamingEnabled = settings.screenshotNaming !== false;
  nativeMobileDetailsEnabled = settings.nativeMobileDetails !== false;
  widget = new Widget({ onPlatformChange: setPlatform, onClose: closeWidget, onRecommendationsChange: setRecommendationsEnabled, onScreenshotNamingChange: setScreenshotNamingEnabled, onNativeMobileDetailsChange: setNativeMobileDetailsEnabled }); await widget.mount(settings); widget.setPlatform(platform);
  try {
    settings = await loadDefaultMapping(settings);
    service.load(settings.mappingCache || []);
    widget.setFile(settings.mappingFileName, settings.mappingReport);
    service.setPlatform(platform);
    const count = service.rows.length;
    status(count ? `${platform === 'ios' ? 'iOS' : 'Android'} ready — ${count} rows available` : 'Mapping unavailable', count ? 'success' : 'warning');
  } catch (error) {
    logger.error('Unable to load checkpoint mapping', error);
    widget.setFile('No Excel file loaded', null);
    status(`Mapping load error: ${error.message}`, 'error');
    return;
  }
  // The observer reports which issue dialog is open ('add' | 'edit') and tears the old
  // controller down before building a new one, so no Summary or screenshot state
  // survives a switch between the Add Issue and Edit Issue dialogs.
  observer = new DialogObserver((dialog, dialogKind) => { if (enabled) { controller?.stop(); controller = new DialogController(dialog, service, status, (step) => widget?.setWorkflow(step), () => recommendationsEnabled, () => screenshotNamingEnabled, () => nativeMobileDetailsEnabled, dialogKind); controller.start(); } }, () => { controller?.stop(); controller = null; widget?.setWorkflow('checkpoint'); });
  observer.start();
}
function closeWidget() {
  controller?.stop();
  observer?.stop();
  document.querySelectorAll('#auditor-autofill-widget').forEach((element) => element.remove());
  widget = null;
}
function activateWidget() {
  if (widget?.element?.isConnected) {
    widget.element.classList.remove('collapsed');
    setPlatform(platform);
    widget.element.focus?.();
    return;
  }
  document.querySelectorAll('#auditor-autofill-widget').forEach((element) => element.remove());
  boot().catch((error) => logger.error('Extension failed to activate', error));
}
globalThis.addEventListener('auditor-autofill-activate', activateWidget);
if (globalThis.__auditorAutoFillRequested) activateWidget();
}
