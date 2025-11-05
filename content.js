const isYouTube = window.location.hostname.includes('youtube.com');
let lookupInProgress = false;
let overlay = null;
let lastCaptionText = '';
let overlayEnabled = true;

const CACHE_TTL = 1000 * 60 * 60 * 24; 
const ERROR_TTL = 1000 * 60 * 5; 
const MAX_CACHE_ITEMS = 500;

chrome.storage.sync.get(['enabled'], (result) => {
  overlayEnabled = result.enabled !== false;
  console.log('Overlay enabled:', overlayEnabled);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'TOGGLE_OVERLAY') {
    overlayEnabled = msg.enabled;
    console.log('Overlay toggled:', overlayEnabled);
    if (!overlayEnabled) {
      if (overlay) overlay.style.display = 'none';
      hidePopup();
    }
  }
});

const popup = document.getElementById('verbatim-popup') || document.createElement('div');
popup.id = 'verbatim-popup';
Object.assign(popup.style, {
  position: 'fixed',
  background: 'rgba(0, 0, 0, 0.92)',
  color: '#ffffff',
  padding: '10px 14px',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  lineHeight: '1.5',
  zIndex: '2147483647',
  display: 'none',
  maxWidth: '340px',
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.4)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  wordWrap: 'break-word'
});
if (!document.getElementById('verbatim-popup')) {
  document.body.appendChild(popup);
}

let popupTimer = null;

const cacheKey = (w) => `verbatim_dict_${w}`;
const cacheIndexKey = 'verbatim_cache_index';

function readCache(word) {
  try {
    const raw = localStorage.getItem(cacheKey(word));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.ts > (obj.ttl || CACHE_TTL)) {
      localStorage.removeItem(cacheKey(word));
      return null;
    }
    return obj.meaning;
  } catch (e) {
    console.warn('Cache read failed:', e);
    return null;
  }
}

function writeCache(word, meaning, ttl = CACHE_TTL) {
  try {
    maintainCacheIndex(word);
    localStorage.setItem(
      cacheKey(word),
      JSON.stringify({ meaning, ts: Date.now(), ttl })
    );
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

function maintainCacheIndex(word) {
  try {
    const rawIdx = localStorage.getItem(cacheIndexKey);
    let idx = rawIdx ? JSON.parse(rawIdx) : [];
    idx = idx.filter((k) => k !== word);
    idx.unshift(word);
    if (idx.length > MAX_CACHE_ITEMS) {
      const toDrop = idx.splice(MAX_CACHE_ITEMS);
      toDrop.forEach((k) => localStorage.removeItem(cacheKey(k)));
    }
    localStorage.setItem(cacheIndexKey, JSON.stringify(idx));
  } catch (e) {}
}

function showPopup(x, y, text, duration = 6000) {
  popup.textContent = text;
  let left = x + 12;
  if (left + 340 > window.innerWidth) left = x - 352;
  let top = y + 12;
  if (top + 100 > window.innerHeight) top = y - 112;
  left = Math.max(8, left);
  top = Math.max(8, top);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  popup.style.display = 'block';
  if (popupTimer) clearTimeout(popupTimer);
  popupTimer = setTimeout(() => hidePopup(), duration);
}

function hidePopup() {
  popup.style.display = 'none';
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = null;
  }
}

document.addEventListener('click', function(event) {
  if (event.target !== popup && !event.target.closest('#verbatim-overlay')) {
    hidePopup();
  }
});

function normalizeWord(raw) {
  if (!raw) return '';
  let w = raw.trim().replace(/\s+/g, ' ');
  if (w.includes(' ')) w = w.split(' ')[0];
  try {
    w = w.replace(/^[^\p{L}\p{N}''\-]+|[^\p{L}\p{N}''\-]+$/gu, '');
  } catch {
    w = w.replace(/^[^A-Za-z0-9''-]+|[^A-Za-z0-9''-]+$/g, '');
  }
  w = w.replace(/[\u2018\u2019\u201B\u2032]/g, "'");
  return w.length === 0 || w.length > 64 ? '' : w.toLowerCase();
}

async function fetchWithTimeout(url, timeout = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Request timeout');
    throw error;
  }
}

async function fetchDefinition(word) {
  const cleanedWord = normalizeWord(word);
  if (!cleanedWord || cleanedWord.length < 2) {
    return 'No valid word selected';
  }
  
  const cached = readCache(cleanedWord);
  if (cached) {
    console.log('Cache hit:', cleanedWord);
    return cached;
  }
  
  console.log('Cache miss, fetching:', cleanedWord);
  
  try {
    const response = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanedWord}`, 7000);
    if (!response.ok) {
      const errorMsg = response.status === 404 ? 'No definition found' : 'Network error';
      writeCache(cleanedWord, errorMsg, ERROR_TTL);
      return errorMsg;
    }
    const data = await response.json();
    const definition = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || 'No definition found';
    writeCache(cleanedWord, definition, CACHE_TTL);
    return definition;
  } catch (error) {
    console.error('Definition fetch failed:', error);
    const errorMsg = 'Error fetching definition';
    writeCache(cleanedWord, errorMsg, ERROR_TTL);
    return errorMsg;
  }
}

document.addEventListener('dblclick', async function(event) {
  if (!overlayEnabled) return;
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && !lookupInProgress) {
    lookupInProgress = true;
    const word = normalizeWord(selectedText);
    showPopup(event.clientX, event.clientY, 'Loading...', 15000);
    try {
      const definition = await fetchDefinition(selectedText);
      showPopup(event.clientX, event.clientY, `${word}: ${definition}`, 6000);
    } finally {
      lookupInProgress = false;
    }
  }
});

if (isYouTube && overlayEnabled) {
  function createOverlay() {
    if (overlay) return overlay;
    
    overlay = document.createElement('div');
    overlay.id = 'verbatim-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      zIndex: '2147483646',
      pointerEvents: 'auto',
      cursor: 'pointer',
      display: 'none',
      color: 'transparent',
      background: 'transparent',
      whiteSpace: 'pre-wrap',
      textAlign: 'center',
      fontFamily: 'inherit'
    });
    
    overlay.addEventListener('click', async (event) => {
      if (!overlayEnabled) return;
      const wordSpan = event.target.closest('span[data-word]');
      if (wordSpan && !lookupInProgress) {
        const rawWord = wordSpan.dataset.word;
        const word = normalizeWord(rawWord);
        if (word) {
          lookupInProgress = true;
          showPopup(event.clientX, event.clientY, 'Loading...', 15000);
          try {
            const definition = await fetchDefinition(rawWord);
            showPopup(event.clientX, event.clientY, `${word}: ${definition}`, 6000);
          } finally {
            lookupInProgress = false;
          }
        }
      }
    });
    
    document.body.appendChild(overlay);
    return overlay;
  }
  
  function updateOverlay() {
    if (!overlayEnabled) {
      if (overlay) overlay.style.display = 'none';
      return;
    }
    
    const caption = document.querySelector('.ytp-caption-segment');
    
    if (!caption || !caption.textContent.trim()) {
      if (overlay) overlay.style.display = 'none';
      lastCaptionText = '';
      return;
    }
    
    const captionText = caption.textContent;
    if (captionText === lastCaptionText) return;
    lastCaptionText = captionText;
    
    if (!overlay) createOverlay();
    
    const rect = caption.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(caption);
    
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.fontSize = computedStyle.fontSize;
    overlay.style.fontFamily = computedStyle.fontFamily;
    
    const words = captionText.split(/\s+/).filter(w => w.trim());
    overlay.innerHTML = words.map(word => 
      `<span data-word="${word}" style="color: transparent; margin-right: 4px;">${word}</span>`
    ).join(' ');
  }
  
  setInterval(updateOverlay, 500);
  console.log('YouTube overlay with localStorage caching active');
}
