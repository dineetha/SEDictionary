let word_list = [];
$.get(
    "ENtoSI.json",
    "",
    function (data, textStatus, jqXHR) {
        word_list = JSON.parse(data);
    },
    "text"
);

chrome.runtime.onMessage.addListener(
    function (message, callback) {
        if (message == "get_words") {
            chrome.tabs.executeScript({
                code: 'document.body.style.backgroundColor="orange"'
            });
        }
    });