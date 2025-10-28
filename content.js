console.log('Verbatim v0.1.0 loaded');


async function getDefinition(word) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    const data = await response.json();
    return data[0]?.meanings[0]?.definitions[0]?.definition || 'No definition found';
  } catch (error) {
    return 'Error loading definition';
  }
}

document.addEventListener('dblclick', async (event) => {
  const selectedText = window.getSelection().toString();
  const word =selectedText.trim();
  
  if (word) {
    alert(`${word}: Loading...`);
    const definition = await getDefinition(word);
    alert(`${word}: ${definition}`);
  }
});
