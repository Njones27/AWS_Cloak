// AWS Cloak service worker. Handles keyboard shortcuts, relays picker messages and keeps the badge current.

const DEFAULTS = { enabled: true, strict: false, maskTitles: true, blurPx: 6, picks: { global: [], pages: {} } };

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  const missing = {};
  for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in stored)) missing[k] = v;
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) updateBadge();
});

async function updateBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#d13212' });
  await chrome.action.setTitle({ title: enabled ? 'AWS Cloak is blurring' : 'AWS Cloak is off' });
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-cloak') {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    await chrome.storage.local.set({ enabled: !enabled });
  } else if (command === 'start-picker') {
    const target = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (target && target.id !== undefined) {
      chrome.tabs.sendMessage(target.id, { type: 'startPicker' }).catch(() => {});
    }
  }
});

// A frame that finishes picking tells every other frame in the tab to stop too.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'stopPicker' && sender.tab && sender.tab.id !== undefined) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'stopPicker' }).catch(() => {});
  }
});
