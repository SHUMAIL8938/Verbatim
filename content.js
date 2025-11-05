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
      hideTooltip();
    }
  }
});

const tooltip = document.createElement("div");
tooltip.id = "verbatim-tooltip";
Object.assign(tooltip.style, {
  position: "fixed",
  zIndex: 2147483640,
  maxWidth: "420px",
  background: "rgba(10,10,10,0.96)",
  color: "#fff",
  padding: "10px 14px",
  borderRadius: "10px",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
  fontSize: "13px",
  lineHeight: "1.4",
  display: "none",
  pointerEvents: "auto",
  whiteSpace: "pre-wrap",
});

const tooltipBody = document.createElement("div");
tooltipBody.style.paddingRight = "26px";

const tooltipClose = document.createElement("button");
Object.assign(tooltipClose.style, {
  position: "absolute",
  right: "6px",
  top: "6px",
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: "16px",
  cursor: "pointer",
  lineHeight: "1",
  padding: "4px",
});
tooltipClose.textContent = "×";
tooltipClose.addEventListener("click", () => hideTooltip(), { passive: true });

tooltip.appendChild(tooltipBody);
tooltip.appendChild(tooltipClose);
document.body.appendChild(tooltip);

let tooltipTimer = null;

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
    return { meaning: obj.meaning, example: obj.example || null };
  } catch (e) {
    console.warn('Cache read failed:', e);
    return null;
  }
}

function writeCache(word, data, ttl = CACHE_TTL) {
  try {
    maintainCacheIndex(word);
    localStorage.setItem(
      cacheKey(word),
      JSON.stringify({ 
        meaning: data.meaning, 
        example: data.example,
        ts: Date.now(), 
        ttl 
      })
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

function showTooltipAt(clientX, clientY, titleText, bodyText, exampleText = null) {
  tooltipBody.innerHTML = "";
  
  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.textContent = titleText;
  tooltipBody.appendChild(title);

  const body = document.createElement("div");
  body.textContent = bodyText;
  tooltipBody.appendChild(body);

  if (exampleText) {
    const ex = document.createElement("div");
    ex.style.marginTop = "8px";
    ex.style.fontStyle = "italic";
    ex.style.color = "#a0a0a0";
    ex.textContent = `📘 Example: ${exampleText}`;
    tooltipBody.appendChild(ex);
  }

  tooltip.style.display = "block";
  
  requestAnimationFrame(() => {
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const pad = 8;
    let left = clientX + 10;
    let top = clientY + 10;
    
    if (left + tw + pad > window.innerWidth)
      left = Math.max(pad, window.innerWidth - tw - pad);
    if (top + th + pad > window.innerHeight)
      top = Math.max(pad, window.innerHeight - th - pad);
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });
}

function hideTooltip() {
  tooltip.style.display = "none";
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
}

document.addEventListener('click', function(event) {
  if (event.target !== tooltip && !event.target.closest('#verbatim-overlay')) {
    hideTooltip();
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
    return { meaning: 'No valid word selected', example: null };
  }
  
  const cached = readCache(cleanedWord);
  if (cached) {
    console.log('Cache hit:', cleanedWord);
    return cached;
  }
  
  console.log('Cache miss, fetching:', cleanedWord);
  
  try {
    const response = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${cleanedWord}`, 
      7000
    );
    
    if (!response.ok) {
      const result = { 
        meaning: response.status === 404 ? 'No definition found' : 'Network error',
        example: null 
      };
      writeCache(cleanedWord, result, ERROR_TTL);
      return result;
    }
    
    const data = await response.json();
    const def = data?.[0]?.meanings?.[0]?.definitions?.[0];
    const result = {
      meaning: def?.definition || 'No definition found',
      example: def?.example || null
    };
    
    writeCache(cleanedWord, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error('Definition fetch failed:', error);
    const result = { 
      meaning: 'Error fetching definition',
      example: null 
    };
    writeCache(cleanedWord, result, ERROR_TTL);
    return result;
  }
}

document.addEventListener('dblclick', async function(event) {
  if (!overlayEnabled) return;
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && !lookupInProgress) {
    lookupInProgress = true;
    const word = normalizeWord(selectedText);
    showTooltipAt(event.clientX, event.clientY, word, 'Loading...');
    try {
      const result = await fetchDefinition(selectedText);
      showTooltipAt(event.clientX, event.clientY, word, result.meaning, result.example);
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
          showTooltipAt(event.clientX, event.clientY, word, 'Loading...');
          try {
            const result = await fetchDefinition(rawWord);
            showTooltipAt(event.clientX, event.clientY, word, result.meaning, result.example);
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
  console.log('YouTube overlay with enhanced tooltip active');
}

