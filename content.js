console.log("Verbatim extension v0.0.3 loaded");

function cleanWord(text) {
  if (!text) return "";
  let word = text.trim();
  word = word.toLowerCase();
  word = word.replace(/[.,!?;:"()[\]{}]/g, "");
  word = word.replace(/[']/g, "'");
  return word;
}

async function lookupWord(word) {
  const cleanedWord = cleanWord(word);
  console.log("Looking up cleaned word:", cleanedWord);
  if (!cleanedWord || cleanedWord.length < 2) {
    return "Invalid word selection";
  }
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${cleanedWord}`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return "Word not found in dictionary";
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data && data[0] && data[0].meanings && data[0].meanings[0]) {
      const definition = data[0].meanings[0].definitions[0].definition;
      return definition;
    } else {
      return "No definition available";
    }
  } catch (error) {
    console.error("API Error:", error);
    return "Error loading definition";
  }
}

document.addEventListener("dblclick", async function (event) {
  const selectedText = window.getSelection().toString();
  if (selectedText.trim()) {
    console.log("Selected text:", selectedText);
    const definition = await lookupWord(selectedText);
    alert(`Definition: ${definition}`);
  }
});
