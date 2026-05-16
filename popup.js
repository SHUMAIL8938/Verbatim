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

