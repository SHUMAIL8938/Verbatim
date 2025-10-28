console.log('Verbatim extension v0.0.2 loaded');
async function lookupWord(word) {
  console.log('Looking up word:', word);
  
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return 'Word not found in dictionary';
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data[0] && data[0].meanings && data[0].meanings[0]) {
      const definition = data[0].meanings[0].definitions[0].definition;
      return definition;
    } else {
      return 'No definition available';
    }
  } catch (error) {
    console.error('API Error:', error);
    if (error.name === 'TypeError') {
      return 'Network error - check connection';
    }
    return 'Error loading definition';
  }
}

document.addEventListener('dblclick', async function(event) {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText) {
    console.log('Looking up:', selectedText);
    const definition = await lookupWord(selectedText);
    alert(`${selectedText}: ${definition}`);
  }
});
