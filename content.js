let lookupInProgress = false;
const popup = document.getElementById('verbatim-popup') || document.createElement('div');
popup.id = 'verbatim-popup';
Object.assign(popup.style, {
  position: 'fixed',
  background: 'rgba(0, 0, 0, 0.9)',
  color: 'white',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '14px',
  fontFamily: 'Arial, sans-serif',
  zIndex: '2147483647',
  display: 'none',
  maxWidth: '300px',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
  lineHeight: '1.3'
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
    console.log('Cache full, removed:', firstKey);
  }
  definitionCache.set(key, value);
  console.log('Cache size:', definitionCache.size);
}
function showPopup(x, y, text, duration = 6000) {
  popup.textContent = text;
  let left = x + 10;
  if (left + 300 > window.innerWidth) {
    left = x - 310;
  }
  let top = y + 10;
  if (top + 100 > window.innerHeight) {
    top = y - 110;
  }
  left = Math.max(5, left);
  top = Math.max(5, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.display = 'block';
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => {
    hidePopup();
  }, duration);
  console.log(`Popup shown, auto-hide in ${duration}ms`);
}
function hidePopup() {
  popup.style.display = 'none';
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
    return 'Invalid word selection';
  }
  if (definitionCache.has(cleanedWord)) {
    console.log('Cache hit for:', cleanedWord);
    return definitionCache.get(cleanedWord);
  }
  console.log('Cache miss for:', cleanedWord);
  try {
    const response = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanedWord}`, 5000);
    if (!response.ok) {
      const errorMsg = response.status === 404 ? `"${cleanedWord}" not found` : 'Network error occurred';
      setCacheEntry(cleanedWord, errorMsg);
      return errorMsg;
    }
    const data = await response.json();
    const definition = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || 'No definition available';
    setCacheEntry(cleanedWord, definition);
    console.log('Cached definition for:', cleanedWord);
    return definition;
  } catch (error) {
    console.error('API Error:', error);
    const errorMsg = error.message === 'Request timeout' ? 'Request timed out' : 'Network error occurred';
    setCacheEntry(cleanedWord, errorMsg);
    return errorMsg;
  }
}
document.addEventListener('dblclick', async function(event) {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && !lookupInProgress) {
    lookupInProgress = true;
    showPopup(event.clientX, event.clientY, 'Loading...', 12000);
    const definition = await lookupWord(selectedText);
    showPopup(event.clientX, event.clientY, `${cleanWord(selectedText)}: ${definition}`, 6000);
    lookupInProgress = false;
  }
});
