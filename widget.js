import { settingsStore } from './storage.js';

const template = `
  <header><strong>Auditor Smart Auto Fill</strong><button type="button" data-action="close" aria-label="Close widget">×</button></header>
  <section data-part="body">
    <!-- Native Mobile Details master toggle: controls visibility of the entire native
         autofill section (Excel file info, platform tabs, Recommendations, and the
         mapping status) and enables/disables the native autofill behavior itself.
         Screenshot Naming lives OUTSIDE this group so it stays visible and functional
         even when native autofill is turned off. -->
    <label class="switch"><input type="checkbox" data-part="native-mobile-details"> Native Mobile Details</label>
    <div data-part="native-group">
      <p class="file" data-part="file">No Excel file loaded</p>
      <div class="platforms" role="group" aria-label="Platform selection">
        <button type="button" data-platform="ios">iOS</button>
        <button type="button" data-platform="android">Android</button>
      </div>
      <label class="switch"><input type="checkbox" data-part="recommendations"> Recommendations</label>
      <p class="status" data-part="status" role="status">Loading…</p>
    </div>
    <label class="switch"><input type="checkbox" data-part="screenshot-naming"> Screenshot Naming</label>
  </section>`;

export class Widget {
  constructor({ onPlatformChange, onClose, onRecommendationsChange, onScreenshotNamingChange, onNativeMobileDetailsChange }) { this.onPlatformChange = onPlatformChange; this.onClose = onClose; this.onRecommendationsChange = onRecommendationsChange; this.onScreenshotNamingChange = onScreenshotNamingChange; this.onNativeMobileDetailsChange = onNativeMobileDetailsChange; }
  async mount(settings) {
    this.platform = settings.platform || 'ios';
    this.element = document.createElement('aside'); this.element.id = 'auditor-autofill-widget'; this.element.innerHTML = template; document.body.append(this.element);
    // Native Mobile Details master toggle. Defaults on. Shows/hides the native
    // controls group and reports its state so native autofill can be disabled.
    const nativeGroup = this.element.querySelector('[data-part="native-group"]');
    const nativeMobileToggle = this.element.querySelector('[data-part="native-mobile-details"]');
    const applyNativeVisibility = (enabled) => { if (nativeGroup) nativeGroup.hidden = !enabled; };
    if (nativeMobileToggle) {
      nativeMobileToggle.checked = settings.nativeMobileDetails !== false;
      applyNativeVisibility(nativeMobileToggle.checked);
      nativeMobileToggle.addEventListener('change', (event) => {
        const enabled = event.currentTarget.checked;
        applyNativeVisibility(enabled);
        settingsStore.saveUi({ nativeMobileDetails: enabled });
        this.onNativeMobileDetailsChange?.(enabled);
      });
    }
    const recommendationsToggle = this.element.querySelector('[data-part="recommendations"]');
    if (recommendationsToggle) {
      // Default the toggle on so recommendations fill unless the user opts out.
      recommendationsToggle.checked = settings.recommendations !== false;
      recommendationsToggle.addEventListener('change', (event) => {
        const enabled = event.currentTarget.checked;
        settingsStore.saveUi({ recommendations: enabled });
        this.onRecommendationsChange?.(enabled);
      });
    }
    const screenshotNamingToggle = this.element.querySelector('[data-part="screenshot-naming"]');
    if (screenshotNamingToggle) {
      // Default the toggle on so screenshots are auto-named unless the user opts out.
      screenshotNamingToggle.checked = settings.screenshotNaming !== false;
      screenshotNamingToggle.addEventListener('change', (event) => {
        const enabled = event.currentTarget.checked;
        settingsStore.saveUi({ screenshotNaming: enabled });
        this.onScreenshotNamingChange?.(enabled);
      });
    }
    this.element.classList.toggle('collapsed', settings.collapsed);
    Object.assign(this.element.style, settings.widgetPosition || { top: '16px', right: '16px' });
    this.element.querySelectorAll('[data-platform]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const platform = event.currentTarget.dataset.platform;
        this.setPlatform(platform);
        this.onPlatformChange(platform);
      });
    });
    this.element.querySelector('[data-action="close"]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onClose();
    });
    this.setPlatform(this.platform);
    this.makeDraggable();
  }
  setPlatform(platform) {
    this.platform = platform;
    this.element.querySelectorAll('[data-platform]').forEach((button) => {
      const selected = button.dataset.platform === platform;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    settingsStore.saveUi({ platform });
    this.setStatus(platform === 'ios' ? 'iOS selected' : 'Android selected');
  }
  setStatus(message, level = '') { const el = this.element?.querySelector('[data-part="status"]'); if (el) { el.textContent = message; el.dataset.level = level; } }
  setWorkflow(current) { const steps = ['checkpoint', 'description', 'details']; steps.forEach((step, index) => { const element = this.element?.querySelector(`[data-step="${step}"]`); if (!element) return; element.dataset.state = index < steps.indexOf(current) ? 'done' : step === current ? 'active' : ''; }); }
  setFile(name, report) {
    const el = this.element?.querySelector('[data-part="file"]');
    if (!el) return;
    const displayName = name || 'Default checkpoint mapping';
    if (report?.ios || report?.android) {
      el.textContent = `${displayName} · iOS ${report.ios?.rows ?? 0} rows · Android ${report.android?.rows ?? 0} rows`;
      return;
    }
    el.textContent = `${displayName} · ${report?.rows ?? 0} rows`;
  }
  makeDraggable() { const header = this.element.querySelector('header'); let start;
    header.addEventListener('pointerdown', (event) => { if (event.target.tagName === 'BUTTON') return; start = { x: event.clientX, y: event.clientY, left: this.element.offsetLeft, top: this.element.offsetTop }; header.setPointerCapture(event.pointerId); });
    header.addEventListener('pointermove', (event) => { if (!start) return; this.element.style.left = `${Math.max(0, start.left + event.clientX - start.x)}px`; this.element.style.top = `${Math.max(0, start.top + event.clientY - start.y)}px`; this.element.style.right = 'auto'; });
    header.addEventListener('pointerup', () => { if (start) settingsStore.saveUi({ widgetPosition: { left: this.element.style.left, top: this.element.style.top } }); start = null; });
  }
}
