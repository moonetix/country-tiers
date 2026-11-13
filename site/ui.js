const live = document.getElementById('copy-live');
const timers = new WeakMap();
let liveTimer;

async function toClipboard(text, node) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
        node.select();
      } else {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

function flash(button, ok) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  const what = (button.getAttribute('aria-label') || 'Copy the text').replace(/^Copy /, '');
  button.textContent = ok ? 'Copied' : 'Press Ctrl+C';
  button.classList.toggle('done', ok);
  clearTimeout(timers.get(button));
  timers.set(button, setTimeout(() => {
    button.textContent = button.dataset.label;
    button.classList.remove('done');
  }, 2000));
  if (!live) return;
  live.textContent = ok ? `Copied ${what}.` : `Could not copy ${what}. It is selected, press Ctrl+C.`;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    live.textContent = '';
  }, 4000);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-copy]');
  if (!button || button.disabled) return;
  const source = button.dataset.copy
    ? document.querySelector(button.dataset.copy)
    : button.closest('.code')?.querySelector('code');
  if (!source) return;
  const text = source instanceof HTMLTextAreaElement || source instanceof HTMLInputElement ? source.value : source.textContent;
  flash(button, await toClipboard(text, source));
});

for (const list of document.querySelectorAll('[role=tablist]')) {
  const tabs = [...list.querySelectorAll('[role=tab]')];
  const show = (tab, focus) => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  };
  list.addEventListener('click', (event) => {
    const tab = event.target.closest('[role=tab]');
    if (tab) show(tab, false);
  });
  list.addEventListener('keydown', (event) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = {
      ArrowRight: tabs[(i + 1) % tabs.length],
      ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
      Home: tabs[0],
      End: tabs[tabs.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    show(next, true);
  });
}
