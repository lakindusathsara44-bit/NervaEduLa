/* NervaEdu loader controls. Requires #nerva-loading in the page. */
(function () {
  "use strict";
  function getLoader() { return document.getElementById("nerva-loading"); }
  function show(message) {
    var loader = getLoader();
    if (!loader) return;
    if (typeof message === "string" && message.trim()) {
      var messageElement = loader.querySelector("[data-nerva-message]");
      if (messageElement) {
        var dots = messageElement.querySelector(".nerva-loader__dots");
        messageElement.textContent = message.trim();
        if (dots) messageElement.appendChild(dots);
      }
    }
    loader.classList.add("is-visible");
    loader.setAttribute("aria-hidden", "false");
    document.body.classList.add("nerva-loading-lock");
  }
  function hide() {
    var loader = getLoader();
    if (!loader) return;
    loader.classList.remove("is-visible");
    loader.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nerva-loading-lock");
  }
  function setMessage(message) {
    var loader = getLoader();
    var messageElement = loader && loader.querySelector("[data-nerva-message]");
    if (messageElement && typeof message === "string") {
      var dots = messageElement.querySelector(".nerva-loader__dots");
      messageElement.textContent = message;
      if (dots) messageElement.appendChild(dots);
    }
  }
  window.NervaLoader = { show: show, hide: hide, setMessage: setMessage };
  document.addEventListener("DOMContentLoaded", function () {
    var loader = getLoader();
    if (loader && loader.classList.contains("is-visible")) document.body.classList.add("nerva-loading-lock");
  });
})();