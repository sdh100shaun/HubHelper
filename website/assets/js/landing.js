// Landing page behaviour (replaces the former React components).
// - Policy example tabs (was PolicyShowcase)
// - AI demo scenario switcher (was AIDemo)
// - Mobile navbar toggle
(() => {
  // Policy example tabs: WAI-ARIA tabs pattern with arrow-key support.
  // A single tabpanel holds one <pre> per tab; only the active one is shown.
  for (const root of document.querySelectorAll('[data-hh-tabs]')) {
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    const panel = root.querySelector('[role="tabpanel"]');
    const contents = Array.from(root.querySelectorAll('[data-tab-content]'));
    const select = (tab, focus) => {
      for (const t of tabs) {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      }
      for (const c of contents) c.hidden = c.dataset.tabContent !== tab.dataset.tab;
      if (panel) panel.setAttribute('aria-labelledby', tab.id);
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        select(tabs[(i + step + tabs.length) % tabs.length], true);
      });
    });
  }

  // AI demo scenarios: toggle buttons that swap the terminal output.
  for (const root of document.querySelectorAll('[data-hh-scenarios]')) {
    const buttons = Array.from(root.querySelectorAll('[data-scenario]'));
    const panels = Array.from(root.querySelectorAll('[data-scenario-panel]'));
    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.scenario;
        for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
        for (const p of panels) p.hidden = p.dataset.scenarioPanel !== id;
      });
    }
  }

  // Mobile navigation toggle.
  const toggle = document.querySelector('.hh-navbar__toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      document.querySelector('.hh-navbar').classList.toggle('hh-navbar--open', open);
    });
  }

  for (const el of document.querySelectorAll('[data-hh-year]')) {
    el.textContent = String(new Date().getFullYear());
  }
})();
