// AWS Cloak content script. Finds sensitive values on AWS console pages and blurs them,
// and runs the hover-to-hide picker.
(() => {
  'use strict';
  if (window.__awsCloakLoaded) return;
  window.__awsCloakLoaded = true;

  const P = globalThis.AWSCloakPatterns;
  const html = document.documentElement;
  const isTop = window === window.top;

  const ATTR = 'data-awscloak';
  const PICK_ATTR = 'data-awscloak-pick';
  const OFF_ATTR = 'data-awscloak-off';
  const PICKING_ATTR = 'data-awscloak-picking';
  // Elements whose text is at most this long are blurred as a whole. Longer text only has
  // the sensitive words blurred, so a paragraph that mentions an ARN stays readable.
  const SHORT_TEXT = 160;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'META', 'LINK', 'svg']);

  const DEFAULTS = { enabled: true, strict: false, maskTitles: true, blurPx: 6 };
  const settings = { ...DEFAULTS };
  let picks = { global: [], pages: {} };

  const highlight = typeof Highlight !== 'undefined' && globalThis.CSS && CSS.highlights ? new Highlight() : null;
  let rangesByNode = new WeakMap();

  // ---------------------------------------------------------------- helpers

  function isOurs(el) {
    return !!(el && el.closest && el.closest('.awscloak-ui'));
  }

  function directText(el) {
    let text = '';
    for (const child of el.childNodes) if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue;
    return text;
  }

  function pageKey() {
    let loc = location;
    if (loc.protocol === 'about:') {
      try {
        loc = window.parent.location;
      } catch (e) {
        /* cross origin parent, fall back to this frame */
      }
    }
    let host = loc.hostname
      .replace(/^[a-z]{2}(?:-gov|-iso[a-z]?)?-[a-z]+-\d+\./, '')
      .replace(/^.*\.(awsapps\.com|app\.aws)$/, '$1');
    const first = (loc.pathname.split('/').filter(Boolean)[0]) || '';
    return host + '/' + first;
  }

  // ---------------------------------------------------------------- automatic blurring

  function clearRanges(textNode) {
    const old = rangesByNode.get(textNode);
    if (!old) return;
    if (highlight) for (const r of old) highlight.delete(r);
    rangesByNode.delete(textNode);
  }

  function updateRanges(textNode) {
    clearRanges(textNode);
    if (!highlight) return;
    const matches = P.findMatches(textNode.nodeValue, settings.strict);
    if (!matches.length) return;
    const list = [];
    for (const { start, end } of matches) {
      const r = new Range();
      r.setStart(textNode, start);
      r.setEnd(textNode, end);
      highlight.add(r);
      list.push(r);
    }
    rangesByNode.set(textNode, list);
  }

  function evaluateElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE || !el.isConnected) return;
    if (SKIP_TAGS.has(el.tagName) || isOurs(el)) return;
    const own = directText(el);
    const total = el.textContent.length;
    if (total <= SHORT_TEXT) {
      for (const child of el.childNodes) if (child.nodeType === Node.TEXT_NODE) clearRanges(child);
      const hit = own.length >= 5 && P.hasMatch(own, settings.strict);
      if (hit) {
        if (el.getAttribute(ATTR) !== 'auto') el.setAttribute(ATTR, 'auto');
      } else if (el.getAttribute(ATTR) === 'auto') {
        el.removeAttribute(ATTR);
      }
    } else {
      if (el.getAttribute(ATTR) === 'auto') el.removeAttribute(ATTR);
      for (const child of el.childNodes) if (child.nodeType === Node.TEXT_NODE) updateRanges(child);
    }
  }

  function evaluateInput(el) {
    if (el.type === 'password' || el.type === 'hidden' || isOurs(el)) return;
    const hit = P.hasMatch(el.value || '', settings.strict);
    if (hit) {
      if (el.getAttribute(ATTR) !== 'input') el.setAttribute(ATTR, 'input');
    } else if (el.getAttribute(ATTR) === 'input') {
      el.removeAttribute(ATTR);
    }
  }

  function scanSubtree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      evaluateElement(root.parentElement);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const parents = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.length >= 5 && node.parentElement) parents.add(node.parentElement);
    }
    for (const el of parents) evaluateElement(el);
    if (root.matches && root.matches('input, textarea')) evaluateInput(root);
    if (root.querySelectorAll) for (const el of root.querySelectorAll('input, textarea')) evaluateInput(el);
  }

  function resetAll() {
    for (const el of document.querySelectorAll('[' + ATTR + ']')) el.removeAttribute(ATTR);
    if (highlight) highlight.clear();
    rangesByNode = new WeakMap();
  }

  function fullScan() {
    resetAll();
    scanSubtree(html);
  }

  const observer = new MutationObserver((mutations) => {
    const touched = new Set();
    for (const m of mutations) {
      if (m.type === 'characterData') {
        if (m.target.parentElement) touched.add(m.target.parentElement);
      } else if (m.type === 'childList') {
        touched.add(m.target);
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE) scanSubtree(n);
        }
        for (const n of m.removedNodes) if (n.nodeType === Node.TEXT_NODE) clearRanges(n);
      }
    }
    for (const el of touched) evaluateElement(el);
    if (isTop) checkTitle();
  });
  // Callbacks run before the browser paints, so new content is blurred before it is ever shown.
  observer.observe(html, { childList: true, subtree: true, characterData: true });

  // Inputs change without DOM mutations, so watch typing and check now and then for values set by the page.
  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea')) evaluateInput(e.target);
  }, true);
  setInterval(() => {
    for (const el of document.querySelectorAll('input, textarea')) evaluateInput(el);
    if (highlight) for (const r of highlight) if (!r.startContainer.isConnected) highlight.delete(r);
  }, 1000);

  // ---------------------------------------------------------------- tab title

  let originalTitle = null;
  let maskedTitle = null;

  function checkTitle() {
    const t = document.title;
    if (maskedTitle !== null && t === maskedTitle) return;
    originalTitle = t;
    maskedTitle = null;
    if (settings.enabled && settings.maskTitles) {
      const masked = P.mask(t, settings.strict);
      if (masked !== t) {
        maskedTitle = masked;
        document.title = masked;
      }
    }
  }

  function restoreTitle() {
    if (maskedTitle !== null && document.title === maskedTitle && originalTitle !== null) {
      maskedTitle = null;
      document.title = originalTitle;
    }
  }

  // ---------------------------------------------------------------- settings

  function applySettings(prev) {
    html.style.setProperty('--awscloak-blur', Math.max(1, Number(settings.blurPx) || 6) + 'px');
    if (settings.enabled) {
      html.removeAttribute(OFF_ATTR);
      if (highlight) CSS.highlights.set('awscloak', highlight);
    } else {
      html.setAttribute(OFF_ATTR, '');
      if (highlight) CSS.highlights.delete('awscloak');
    }
    if (prev && prev.strict !== settings.strict) fullScan();
    if (isTop) {
      if (settings.enabled && settings.maskTitles) {
        restoreTitle();
        checkTitle();
      } else {
        restoreTitle();
      }
    }
  }

  applySettings(null);

  chrome.storage.local.get({ ...DEFAULTS, picks }, (stored) => {
    const prev = { ...settings };
    for (const k of Object.keys(DEFAULTS)) settings[k] = stored[k];
    picks = normalizePicks(stored.picks);
    applySettings(prev);
    renderPicks();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const prev = { ...settings };
    let settingsChanged = false;
    for (const k of Object.keys(DEFAULTS)) {
      if (changes[k]) {
        settings[k] = changes[k].newValue === undefined ? DEFAULTS[k] : changes[k].newValue;
        settingsChanged = true;
      }
    }
    if (settingsChanged) applySettings(prev);
    if (changes.picks) {
      picks = normalizePicks(changes.picks.newValue);
      renderPicks();
    }
  });

  // ---------------------------------------------------------------- picks

  function normalizePicks(p) {
    return {
      global: Array.isArray(p && p.global) ? p.global : [],
      pages: p && typeof p.pages === 'object' && p.pages ? p.pages : {},
    };
  }

  function activeSelectors() {
    return [...picks.global, ...(picks.pages[pageKey()] || [])];
  }

  function validSelector(sel) {
    try {
      document.querySelector(sel);
      return true;
    } catch (e) {
      return false;
    }
  }

  let pickStyle = null;
  function renderPicks() {
    const sels = activeSelectors().filter(validSelector);
    const css = sels
      .map((s) => 'html:not([' + OFF_ATTR + ']) ' + s + ' { filter: blur(var(--awscloak-blur)) !important; }')
      .join('\n');
    if (!pickStyle || !pickStyle.isConnected) {
      pickStyle = document.createElement('style');
      pickStyle.id = 'awscloak-picks';
      html.appendChild(pickStyle);
    }
    if (pickStyle.textContent !== css) pickStyle.textContent = css;
    // Drop the immediate marker from anything that is no longer picked.
    for (const el of document.querySelectorAll('[' + PICK_ATTR + ']')) {
      if (!sels.some((s) => el.matches(s))) el.removeAttribute(PICK_ATTR);
    }
  }

  function savePicks() {
    chrome.storage.local.set({ picks });
  }

  function isStableToken(token) {
    return token.length < 48 && !/\d{3,}/.test(token) && !/^[:_]|[:]/.test(token) && !/[0-9a-f]{6,}/i.test(token);
  }

  function stableClasses(el) {
    return [...el.classList].filter((c) => /^[a-zA-Z][a-zA-Z-]{2,30}$/.test(c) && !c.startsWith('awscloak')).slice(0, 2);
  }

  function buildSelector(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== html) {
      if (node.id && isStableToken(node.id)) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      let part = node.localName;
      const testid = node.getAttribute('data-testid');
      if (testid && isStableToken(testid)) {
        part += '[data-testid="' + testid.replace(/["\\]/g, '\\$&') + '"]';
      } else {
        part += stableClasses(node).map((c) => '.' + CSS.escape(c)).join('');
      }
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === node.localName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      if (node.localName === 'body') break;
      const sel = parts.join(' > ');
      if (parts.length >= 3 && validSelector(sel) && document.querySelectorAll(sel).length === 1) break;
      node = parent;
    }
    return parts.join(' > ');
  }

  function pickedSelectorsFor(el) {
    const hits = { global: [], page: [] };
    const key = pageKey();
    for (const s of picks.global) if (validSelector(s) && el.matches(s)) hits.global.push(s);
    for (const s of picks.pages[key] || []) if (validSelector(s) && el.matches(s)) hits.page.push(s);
    return hits;
  }

  function findPicked(el) {
    for (let n = el; n && n !== html; n = n.parentElement) {
      if (n.hasAttribute(PICK_ATTR)) return n;
      const hits = pickedSelectorsFor(n);
      if (hits.global.length || hits.page.length) return n;
    }
    return null;
  }

  function pick(el, everywhere) {
    const sel = buildSelector(el);
    if (!sel) return;
    el.setAttribute(PICK_ATTR, '');
    if (everywhere) {
      if (!picks.global.includes(sel)) picks.global.push(sel);
    } else {
      const key = pageKey();
      const list = picks.pages[key] || (picks.pages[key] = []);
      if (!list.includes(sel)) list.push(sel);
    }
    renderPicks();
    savePicks();
  }

  function unpick(el) {
    el.removeAttribute(PICK_ATTR);
    const hits = pickedSelectorsFor(el);
    const key = pageKey();
    picks.global = picks.global.filter((s) => !hits.global.includes(s));
    if (picks.pages[key]) {
      picks.pages[key] = picks.pages[key].filter((s) => !hits.page.includes(s));
      if (!picks.pages[key].length) delete picks.pages[key];
    }
    renderPicks();
    savePicks();
  }

  function clearPicksHere() {
    delete picks.pages[pageKey()];
    renderPicks();
    savePicks();
  }

  // ---------------------------------------------------------------- picker

  let picker = null;

  function startPicker() {
    if (picker) return;
    const box = document.createElement('div');
    box.className = 'awscloak-ui awscloak-hover';
    html.appendChild(box);

    let banner = null;
    if (isTop) {
      banner = document.createElement('div');
      banner.className = 'awscloak-ui awscloak-banner';
      banner.innerHTML =
        '<span><b>AWS Cloak picker.</b> Click an item to blur it on this page. <kbd>Shift</kbd> click blurs it on every page. ' +
        'Click a blurred item to show it again. <kbd>\u2191</kbd> picks the larger area. <kbd>Esc</kbd> finishes.</span>';
      const done = document.createElement('button');
      done.type = 'button';
      done.textContent = 'Done';
      done.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopEverywhere();
      });
      banner.appendChild(done);
      html.appendChild(banner);
    }

    html.setAttribute(PICKING_ATTR, '');
    picker = { box, banner, current: null, stack: [] };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    for (const t of BLOCKED) window.addEventListener(t, block, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', redraw, true);
  }

  const BLOCKED = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'auxclick', 'contextmenu', 'submit'];

  function stopPicker() {
    if (!picker) return;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    for (const t of BLOCKED) window.removeEventListener(t, block, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', redraw, true);
    picker.box.remove();
    if (picker.banner) picker.banner.remove();
    html.removeAttribute(PICKING_ATTR);
    picker = null;
  }

  function stopEverywhere() {
    stopPicker();
    try {
      chrome.runtime.sendMessage({ type: 'stopPicker' });
    } catch (e) {
      /* extension reloaded */
    }
  }

  function block(e) {
    if (isOurs(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function setCurrent(el, keepStack) {
    if (!picker) return;
    if (!keepStack) picker.stack = [];
    picker.current = el;
    redraw();
  }

  function redraw() {
    if (!picker) return;
    const el = picker.current;
    const box = picker.box;
    if (!el || !el.isConnected) {
      box.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.top = r.top - 2 + 'px';
    box.style.left = r.left - 2 + 'px';
    box.style.width = r.width + 4 + 'px';
    box.style.height = r.height + 4 + 'px';
    if (findPicked(el)) box.setAttribute('data-picked', '');
    else box.removeAttribute('data-picked');
  }

  function onMove(e) {
    const el = e.target;
    if (!el || el.nodeType !== Node.ELEMENT_NODE || isOurs(el) || el === html || el === document.body) {
      setCurrent(null);
      return;
    }
    if (picker.current === el || picker.stack.includes(el)) return;
    setCurrent(el);
  }

  function onClick(e) {
    if (isOurs(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const el = picker.current || e.target;
    if (!el || el === html || el === document.body) return;
    const picked = findPicked(el);
    if (picked) unpick(picked);
    else pick(el, e.shiftKey);
    redraw();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      stopEverywhere();
    } else if (e.key === 'ArrowUp' && picker.current) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const parent = picker.current.parentElement;
      if (parent && parent !== html && parent !== document.body) {
        picker.stack.push(picker.current);
        setCurrent(parent, true);
      }
    } else if (e.key === 'ArrowDown' && picker.stack.length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setCurrent(picker.stack.pop(), true);
    }
  }

  // ---------------------------------------------------------------- messages

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'startPicker':
        if (settings.enabled) startPicker();
        break;
      case 'stopPicker':
        stopPicker();
        break;
      case 'clearPicksHere':
        if (isTop) clearPicksHere();
        break;
      case 'getPageInfo':
        if (isTop) {
          sendResponse({ pageKey: pageKey(), pagePicks: (picks.pages[pageKey()] || []).length, globalPicks: picks.global.length });
        }
        break;
    }
  });

  // Kick off a first pass for anything already on the page.
  scanSubtree(html);
  if (isTop) checkTitle();
})();
