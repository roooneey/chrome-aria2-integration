window.addEvent("domready", function () {
    new FancySettings.initWithManifest();
});

// Update the settings
window.addEvent("close", function() {
  var settings = new Store('settings', {
	  "rpcpath" : "http://localhost:6800/jsonrpc",
	  "rpcuser" : "",
	  "rpctoken" : "",
      });

  chrome.storage.local.set({"rpcpath":settings.get('rpcpath')});
  chrome.storage.local.set({"rpcuser":settings.get('rpcuser')});
  chrome.storage.local.set({"rpctoken":settings.get('rpctoken')});
});
