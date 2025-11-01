let lookupInProgress = false;
const popup = document.getElementById('verbatim-popup') || document.createElement('div');
popup.id = 'verbatim-popup';
Object.assign(popup.style, {
  position: 'fixed',
  background: 'rgba(0, 0, 0, 0.92)',
  color: '#ffffff',
  padding: '10px 14px',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  lineHeight: '1.4',
  zIndex: '2147483647',
  display: 'none',
  maxWidth: '320px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  transition: 'opacity 0.2s ease',
  wordWrap: 'break-word'
});
if (!document.getElementById('verbatim-popup')) {
  document.body.appendChild(popup);
}
let popupTimer = null;
const definitionCache = new Map();
const MAX_CACHE_SIZE = 100;
function setCacheEntry(key, value) {
  if (definitionCache.size >= MAX_CACHE_SIZE) {
    const firstKey = definitionCache.keys().next().value;
    definitionCache.delete(firstKey);
  }
  definitionCache.set(key, value);
}
function showPopup(x, y, text, duration = 6000) {
  popup.textContent = text;
  let left = x + 12;
  if (left + 320 > window.innerWidth) {
    left = x - 332;
  }
  let top = y + 12;
  if (top + 100 > window.innerHeight) {
    top = y - 112;
  }
  left = Math.max(8, left);
  top = Math.max(8, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.display = 'block';
  popup.style.opacity = '1';
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => hidePopup(), duration);
}
function hidePopup() {
  popup.style.opacity = '0';
  setTimeout(() => {
    popup.style.display = 'none';
  }, 200);
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
}
document.addEventListener('click', function(event) {
  if (event.target !== popup) {
    hidePopup();
  }
});
function cleanWord(text) {
  if (!text) return '';
  let word = text.trim();
  if (word.includes(' ')) {
    word = word.split(' ')[0];
  }
  word = word.toLowerCase();
  word = word.replace(/^[^a-z''-]+|[^a-z''-]+$/gi, '');
  word = word.replace(/[\u2018\u2019\u201B\u2032]/g, "'");
  return word.length > 0 && word.length < 50 ? word : '';
}
async function fetchWithTimeout(url, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}
async function lookupWord(word) {
  const cleanedWord = cleanWord(word);
  if (!cleanedWord || cleanedWord.length < 2) {
    return 'Please select a valid word';
  }
  if (definitionCache.has(cleanedWord)) {
    return definitionCache.get(cleanedWord);
  }
  try {
    const response = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanedWord}`, 5000);
    if (!response.ok) {
      const errorMsg = response.status === 404 ? `"${cleanedWord}" not found` : 'Network error';
      setCacheEntry(cleanedWord, errorMsg);
      return errorMsg;
    }
    const data = await response.json();
    const definition = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || 'No definition available';
    setCacheEntry(cleanedWord, definition);
    return definition;
  } catch (error) {
    const errorMsg = error.message === 'Request timeout' ? 'Request timed out' : 'Network error';
    setCacheEntry(cleanedWord, errorMsg);
    return errorMsg;
  }
}
document.addEventListener('dblclick', async function(event) {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && !lookupInProgress) {
    lookupInProgress = true;
    const word = cleanWord(selectedText);
    showPopup(event.clientX, event.clientY, 'Loading...', 12000);
    const definition = await lookupWord(selectedText);
    showPopup(event.clientX, event.clientY, `${word}: ${definition}`, 6000);
    lookupInProgress = false;
  }
});
