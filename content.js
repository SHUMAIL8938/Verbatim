const popup = document.createElement('div');
popup.id = 'verbatim-popup';
popup.style.position = 'fixed';
popup.style.background = '#333';
popup.style.color = 'white';
popup.style.padding = '5px';
popup.style.zIndex = '10000';
popup.style.display = 'none';
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
