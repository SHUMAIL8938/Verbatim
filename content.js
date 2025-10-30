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
function showPopup(x, y, text) {
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
  console.log(`Popup positioned at ${left}, ${top}`);
}
function hidePopup() {
  popup.style.display = 'none';
}
function cleanWord(text) {
  if (!text) return '';
  let word = text.trim().toLowerCase();
  return word.replace(/[.,!?;:"()[\]{}]/g, '');
}
async function lookupWord(word) {
  const cleanedWord = cleanWord(word);
  if (!cleanedWord || cleanedWord.length < 2) {
    return 'Invalid word selection';
  }
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanedWord}`);
    if (!response.ok) {
      if (response.status === 404) {
        return `"${cleanedWord}" not found`;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const definition = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
    return definition || 'No definition available';
  } catch (error) {
    console.error('API Error:', error);
    return 'Error loading definition';
  }
}
document.addEventListener('dblclick', async function(event) {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText) {
    showPopup(event.clientX, event.clientY, 'Loading...');
    const definition = await lookupWord(selectedText);
    showPopup(event.clientX, event.clientY, `${cleanWord(selectedText)}: ${definition}`);
  }
});
