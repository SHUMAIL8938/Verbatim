const popup = document.createElement('div');
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
document.body.appendChild(popup);
function showpopup(x, y, text) {
  popup.textContent = text;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  popup.style.display = 'block';
  console.log('Showing popup:', text);
}
function hidepopup() {
  popup.style.display = 'none';
  console.log('Hiding popup');
}
function cleanWord(text) {
  if (!text) return '';
  let word = text.trim().toLowerCase();
  word = word.replace(/[.,!?;:"()[\]{}]/g, '');
  return word;
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
        return 'Word not found';
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data && data[0] && data[0].meanings && data[0].meanings[0]) {
      return data[0].meanings[0].definitions[0].definition;
    } else {
      return 'No definition available';
    }
  } catch (error) {
    console.error('API Error:', error);
    return 'Error loading definition';
  }
}
document.addEventListener('dblclick', async function(event) {
  const selectedText = window.getSelection().toString();
  if (selectedText.trim()) {
    showpopup(event.clientX, event.clientY, 'Loading...');
    const definition = await lookupWord(selectedText);
    showpopup(event.clientX, event.clientY, definition);
  }
});
