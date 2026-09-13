chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Swift Jot extension successfully installed.');
  } else if (details.reason === 'update') {
    console.log('Swift Jot extension updated to version', chrome.runtime.getManifest().version);
  }
});
