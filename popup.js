const SAVED_WORDS_KEY = 'verbatim_saved_words';
const HISTORY_KEY     = 'verbatim_lookup_history';


function getSavedWords() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_WORDS_KEY)) || [];
  } catch { return []; }
}

function setSavedWords(words) {
  localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify(words));
}

function sendToTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  });
}


const mainToggle = document.getElementById('mainToggle');

async function initMainToggle() {
  const { enabled = true } = await chrome.storage.sync.get(['enabled']);
  setMainToggle(enabled);
}

function setMainToggle(on) {
  mainToggle.classList.toggle('on', on);
  document.body.classList.toggle('disabled', !on);
}

mainToggle.addEventListener('click', async () => {
  const isOn = !mainToggle.classList.contains('on');
  await chrome.storage.sync.set({ enabled: isOn });
  setMainToggle(isOn);
  sendToTab({ action: 'TOGGLE_OVERLAY', enabled: isOn });
});

const langSelect = document.getElementById('langSelect');

async function initLang() {
  const { translateTo = '' } = await chrome.storage.sync.get(['translateTo']);
  langSelect.value = translateTo;
}

langSelect.addEventListener('change', async () => {
  await chrome.storage.sync.set({ translateTo: langSelect.value });
  sendToTab({ action: 'UPDATE_SETTINGS', translateTo: langSelect.value });
});

const pillDark  = document.getElementById('pillDark');
const pillLight = document.getElementById('pillLight');

async function initTheme() {
  const { tooltipTheme = 'dark' } = await chrome.storage.sync.get(['tooltipTheme']);
  applyThemePills(tooltipTheme);
}

function applyThemePills(theme) {
  pillDark.className  = 'pill' + (theme === 'dark'  ? ' active-dark'  : '');
  pillLight.className = 'pill' + (theme === 'light' ? ' active-light' : '');
}

[pillDark, pillLight].forEach(pill => {
  pill.addEventListener('click', async () => {
    const theme = pill.dataset.theme;
    await chrome.storage.sync.set({ tooltipTheme: theme });
    applyThemePills(theme);
    sendToTab({ action: 'UPDATE_SETTINGS', tooltipTheme: theme });
  });
});

const examplesToggle = document.getElementById('examplesToggle');

async function initExamples() {
  const { showExamples = true } = await chrome.storage.sync.get(['showExamples']);
  setExamplesToggle(showExamples);
}

function setExamplesToggle(on) {
  examplesToggle.classList.toggle('on', on);
}

examplesToggle.addEventListener('click', async () => {
  const isOn = !examplesToggle.classList.contains('on');
  await chrome.storage.sync.set({ showExamples: isOn });
  setExamplesToggle(isOn);
  sendToTab({ action: 'UPDATE_SETTINGS', showExamples: isOn });
});


const savedList = document.getElementById('savedList');

function renderSavedWords() {
  const words = getSavedWords();
  savedList.innerHTML = '';

  if (words.length === 0) {
    savedList.innerHTML = `
      <div class="empty-state">
        No saved words yet.<br>Click ★ in any tooltip to save a word.
      </div>`;
    return;
  }

  words.forEach(({ word, pos }, idx) => {
    const row = document.createElement('div');
    row.className = 'saved-word';
    row.innerHTML = `
      <div>
        <div class="word-text">${word}</div>
        ${pos ? `<div class="word-pos">${pos}</div>` : ''}
      </div>
      <button class="remove-btn" data-idx="${idx}" title="Remove">×</button>`;
    savedList.appendChild(row);
  });

  savedList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const words = getSavedWords();
      words.splice(Number(btn.dataset.idx), 1);
      setSavedWords(words);
      renderSavedWords();
    });
  });
}

