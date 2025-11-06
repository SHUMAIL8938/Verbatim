const isYouTube = window.location.hostname.includes('youtube.com');
let lookupInProgress = false;
let overlayContainer = null;
let lastCaptionSnapshot = '';
let overlayEnabled = true;
let mutationObserver = null;
let rebuildTimer = null;

const MIN_HITBOX_WIDTH = 20;
const MIN_HITBOX_HEIGHT = 18;
const HITBOX_PAD_X = 6;
const HITBOX_PAD_Y = 4;
const CACHE_TTL = 1000 * 60 * 60 * 24;
const ERROR_TTL = 1000 * 60 * 5;
const MAX_CACHE_ITEMS = 800;
const REBUILD_DEBOUNCE_MS = 80;

chrome.storage.sync.get(['enabled'], (result) => {
  overlayEnabled = result.enabled !== false;
  console.log('Overlay enabled:', overlayEnabled);
  if (overlayEnabled && isYouTube) {
    startObservers();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'TOGGLE_OVERLAY') {
    overlayEnabled = msg.enabled;
    console.log('Overlay toggled:', overlayEnabled);
    if (overlayEnabled && isYouTube) {
      ensureOverlayContainer();
      startObservers();
      scheduleRebuild();
    } else {
      cleanup();
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
  } catch (e) {}
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
    ex.textContent = `Example: ${exampleText}`;
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
}

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
  if (cached) return cached;
  
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

function ensureOverlayContainer() {
  if (overlayContainer) return overlayContainer;
  
  overlayContainer = document.createElement("div");
  overlayContainer.id = "verbatim-overlay-container";
  Object.assign(overlayContainer.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: 2147483639,
  });
  document.documentElement.appendChild(overlayContainer);
  
  overlayContainer.addEventListener("click", async (ev) => {
    const span = ev.target.closest("span[data-word-normalized]");
    if (!span) return;
    ev.stopPropagation();
    
    const raw = span.dataset.word || span.textContent || "";
    const normalized = span.dataset.wordNormalized || normalizeWord(raw);
    if (!normalized) return;
    
    const rect = span.getBoundingClientRect();
    const x = ev.clientX;
    const y = rect.bottom + window.scrollY;
    
    showTooltipAt(x, y, normalized, "Loading...");
    const res = await fetchDefinition(normalized);
    showTooltipAt(x, y, normalized, res.meaning, res.example);
  }, true);
  
  return overlayContainer;
}

function buildOverlayForCaptionElement(captionEl, fragment) {
  if (!captionEl || !fragment) return;
  
  const walker = document.createTreeWalker(captionEl, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const text = node.nodeValue;
    const tokens = text.split(/(\s+)/);
    let offset = 0;
    
    for (const token of tokens) {
      if (!token || /\s+/.test(token)) {
        offset += token.length;
        continue;
      }
      
      try {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + token.length);
        const rects = range.getClientRects();
        
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (r.width <= 0 || r.height <= 0) continue;
          
          const ov = document.createElement("span");
          const rawWord = token;
          const normalized = normalizeWord(rawWord);
          ov.dataset.word = rawWord;
          ov.dataset.wordNormalized = normalized;
          
          Object.assign(ov.style, {
            position: "fixed",
            left: `${r.left - HITBOX_PAD_X}px`,
            top: `${r.top - HITBOX_PAD_Y}px`,
            width: `${Math.max(r.width + HITBOX_PAD_X * 2, MIN_HITBOX_WIDTH)}px`,
            height: `${Math.max(r.height + HITBOX_PAD_Y * 2, MIN_HITBOX_HEIGHT)}px`,
            display: "inline-block",
            pointerEvents: "auto",
            background: "transparent",
            borderRadius: "4px",
            cursor: "pointer",
          });
          
          fragment.appendChild(ov);
        }
      } catch (e) {}
      offset += token.length;
    }
  });
}

function rebuildOverlays() {
  if (!overlayEnabled) return;
  ensureOverlayContainer();
  
  const captionSegs = Array.from(
    document.querySelectorAll(".ytp-caption-segment, .caption-window *")
  );
  
  if (captionSegs.length === 0) {
    overlayContainer.innerHTML = "";
    lastCaptionSnapshot = "";
    return;
  }
  
  const snapshot = captionSegs.map((el) => el.textContent).join("\n");
  if (snapshot === lastCaptionSnapshot) return;
  lastCaptionSnapshot = snapshot;

  const frag = document.createDocumentFragment();
  captionSegs.forEach((seg) => buildOverlayForCaptionElement(seg, frag));
  overlayContainer.innerHTML = "";
  overlayContainer.appendChild(frag);
}

function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildOverlays, REBUILD_DEBOUNCE_MS);
}

function startObservers() {
  function findAndObserve() {
    const container = document.querySelector('.ytp-caption-window-container') ||
                      document.querySelector('.caption-window, .captions-text');
    if (!container) return requestAnimationFrame(findAndObserve);
    
    if (mutationObserver) mutationObserver.disconnect();
    
    mutationObserver = new MutationObserver(scheduleRebuild);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    scheduleRebuild();
    console.log('MutationObserver attached with hitbox system');
  }
  findAndObserve();
}

function cleanup() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
    rebuildTimer = null;
  }
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
  }
  lastCaptionSnapshot = '';
}

window.addEventListener('beforeunload', cleanup);

if (isYouTube && overlayEnabled) {
  startObservers();
}
