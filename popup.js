/*
SE Dictionary Chrome Extension - Popup page
© GSI 2019
Written by Dineetha
This code use very simple easy to understand approach suitable for students learning JavaScript.
 */

$(document).ready(function () {

  // Get dictionary in chrome storage when popup opening
  let words = [];
  $("#search_box").focus();

  function getWords(cb) {
    chrome.storage.local.get(['sed'], function (result) {
      if (result != undefined) {
        words = result.sed;
        //$("#search_box").prop("disabled", false);
       // $("#result_box").empty();
       cb();
      } else {
        $("#result_box").text("Dictionary definitions loading.....");
      }
    });
  }

  /*   chrome.runtime.sendMessage({ getWords: "ok" }, function (response) {
      console.log(response.sendWords);
    }); */

  // Search button click
  function searchWord() {
    $("#result_box").text("Searching.....");
    let result = [];
    let typedWord = $("#search_box").val();

    if (sinhalaDetection(typedWord) == false) {
      words.forEach((word) => {
        for (const key in word) {
          if (key == typedWord) {
            result.push(word[key]);
          }
        }
      });
    } else {
      words.forEach((word) => {
        for (const key in word) {
          if (word[key] == typedWord) {
            result.push(key);
          }
        }
      });
    }

    if (result.length == 0) {
      if (typedWord == "") {
        result.push("Please enter a word to find the meaning\n");
      } else {
        result.push("No matching words found\n");
      }
    }

    $("#result_box").empty();
    result.forEach((element) => {
      $("#result_box").append("<div>" + element + "</div>");
    });
  }

  // Getting instant suggestions
  function suggestWord() {
    let result = [];
    let typedWord = $("#search_box").val();
    if (sinhalaDetection(typedWord) == false) {
      words.forEach((word) => {
        for (const key in word) {
          if (key.startsWith(typedWord) && result.length <= 10) {
            if (result.indexOf(key) < 0) {
              result.push(key);
            }
          }
        }
      });
    } else {
      words.sort(compareSi);
      words.forEach((word) => {
        for (const key in word) {
          if (word[key].startsWith(typedWord) && result.length <= 10) {
            if (result.indexOf(word[key]) < 0) {
              result.push(word[key]);
            }
          }
        }
      });
    }

    if ($("#search_box").val() != "") {
      if (result.length != 0) {
        $("#result_box").empty();
        result.forEach((element) => {
          $("#result_box").append(
            "<a href='#' class='suggestList'>" + element + "</a><br>"
          );
        });
        $(".suggestList").click(function (e) {
          $("#search_box").val(e.toElement.innerHTML);
          searchWord();
        });
      } else {
        $("#result_box").text("No matching words found\n");
      }
    } else {
      $("#result_box").text("Please enter a word to find the meaning");
    }
  }

  // Sinhala unicode detection
  function sinhalaDetection(str) {
    return (
      str.split("").filter(function (char) {
        var charCode = char.charCodeAt();
        return charCode >= 3456 && charCode <= 3583;
      }).length > 0
    );
  }

  // Object array sort by values for Sinhala words
  function compareSi(a, b) {
    let a1 = a[Object.keys(a)[0]];
    let b1 = b[Object.keys(b)[0]];
    return a1.localeCompare(b1);
  }

  //***** Events

  // Type in search box event
  $("#search_box").keyup(function (e) {
    if (words.length == 0) {
      getWords(function () {
        if (e.keyCode == 13) {
          searchWord();
        } else {
          suggestWord();
        }
      });
    } else {
      if (e.keyCode == 13) {
        searchWord();
      } else {
        suggestWord();
      }
    }
  }).on("search", function () {
    if ($(this).val() == "") {
      suggestWord();
    }
  });

  // Click search button and get meaning
  $("#search_button").click(function () {
    searchWord();
  });
});
