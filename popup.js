﻿/* SE Dictionary Chrome extension popup code
 © GSI 2019
 Written by Dineetha
 This code use very simple easy to understand approach suitable for students learning JavaScript.
 */

$(document).ready(function () {

  // Get dictionary file when popup opening
  let words;
  (function () {
    $.get("ENtoSI.json", "", function (data, textStatus, jqXHR) {
        words = JSON.parse(data);
      }, "text");
    $("#search1").focus();
  })();

  // Search words
  function searchWord() {

    let result = [];
    let typedWord = $("#search1").val();

    if (sinhalaDetection(typedWord) == true) {

      words.forEach(word => {
        for (const key in word) {
          if (word[key] == typedWord) {
            result.push(key);
          }
        }
      });

    } else {

      words.forEach(word => {
        for (const key in word) {
          if (key == typedWord) {
            result.push(word[key]);
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

    $("#div3").empty();
    result.forEach(element => {
      $("#div3").append("<div>" + element + "</div>");
    });
  }

  function suggestWord() {
    let result = [];
    let typedWord = $("#search1").val();

    if (sinhalaDetection(typedWord) == false) {
      words.forEach(word => {
        for (const key in word) {
          if (key.startsWith(typedWord) && result.length < 10) {
            if (result.indexOf(key) < 0) {
              result.push(key);
            }
          }
        }
      });
    } else {
      words.sort(compare);
      words.forEach(word => {
        for (const key in word) {
          if (word[key].startsWith(typedWord) && result.length < 10) {
            if (result.indexOf(word[key]) < 0) {
              result.push(word[key]);
            }
          }
        }
      });
    }

    if ($("#search1").val() != "") {
      $("#div3").empty();
      result.forEach(element => {
        $("#div3").append("<a href='#' class='suggestList'>" + element + "</a><br>");
      });
      $(".suggestList").click(function (e) {
        $("#search1").val(e.toElement.innerHTML);
        searchWord();
      });
    } else {
      $("#div3").empty();
    }
  }

  // Sinhala unicode detection algorithm
  function sinhalaDetection(str) {
    return str.split("").filter(function (char) {
      var charCode = char.charCodeAt();
      return charCode >= 3456 && charCode <= 3583;
    }).length > 0;
  }

  // Object array sort
  function compare(a, b) {
    let a1 = a[Object.keys(a)[0]];
    let b1 = b[Object.keys(b)[0]];
    return a1.localeCompare(b1);
  }

  //***** Events

  // Type in search box event. Get suggested result like Google results page
  $("#search1").keyup(function (e) {
    if (e.keyCode == 13) {
      searchWord();
    } else {
      suggestWord();
    }
  });

  // Click search button and get meaning
  $("#button1").click(function () {
    searchWord();
  });

});