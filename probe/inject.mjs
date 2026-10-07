// Probe only: puts a script at the top of the WNBA page's head that opens it on Games (or, with
// ?probe=click, on Bracket and then taps Games), and reports the pager's geometry to the server log.
import { readFileSync, writeFileSync } from "node:fs";

const script = `<script>
(function () {
  var click = location.search.indexOf("probe=click") >= 0;
  try { localStorage.setItem("lastTab", click ? "bracket" : "games"); } catch (error) {}
  function report(stage) {
    var pages = document.querySelector("#view-games .pager-pages");
    var rect = pages ? pages.getBoundingClientRect() : null;
    var selected = document.querySelector("nav.tabs [aria-selected=true]");
    var data = {
      stage: stage,
      dpr: devicePixelRatio,
      inner: [innerWidth, innerHeight],
      visual: window.visualViewport ? [visualViewport.width, visualViewport.height, visualViewport.offsetTop] : null,
      rect: rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round) : null,
      scrollLeft: pages ? pages.scrollLeft : null,
      clientWidth: pages ? pages.clientWidth : null,
      rows: pages ? pages.querySelectorAll(".game-row, button").length : 0,
      tab: selected ? selected.getAttribute("data-tab") : null,
      willChange: pages && pages.firstElementChild ? getComputedStyle(pages.firstElementChild).willChange : null,
      ua: navigator.userAgent
    };
    fetch("probe-report?" + encodeURIComponent(JSON.stringify(data))).catch(function () {});
  }
  addEventListener("load", function () {
    setTimeout(function () { report("t15"); }, 15000);
    if (click) setTimeout(function () {
      var button = document.querySelector('nav.tabs [data-tab="games"]');
      if (button) button.click();
      setTimeout(function () { report("clicked"); }, 4000);
    }, 20000);
    setTimeout(function () { report("t35"); }, 35000);
  });
})();
</script>
`;

const [indexPath] = process.argv.slice(2);
const page = readFileSync(indexPath, "utf8");
const marker = '<meta charset="utf-8" />\n';
if (!page.includes(marker)) throw new Error("No charset meta to put the probe after");
writeFileSync(indexPath, page.replace(marker, marker + script));
console.log(`Probe script added to ${indexPath}`);
