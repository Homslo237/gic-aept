/*
  ADMIN-TABS.JS — Console Admin en onglets (mobile first)
  Range les rubriques existantes de admin.html en 5 pages avec une barre d'onglets en bas.
  Ne modifie aucune logique : les identifiants, boutons et chargements restent identiques.
  Si la structure de la page n'est pas celle attendue, le fichier ne fait rien.
*/
(function () {
  var TABS = [
    { id: "accueil",    ico: "🏠", txt: "Accueil",  g: [0] },
    { id: "sdes",       ico: "🏢", txt: "SDEs",     g: [1] },
    { id: "tarifs",     ico: "💰", txt: "Tarifs",   g: [2] },
    { id: "parrainage", ico: "🤝", txt: "Parrains", g: [3, 4] },
    { id: "landing",    ico: "📈", txt: "Landing",  g: [5, 6, 7] }
  ];

  var CSS =
    ".hv-page{display:none}.hv-page.on{display:block}" +
    ".hv-nav{position:fixed;left:0;right:0;bottom:0;z-index:200;display:flex;background:var(--surface);" +
    "border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom,0px)}" +
    ".hv-nav button{flex:1;min-height:58px;background:none;border:0;border-top:3px solid transparent;color:var(--muted);" +
    "font:700 11px 'Manrope',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer}" +
    ".hv-nav button span{font-size:20px;line-height:1}" +
    ".hv-nav button.on{color:var(--hv-cyan);border-top-color:var(--hv-orange)}" +
    ".hv-nav button:focus-visible{outline:2px solid var(--hv-orange);outline-offset:-4px}" +
    "#dashboard .main{padding-bottom:96px}" +
    "#dashboard .footer{margin-bottom:64px}" +
    ".toast{bottom:84px}" +
    "@media (min-width:900px){.hv-nav{max-width:560px;left:50%;right:auto;transform:translateX(-50%);border:1px solid var(--border);border-radius:16px 16px 0 0}}";

  function init() {
    var dash = document.getElementById("dashboard");
    var main = dash && dash.querySelector(".main");
    if (!main || main.getAttribute("data-tabs")) return;

    // Regroupe chaque titre de rubrique avec les blocs qui le suivent
    var groups = [];
    Array.prototype.slice.call(main.children).forEach(function (el) {
      if (el.classList.contains("section-label")) groups.push([el]);
      else if (groups.length) groups[groups.length - 1].push(el);
    });
    if (groups.length !== 8) return; // structure inattendue : on ne touche à rien
    main.setAttribute("data-tabs", "1");

    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    var pages = {};
    TABS.forEach(function (t) {
      var p = document.createElement("section");
      p.className = "hv-page";
      p.id = "hv-" + t.id;
      t.g.forEach(function (gi, n) {
        groups[gi].forEach(function (el, k) {
          if (k === 0) el.style.marginTop = n === 0 ? "0" : "32px";
          p.appendChild(el);
        });
      });
      main.appendChild(p);
      pages[t.id] = p;
    });

    var nav = document.createElement("nav");
    nav.className = "hv-nav";
    nav.setAttribute("aria-label", "Rubriques de la console");
    var buttons = {};
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<span aria-hidden=\"true\">" + t.ico + "</span>" + t.txt;
      b.addEventListener("click", function () { show(t.id, true); });
      nav.appendChild(b);
      buttons[t.id] = b;
    });
    dash.appendChild(nav);

    function show(id, scroll) {
      if (!pages[id]) id = "accueil";
      TABS.forEach(function (t) {
        pages[t.id].classList.toggle("on", t.id === id);
        buttons[t.id].classList.toggle("on", t.id === id);
        if (t.id === id) buttons[t.id].setAttribute("aria-current", "page");
        else buttons[t.id].removeAttribute("aria-current");
      });
      try { history.replaceState(null, "", "#" + id); } catch (e) {}
      if (scroll) window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", function () { show(location.hash.slice(1), false); });
    show(location.hash.slice(1), false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
