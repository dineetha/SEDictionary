chrome.runtime.onInstalled.addListener(
    function () {
        $.get(
            "ENtoSI.json",
            "",
            function (data, textStatus, jqXHR) {
                wordList = JSON.parse(data);
                chrome.storage.local.set({ "sed": wordList }, function () {
                    console.log('Value is set');
                })
            },
            "text"
        );
    }
);

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.getWords == "ok") {
            sendResponse({ sendWords: wordList });
        }
        return true;
    }
);