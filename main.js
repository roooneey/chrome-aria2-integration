var settings = new Store('settings', {
        "rpcpath" : "http://localhost:6800/jsonrpc",
        "rpcuser" : "",
        "rpctoken" : "",
        "filesizesetting" : "500M",
        "whitelisttype" : "",
        "whitelistsite" : "",
        "blacklistsite" : "",
        "captureCheckbox" : true,
        "sizecaptureCheckbox" : true
    });

chrome.storage.local.set({"rpcpath":settings.get('rpcpath')});
chrome.storage.local.set({"rpcuser":settings.get('rpcuser')});
chrome.storage.local.set({"rpctoken":settings.get('rpctoken')});

//Binux 
//https://github.com/binux

var ARIA2 = (function () {
        "use strict";
        function get_auth(url) {
            return url.match(/^(?:(?![^:@]+:[^:@\/]*@)[^:\/?#.]+:)?(?:\/\/)?(?:([^:@]*(?::[^:@]*)?)?@)?/)[1];
        }

        function request(jsonrpc_path, method, params) {
            var jsonrpc_version = '2.0', xhr = new XMLHttpRequest(), auth = get_auth(jsonrpc_path);
            var request_obj = {
                    jsonrpc: jsonrpc_version,
                    method: method,
                    id: (new Date()).getTime().toString()
                };
            if (params) {
                request_obj.params = params;
            }
            xhr.open("POST", jsonrpc_path + "?tm=" + (new Date()).getTime().toString(), true);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            if (settings.get('rpcuser')) {
            	xhr.setRequestHeader("Authorization", "Basic " + btoa(settings.get('rpcuser') + ':' + settings.get('rpctoken')));
            } else {
            	if (settings.get('rpctoken')) {
            		request_obj.params = ['token:' + settings.get('rpctoken')].concat(request_obj.params);
            	}
            }
            xhr.send(JSON.stringify(request_obj));
        }
        return function (jsonrpc_path) {
            this.jsonrpc_path = jsonrpc_path;
            this.addUri = function (uri, options) {
                request(this.jsonrpc_path, 'aria2.addUri', [[uri], options]);
            };
            return this;
        };
    }());


function showNotification() {
    "use strict";
    var notfopt = {
            type: "basic",
            title: "Aria2 Integration",
            iconUrl: "icons/notificationicon.png",
            message: "The download has been sent to aria2 queue"
        };
    chrome.notifications.create("senttoaria2", notfopt, function () {return; });
    window.setTimeout(function () {chrome.notifications.clear("senttoaria2", function () {return; }); }, 3000);
}

// context menu module
chrome.contextMenus.create(
    {
        title: 'Download with aria2',
        id: "linkclick",
        contexts: ['link']
    }
);

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    "use strict";
    if (info.menuItemId === "linkclick") {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            addToAria2WithInfo({url: info.linkUrl}, tabs[0].url, directAdd);
        });
    }
});


function getCookies(url, callback) {

    var result = '';

    chrome.cookies.getAll({'url': url} , function (cookies) {
        
        for (i = 0; i < cookies.length; i++) {
            var cookie = cookies[i];
            result += cookie.name + '=' + cookie.value + ';';
        }

        callback(result)
    })
}

//Auto capture module
function sitelistProc(list) {
	var re_list;
    if (list === '') {
        re_list = new RegExp('^\\s$', "g");
    } else {
        list = list.replace(/\./g, "\\.");
        list = list.replace(/\,/g, "|");
        list = list.replace(/\*/g, "[^ ]*");
        re_list = new RegExp(list, "gi");
    }
    return re_list;
}

function isCapture(size, taburl, url, name) {
    "use strict";
    var bsites = settings.get('blacklistsite'), wsites = settings.get('whitelistsite');
    var re_bsites = sitelistProc(bsites), re_wsites = sitelistProc(wsites);

    var ftypes = settings.get('whitelisttype').toLowerCase();
    var Intype = ftypes.indexOf(name.split('.').pop().toLowerCase());
    
    var thsize = settings.get('filesizesetting');
    var thsizeprec = ['K', 'M', 'G', 'T'];
    var thsizebytes = thsize.match(/[\d\.]+/)[0] * Math.pow(1024, thsizeprec.indexOf(thsize.match(/[a-zA-Z]+/)[0].toUpperCase()) + 1);

    var res;
    switch (true) {
    case url.substring(0,5) === 'blob:':
    	res = 0;
    	break;
    case re_bsites.test(taburl):
        res = 0;
        break;
    case re_wsites.test(taburl):
        res = 1;
        break;
    case (Intype !== -1):
        res = 1;
        break;
    case (size >= thsizebytes && settings.get('sizecaptureCheckbox')):
        res = 1;
        break;
    default:
        res = 0;
    }

    return res;
}

function getAria2ProxyString(pacString) {
    if (pacString.indexOf('DIRECT') != -1 || pacString.indexOf('__PROXY__') != -1) return "";
    if (pacString.indexOf("PROXY ") != -1) { // Use HTTP proxy first
        var s1 = pacString.substring(pacString.indexOf("PROXY ") + 6);
        if (s1.indexOf(";") != -1)
            s1 = s1.substring(0, s1.indexOf(";"));
            return s1;
    }
    // then try SOCKS(some socks proxy servers like Shadowsocks-RSS supports HTTP on socks ports.).
    var s1 = pacString.substring(pacString.indexOf(" ") + 1);
    if (s1.indexOf(";") != -1)
        s1 = s1.substring(0, s1.indexOf(";"));
    return s1;
}

function getAria2ProxyStringFromChromeProxy(proxyObject) {
    return proxyObject.host + ":" + proxyObject.port;
}

function captureAdd(Item, taburl) {
    "use strict";
    if (isCapture(Item.fileSize, taburl, Item.url, Item.filename) === 1) {
        addToAria2WithInfo(Item, taburl, cancelAndAdd);
    }
}

function addToAria2WithInfo(Item, referer, addCallback) {
    getCookies(Item.url, function(cookies) {
        chrome.proxy.settings.get({}, function(details) {
            var aria2 = new ARIA2(settings.get('rpcpath')), 
            params = {};
        
            params.referer = referer;
            params.header = "Cookie:" + cookies;
            params.out = Item.filename;
            switch (details.value.mode) {
                case 'pac_script':
                var pacScript = details.value.pacScript;
                if (pacScript.data != undefined) {
                    params['all-proxy'] = getAria2ProxyString(eval(pacScript.data + "FindProxyForURL('" + Item.url + "', '" + new URL(Item.url).hostname + "')")); 
                    addCallback(Item, params, aria2);
                } else if (pacScript.url != undefined) {
                    var xmlHttp = new XMLHttpRequest();
                    xmlHttp.onreadystatechange = function() {
                        if (xmlHttp.readyState == 4) {
                            if (xmlHttp.status == 200) {
                                params['all-proxy'] = getAria2ProxyString(eval(xmlHttp.responseText + "FindProxyForURL('" + Item.url + "', '" + new URL(Item.url).hostname + "')")); 
                            }
                            addCallback(Item, params, aria2);
                        }
                    }
                    xmlHttp.open("GET", pacScript.url, true);
                }
                break;

                case 'fixed_servers':
                var iurl = new URL(Item.url);
                var rules = details.value.rules;
                if (rules.bypassList != undefined && rules.bypassList.indexOf(iurl.hostname) != -1)
                    addCallback(Item, params, aria2);
                else {
                    if (rules.singleProxy != undefined)
                        params['all-proxy'] = getAria2ProxyStringFromChromeProxy(rules.singleProxy);
                    else if (iurl.protocol == 'http:' && rules.proxyForHttp != undefined)
                        params['all-proxy'] = getAria2ProxyStringFromChromeProxy(rules.proxyForHttp);
                    else if (iurl.protocol == 'https:' && rules.proxyForHttps != undefined)
                        params['all-proxy'] = getAria2ProxyStringFromChromeProxy(rules.proxyForHttps);
                    else if ((iurl.protocol == 'http:' || iurl.protocol == 'https:') && rules.fallbackProxy != undefined)
                        params['all-proxy'] = getAria2ProxyStringFromChromeProxy(rules.fallbackProxy);
                        addCallback(Item, params, aria2);
                }

                default: // we don't process direct and auto_detect, download as usual
                addCallback(Item, params, aria2);
            }
        });
    });
}

function cancelAndAdd(item, params, aria2) {
    chrome.downloads.cancel(item.id, function() {
        aria2.addUri(item.url, params);
    });

    //console.log(Item);
    showNotification();
}

function directAdd(item, params, aria2) {
    aria2.addUri(item.url, params);
    showNotification();
}


chrome.downloads.onDeterminingFilename.addListener(function (Item, s) {
    "use strict";
    //console.log(Item);
    if (settings.get('captureCheckbox') && !shiftPressed) {
        chrome.tabs.query({'active': true, 'currentWindow': true}, function (tabs) {

            captureAdd(Item, tabs[0].url);
        });
    }
});

var shiftPressed = false;
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){
    switch(request.type){
        case 'shiftPressed':
            shiftPressed = true;
            break;
        case 'keyup':
            shiftPressed = false;
            break;
    }
}); 