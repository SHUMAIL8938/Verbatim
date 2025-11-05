document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggleFeature");
  
  const { enabled } = await chrome.storage.sync.get(["enabled"]);
  toggle.checked = enabled !== false;
  
  toggle.addEventListener("change", async () => {
    const isEnabled = toggle.checked;
    await chrome.storage.sync.set({ enabled: isEnabled });
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_OVERLAY", enabled: isEnabled });
  });
});
