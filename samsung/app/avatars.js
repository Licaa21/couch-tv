// Built-in profile pictures for the people on the home (Home settings, People, a person, Picture).
// Twenty-four little vector faces, drawn here so nothing has to be downloaded. app.js draws one with
// window.AVATARS.html(id). The words for each (av_<id>) are in i18n.js, in English and Romanian.
(function () {
  "use strict";
  function c(x, y, r, fill) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"/>'; }
  function e(x, y, rx, ry, fill, extra) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || "") + "/>"; }
  function p(points, fill) { return '<polygon points="' + points + '" fill="' + fill + '"/>'; }
  function r(x, y, w, h, rx, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + fill + '"/>'; }
  function line(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 1.7) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function eyes(y, d, rad, fill) { return c(32 - d, y, rad || 2.6, fill || "#222") + c(32 + d, y, rad || 2.6, fill || "#222"); }
  var SMILE = line("M27 44q5 4 10 0", "#222");

  // id, background, drawing
  var LIST = [
    ["cat", "#ffe0b8", p("16,28 19,9 31,21", "#f09a2d") + p("48,28 45,9 33,21", "#f09a2d") + p("20,25 21,15 27,21", "#ffb3b3") + p("44,25 43,15 37,21", "#ffb3b3") +
      c(32, 37, 18, "#f09a2d") + eyes(35, 7) + p("30,40 34,40 32,43", "#e8607a") + SMILE + line("M11 40l11 2M11 46l11-2M53 40l-11 2M53 46l-11-2", "#8a5a1a", 1.2)],
    ["dog", "#d7ecff", e(14, 34, 6, 12, "#8b5a2b") + e(50, 34, 6, 12, "#8b5a2b") + c(32, 36, 17, "#d9a066") + e(32, 43, 9, 7, "#f6e2c4") +
      eyes(32, 7) + e(32, 40, 3.4, 2.6, "#222") + line("M29 46q3 3 6 0", "#222")],
    ["fox", "#ffe9d6", p("14,27 17,6 31,20", "#e8681f") + p("50,27 47,6 33,20", "#e8681f") + c(32, 37, 18, "#e8681f") + p("15,39 32,57 49,39 32,46", "#fff3e6") +
      eyes(34, 7) + c(32, 52, 2.4, "#222")],
    ["bear", "#e6d5c3", c(17, 19, 7, "#7a4b2a") + c(47, 19, 7, "#7a4b2a") + c(17, 19, 3.4, "#c99a6b") + c(47, 19, 3.4, "#c99a6b") + c(32, 36, 18, "#7a4b2a") +
      e(32, 43, 8, 6.5, "#d2a679") + eyes(33, 7) + e(32, 40, 3.2, 2.4, "#222") + line("M32 42v3M29 46q3 2 3-1M32 45q0 3 3 1", "#222", 1.3)],
    ["panda", "#dff5e1", c(17, 19, 7.5, "#222") + c(47, 19, 7.5, "#222") + c(32, 36, 18, "#fff") + e(24.5, 33, 5, 6.5, "#222") + e(39.5, 33, 5, 6.5, "#222") +
      c(25, 33, 2, "#fff") + c(39, 33, 2, "#fff") + e(32, 42, 3.5, 2.6, "#222") + line("M28 46q4 3 8 0", "#222")],
    ["rabbit", "#ffe3ef", e(23, 15, 5, 13, "#fff") + e(41, 15, 5, 13, "#fff") + e(23, 16, 2.6, 9, "#ffb3cc") + e(41, 16, 2.6, 9, "#ffb3cc") + c(32, 40, 17, "#fff") +
      eyes(38, 7) + c(32, 44, 2.4, "#ff7aa5") + line("M32 46v2M29 49q3 2 3-1M32 48q0 3 3 1", "#c4627f", 1.3)],
    ["owl", "#e3dcf5", p("16,22 20,9 28,18", "#8a6a4a") + p("48,22 44,9 36,18", "#8a6a4a") + c(32, 36, 19, "#8a6a4a") + e(32, 50, 9, 5, "#c9a67f") +
      c(24, 32, 8, "#fff") + c(40, 32, 8, "#fff") + c(24, 32, 3.6, "#222") + c(40, 32, 3.6, "#222") + p("29,38 35,38 32,45", "#f2a01a")],
    ["penguin", "#d8ecf8", e(32, 36, 18, 22, "#2b3340") + e(32, 42, 12, 15, "#fff") + e(32, 31, 13, 10, "#fff") + eyes(30, 6) +
      p("29,35 35,35 32,40", "#f5a623") + e(24, 59, 5, 2.6, "#f5a623") + e(40, 59, 5, 2.6, "#f5a623")],
    ["frog", "#e6f7d4", c(21, 22, 8, "#5cb85c") + c(43, 22, 8, "#5cb85c") + c(21, 22, 5, "#fff") + c(43, 22, 5, "#fff") + c(21, 22, 2.4, "#222") + c(43, 22, 2.4, "#222") +
      e(32, 40, 20, 16, "#5cb85c") + line("M20 43q12 10 24 0", "#2f6b2f", 2) + c(23, 48, 3, "#ffb3b3") + c(41, 48, 3, "#ffb3b3")],
    ["lion", "#fff1c9", c(32, 34, 25, "#c9761a") + c(32, 36, 16, "#f2b84b") + c(19, 19, 5, "#f2b84b") + c(45, 19, 5, "#f2b84b") + e(32, 43, 8, 6, "#fbe3a8") +
      eyes(33, 6) + p("29,40 35,40 32,44", "#7a3b10") + line("M27 47q5 4 10 0", "#7a3b10", 1.4)],
    ["koala", "#e5e9ee", c(15, 24, 10, "#9aa3ad") + c(49, 24, 10, "#9aa3ad") + c(15, 24, 5.5, "#e6eaee") + c(49, 24, 5.5, "#e6eaee") + c(32, 37, 17, "#9aa3ad") +
      eyes(34, 6.5) + e(32, 41, 5, 7, "#2b2f33")],
    ["monkey", "#f5e1cf", c(13, 35, 7, "#8a5a34") + c(51, 35, 7, "#8a5a34") + c(13, 35, 3.6, "#f2c9a0") + c(51, 35, 3.6, "#f2c9a0") + c(32, 34, 17, "#8a5a34") +
      e(32, 41, 13, 11, "#f2c9a0") + eyes(36, 5.5) + e(32, 44, 3, 1.8, "#8a5a34") + line("M27 49q5 3 10 0", "#6b3f1f", 1.5)],
    ["pig", "#ffe0e6", p("17,25 15,10 28,17", "#f59bb1") + p("47,25 49,10 36,17", "#f59bb1") + c(32, 36, 18, "#f8b2c4") + e(32, 43, 8, 6, "#f58aa6") +
      c(29, 43, 1.6, "#b04566") + c(35, 43, 1.6, "#b04566") + eyes(33, 7)],
    ["tiger", "#ffe8c7", c(17, 20, 6.5, "#f08a1c") + c(47, 20, 6.5, "#f08a1c") + c(32, 36, 18, "#f08a1c") +
      line("M32 19v6M24 20l2 5M40 20l-2 5M14 34l6 1M50 34l-6 1", "#2a1a0a", 2) + e(32, 43, 9, 6.5, "#fff3dd") + eyes(34, 6.5) +
      p("29,40 35,40 32,43.5", "#2a1a0a")],
    ["unicorn", "#efe3fb", c(47, 22, 6, "#ff9ad5") + c(50, 33, 5.5, "#b49cff") + c(48, 44, 5, "#7ad7ff") + p("32,3 28,20 36,20", "#ffd45e") + p("22,23 19,12 29,19", "#fff") +
      e(32, 38, 17, 17, "#fff") + eyes(37, 6) + e(32, 45, 5, 3, "#ffd1e6") + line("M30 46q2 1.6 4 0", "#c4627f", 1.2)],
    ["robot", "#dde7f0", line("M32 8v7", "#6b7a89", 2) + c(32, 7, 3, "#ff5a5a") + r(10, 26, 5, 10, 2, "#6b7a89") + r(49, 26, 5, 10, 2, "#6b7a89") + r(15, 15, 34, 33, 6, "#9fb3c4") +
      r(19, 21, 26, 16, 3, "#1f2a35") + c(26, 29, 3.2, "#5cf2a0") + c(38, 29, 3.2, "#5cf2a0") + r(24, 41, 16, 4, 1.5, "#1f2a35") + line("M28 41v4M32 41v4M36 41v4", "#9fb3c4", 1)],
    ["alien", "#d9f5e8", e(32, 34, 18, 21, "#7ddc7a") + e(24, 31, 6, 9, "#1a2b1a", ' transform="rotate(-18 24 31)"') + e(40, 31, 6, 9, "#1a2b1a", ' transform="rotate(18 40 31)"') +
      c(22, 28, 1.7, "#fff") + c(38, 28, 1.7, "#fff") + line("M28 46q4 2.6 8 0", "#1a2b1a", 1.6)],
    ["ghost", "#e4e4f7", '<path d="M16 54V30a16 16 0 0 1 32 0v24l-5.3-4-5.4 4-5.3-4-5.3 4-5.4-4z" fill="#fff"/>' + eyes(30, 6, 3) + e(32, 39, 3.2, 4.2, "#555") +
      c(21, 38, 3, "#ffc2d2") + c(43, 38, 3, "#ffc2d2")],
    ["astronaut", "#0f1b3d", c(10, 12, 1, "#fff") + c(54, 10, 1.2, "#fff") + c(52, 50, 1, "#fff") + c(8, 46, 1.1, "#fff") + e(32, 62, 16, 8, "#f3f6fa") + c(32, 33, 20, "#f3f6fa") +
      e(32, 34, 14, 11, "#1b2a4e") + line("M24 30q3-5 9-5", "#8fb4ff", 2)],
    ["ninja", "#e3e3e8", c(32, 34, 19, "#2b2f3a") + r(14, 27, 36, 13, 5, "#f0c9a0") + r(13, 19, 38, 5, 2, "#e63946") + line("M50 21l7 5M50 22l6 -1", "#e63946", 2) +
      eyes(33, 7, 2.8) + c(25, 33, 1, "#fff") + c(39, 33, 1, "#fff")],
    ["pirate", "#d6ecf7", c(32, 39, 17, "#f2c9a0") + '<path d="M9 29q4-20 23-20t23 20z" fill="#222"/>' + c(32, 21, 3.2, "#fff") + line("M14 33l24 5", "#222", 1.5) + c(39, 38, 5, "#222") +
      c(25, 38, 2.6, "#222") + line("M26 48q6 4 12 0", "#8a3b1a", 1.8) + c(15, 44, 2.2, "#f2c230")],
    ["wizard", "#e9e1fb", c(32, 43, 13, "#f2c9a0") + '<path d="M19 45q13 24 26 0z" fill="#fff"/>' + e(32, 31, 19, 4.5, "#4a2fa8") + p("32,2 18,30 46,30", "#5b3cc4") + c(32, 19, 2.6, "#ffd45e") + eyes(41, 5, 2.2)],
    ["sun", "#fff4c2", line("M32 5v6M32 53v6M5 32h6M53 32h6M13 13l4 4M47 47l4 4M51 13l-4 4M17 47l-4 4", "#ffb000", 2.6) + c(32, 32, 19, "#ffc933") + eyes(29, 6, 2.8) +
      line("M22 36q10 12 20 0", "#7a4b00", 2.4) + c(21, 36, 3, "#ff9d7a") + c(43, 36, 3, "#ff9d7a")],
    ["octopus", "#ffe1f0", e(17, 48, 5, 9, "#b06ad4") + e(26, 53, 4.5, 8, "#b06ad4") + e(38, 53, 4.5, 8, "#b06ad4") + e(47, 48, 5, 9, "#b06ad4") + c(32, 28, 18, "#b06ad4") +
      eyes(27, 7, 3.2) + c(25.6, 25.6, 1.1, "#fff") + c(39.6, 25.6, 1.1, "#fff") + line("M27 36q5 4 10 0", "#4b1f66", 1.8)]
  ];

  var BY = {};
  LIST.forEach(function (a) { BY[a[0]] = a; });

  window.AVATARS = {
    ids: LIST.map(function (a) { return a[0]; }),
    // the picture as an <svg> (a square; the page rounds it), or "" for an id it does not know
    html: function (id) {
      var a = BY[id];
      return a ? '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="' + a[1] + '"/>' + a[2] + "</svg>" : "";
    },
    // the same picture as an image address, for the settings list
    url: function (id) {
      var h = window.AVATARS.html(id);
      return h ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(h.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')) : "";
    }
  };
})();
