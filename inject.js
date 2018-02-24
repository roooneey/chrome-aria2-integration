chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    'use strict';
    if (request.range === "cookie") {
        sendResponse({pagecookie: document.cookie});
    }
    if (request.range === "both") {
        sendResponse({pagecookie: document.cookie, taburl: document.URL});
    }
});

window.addEventListener('keydown',function(event){
    if(event.shiftKey){
        chrome.runtime.sendMessage({type: 'shiftPressed'}, function(){});
    }
});

window.addEventListener('keyup',function(event){
    chrome.runtime.sendMessage({type: 'keyup'}, function(){});  
});