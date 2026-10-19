/* 同一个搜索控件在原位置与顶栏之间切换；不搬动 DOM，保留焦点、选区和输入法状态。 */
"use strict";

let searchDock = null;
function bindSearchDock() {
  const header = document.querySelector(".topbar"), slot = document.getElementById("topbarSearchSlot");
  const anchor = document.getElementById("qSearchAnchor"), main = document.getElementById("qSearchMain");
  const input = document.getElementById("qInput"), page = document.querySelector("main.page");
  const open = document.getElementById("qDockOpen"), close = document.getElementById("qDockClose");
  if (!header || !slot || !anchor || !main || !input || !page) return;
  open.innerHTML = ic("search", 18); close.innerHTML = ic("x", 17);
  let docked = false, expanded = false, frame = 0;
  const narrow = () => window.matchMedia("(max-width:900px)").matches;
  const setStyle = (name, value) => { if (main.style.getPropertyValue(name) !== value) main.style.setProperty(name, value); };
  function update() {
    const head = header.getBoundingClientRect();
    const next = !state.detailPage && anchor.getBoundingClientRect().top <= head.bottom;
    if (next !== docked) {
      if (next) {
        anchor.style.height = main.getBoundingClientRect().height + "px";
        closeQueryOptions();
        if (narrow() && main.contains(document.activeElement)) expanded = true;
      } else {
        anchor.style.height = "";
        page.style.minHeight = "";
        expanded = false;
      }
      docked = next;
      main.classList.toggle("is-docked", docked);
      header.classList.toggle("search-docked", docked);
    }
    const mobileExpanded = docked && narrow() && expanded;
    header.classList.toggle("search-expanded", mobileExpanded);
    main.classList.toggle("is-expanded", mobileExpanded);
    open.setAttribute("aria-expanded", String(mobileExpanded));
    // 展开时背景顶栏按钮退出键盘导航，收起后恢复。
    header.querySelector(".brand").inert = mobileExpanded;
    header.querySelector(".topbar-right").inert = mobileExpanded;
    if (!docked) return;
    const area = slot.getBoundingClientRect();
    setStyle("--dock-top", (head.top + (head.height - 40) / 2) + "px");
    setStyle("--dock-left", (narrow() ? 12 : area.left) + "px");
    setStyle("--dock-width", (narrow() ? Math.max(0, head.width - 64) : area.width) + "px");
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  }
  function focus() {
    update();
    if (docked && narrow()) { expanded = true; update(); }
    input.focus({ preventScroll: true });
  }
  open.addEventListener("click", focus);
  close.addEventListener("click", () => { expanded = false; update(); open.focus({ preventScroll: true }); });
  main.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !input.value && docked && narrow()) {
      e.preventDefault(); expanded = false; update(); open.focus({ preventScroll: true });
    }
  });
  // 移动端点击结果区收起输入框，点击搜索范围或搜索按钮时保持展开。
  document.addEventListener("pointerdown", (e) => {
    if (expanded && !main.contains(e.target) && !slot.contains(e.target)) { expanded = false; update(); }
  });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", schedule, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(schedule);
    observer.observe(header); observer.observe(anchor); observer.observe(document.getElementById("querySec"));
  }
  searchDock = {
    update: schedule, focus,
    beforeSearch() {
      update();
      if (!docked) return null;
      const y = window.scrollY;
      const pageTop = page.getBoundingClientRect().top + y;
      // 少量命中或无结果时，文档高度仍能容纳当前视口，防止浏览器把页面拉回顶部。
      page.style.minHeight = Math.max(parseFloat(page.style.minHeight) || 0, y + window.innerHeight - pageTop) + "px";
      return y;
    },
    afterSearch(y) {
      if (y !== null) {
        const wrap = document.getElementById("mainTableWrap") || document.querySelector(".results-card-viewport");
        if (wrap) wrap.scrollTop = 0;
        window.scrollTo({ top: y, behavior: "auto" });
      }
      update();
    },
  };
  update();
}
