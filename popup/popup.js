// AWS Cloak popup.
const DEFAULTS = { enabled: true, strict: false, maskTitles: true, blurPx: 6 };
const $ = (id) => document.getElementById(id);

let tab = null;

async function load() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  $('enabled').checked = stored.enabled;
  $('strict').checked = stored.strict;
  $('maskTitles').checked = stored.maskTitles;
  $('blurPx').value = stored.blurPx;
  renderState();

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await refreshPageInfo();
  await showShortcuts();
}

function renderState() {
  const on = $('enabled').checked;
  $('status').textContent = on ? 'On for AWS console pages' : 'Off, nothing is blurred';
  $('controls').classList.toggle('off', !on);
  $('pick').disabled = !on;
  $('blurValue').textContent = $('blurPx').value + ' px';
}

async function refreshPageInfo() {
  let info = null;
  if (tab && tab.id !== undefined) {
    info = await chrome.tabs.sendMessage(tab.id, { type: 'getPageInfo' }).catch(() => null);
  }
  const onAws = !!info;
  $('pick').disabled = !onAws || !$('enabled').checked;
  $('clearPage').disabled = !onAws || !info.pagePicks;
  const { picks } = await chrome.storage.local.get({ picks: { global: [], pages: {} } });
  const total = (picks.global || []).length + Object.values(picks.pages || {}).reduce((n, l) => n + l.length, 0);
  $('clearAll').disabled = total === 0;
  if (!onAws) {
    $('pickInfo').textContent = 'Open an AWS console or access portal tab to pick items. If the tab was open before you installed AWS Cloak, reload it.';
  } else {
    const parts = [];
    parts.push(info.pagePicks === 1 ? '1 item hidden on this page' : info.pagePicks + ' items hidden on this page');
    if (info.globalPicks) parts.push(info.globalPicks + ' on every page');
    $('pickInfo').textContent = parts.join(', ') + '.';
  }
}

async function showShortcuts() {
  const commands = await chrome.commands.getAll();
  const key = (name) => (commands.find((c) => c.name === name) || {}).shortcut;
  const toggle = key('toggle-cloak');
  const picker = key('start-picker');
  const lines = [];
  lines.push(toggle ? 'Press ' + toggle + ' to turn blurring on or off.' : 'Set a shortcut to turn blurring on or off.');
  lines.push(picker ? 'Press ' + picker + ' to start the picker.' : 'Set a shortcut to start the picker.');
  $('shortcuts').textContent = lines.join(' ');
}

for (const id of ['enabled', 'strict', 'maskTitles']) {
  $(id).addEventListener('change', async () => {
    await chrome.storage.local.set({ [id]: $(id).checked });
    renderState();
    refreshPageInfo();
  });
}

$('blurPx').addEventListener('input', () => {
  renderState();
  chrome.storage.local.set({ blurPx: Number($('blurPx').value) });
});

$('pick').addEventListener('click', async () => {
  if (!tab) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'startPicker' }).catch(() => {});
  window.close();
});

$('clearPage').addEventListener('click', async () => {
  if (!tab) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'clearPicksHere' }).catch(() => {});
  setTimeout(refreshPageInfo, 150);
});

$('clearAll').addEventListener('click', async () => {
  await chrome.storage.local.set({ picks: { global: [], pages: {} } });
  refreshPageInfo();
});

$('editShortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

load();
