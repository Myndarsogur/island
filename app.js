const fieldSection = document.querySelector(".field");
const fieldStage = document.querySelector("[data-field]");
const nodesContainer = document.querySelector("[data-nodes]");
const linesSvg = document.querySelector(".field__lines");
const aura = document.querySelector(".field__aura");
const panel = document.querySelector("[data-panel]");
const panelClose = document.querySelector("[data-panel-close]");
const panelTitle = document.querySelector("[data-panel-title]");
const panelDescription = document.querySelector("[data-panel-description]");
const panelStripe = document.querySelector("[data-panel-stripe]");
const panelPartners = document.querySelector("[data-panel-partners]");

const nodeMap = new Map();
const lineElements = [];
let activeId = null;
let hoveredId = null;
let lastFocusedNode = null;
const mobileSheetQuery = window.matchMedia("(max-width: 700px)");

const gridConfig = {
  columns: 12,
  rows: 12,
  colSpan: 2
};

// Hand-tuned connections for the network lines.
const adjacency = {
  azores: ["canary", "madeira", "bermuda"],
  canary: ["azores", "madeira", "cabo-verde"],
  orkney: ["shetland", "west-ireland", "faroe"],
  shetland: ["orkney", "west-ireland", "falklands", "iceland", "faroe"],
  iceland: ["faroe", "shetland", "west-ireland"],
  faroe: ["iceland", "shetland", "orkney"],
  "west-ireland": ["orkney", "achill", "azores", "iceland"],
  achill: ["west-ireland", "madeira", "bermuda"],
  madeira: ["canary", "azores", "cabo-verde", "sao-tome"],
  "cabo-verde": ["madeira", "mindelo", "sao-tome"],
  mindelo: ["cabo-verde", "sao-tome", "bermuda"],
  "sao-tome": ["cabo-verde", "mindelo", "falklands"],
  bermuda: ["azores", "achill", "mindelo"],
  falklands: ["shetland", "sao-tome"]
};

const positions = {
  iceland: { col: 7, row: 1, span: 2 },
  faroe: { col: 9, row: 3, span: 1 },
  shetland: { col: 10, row: 4, span: 1 },
  orkney: { col: 9, row: 5, span: 1 },
  "west-ireland": { col: 11, row: 6, span: 1 },
  achill: { col: 10, row: 7, span: 1 },
  bermuda: { col: 2, row: 8, span: 1 },
  azores: { col: 6, row: 9, span: 1 },
  madeira: { col: 7, row: 10, span: 1 },
  canary: { col: 8, row: 11, span: 1 },
  "cabo-verde": { col: 7, row: 12, span: 1 },
  mindelo: { col: 6, row: 12, span: 1 },
  "sao-tome": { col: 9, row: 13, span: 1 },
  falklands: { col: 8, row: 14, span: 2 }
};

const maxGridRow = Math.max(
  ...Object.values(positions).map((pos) => pos.row + (pos.span ? pos.span - 1 : 0))
);

const syncFieldScale = () => {
  const baseWidth = 1200;
  const minScale = 0.7;
  const maxScale = 1;
  const width = fieldStage.getBoundingClientRect().width || baseWidth;
  const clamped = Math.min(maxScale, Math.max(minScale, width / baseWidth));
  fieldStage.style.setProperty("--field-scale", clamped.toFixed(3));
};

const mobilePlacements = (() => {
  const ordered = Object.entries(positions).sort((a, b) => {
    if (a[1].row === b[1].row) {
      return a[1].col - b[1].col;
    }
    return a[1].row - b[1].row;
  });
  const placementMap = new Map();
  let col = 1;
  let row = 1;
  ordered.forEach(([id]) => {
    placementMap.set(id, { col, row });
    col += 1;
    if (col > 3) {
      col = 1;
      row += 1;
    }
  });
  return placementMap;
})();

const mediaReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const syncPanelAria = () => {
  const shouldHide = !panel.classList.contains("is-open") && mobileSheetQuery.matches;
  panel.setAttribute("aria-hidden", shouldHide ? "true" : "false");
};

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const shapeFromId = (id) => {
  const seed = hashString(id);
  const r1 = 14 + (seed % 12);
  const r2 = 18 + ((seed >> 2) % 12);
  const r3 = 16 + ((seed >> 4) % 12);
  const r4 = 20 + ((seed >> 6) % 12);
  const angle = 20 + (seed % 140);
  const texture = 0.12 + ((seed % 7) / 40);
  return { r1, r2, r3, r4, angle, texture };
};

const placeOnGrid = (pos, occupied) => {
  const maxColStart = gridConfig.columns - gridConfig.colSpan + 1;
  const baseCol = Math.min(
    maxColStart,
    Math.max(1, Math.round((pos.x / 100) * (maxColStart - 1)) + 1)
  );
  const baseRow = Math.min(
    gridConfig.rows,
    Math.max(1, Math.round((pos.y / 100) * (gridConfig.rows - 1)) + 1)
  );

  for (let row = baseRow; row <= gridConfig.rows; row += 1) {
    for (let col = baseCol; col <= maxColStart; col += 1) {
      const key = `${row}:${col}`;
      if (!occupied.has(key)) {
        occupied.add(key);
        return { col, row };
      }
    }
  }

  const fallbackKey = `${baseRow}:${baseCol}`;
  occupied.add(fallbackKey);
  return { col: baseCol, row: baseRow };
};

const createNode = (island, index, total, occupied) => {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "island-node";
  node.dataset.id = island.id;
  node.style.setProperty("--color-a", island.colorA);
  node.style.setProperty("--color-b", island.colorB);

  const shape = shapeFromId(island.id);
  node.style.setProperty("--r1", `${shape.r1}px`);
  node.style.setProperty("--r2", `${shape.r2}px`);
  node.style.setProperty("--r3", `${shape.r3}px`);
  node.style.setProperty("--r4", `${shape.r4}px`);
  node.style.setProperty("--texture-angle", `${shape.angle}deg`);
  node.style.setProperty("--texture-opacity", shape.texture.toFixed(2));

  const pos = positions[island.id];
  if (pos) {
    const span = pos.span || gridConfig.colSpan;
    const normalizedX = pos.x ?? ((pos.col - 0.5) / gridConfig.columns) * 100;
    const normalizedY = pos.y ?? ((pos.row - 0.5) / maxGridRow) * 100;
    const floatX = ((normalizedX - 50) / 50) * 0.6;
    const floatY = ((normalizedY - 50) / 50) * 0.5;

    node.style.setProperty("--grid-col", pos.col);
    node.style.setProperty("--grid-row", pos.row);
    node.style.setProperty("--grid-span", span);
    node.style.setProperty("--float-x", `${floatX.toFixed(2)}rem`);
    node.style.setProperty("--float-y", `${floatY.toFixed(2)}rem`);

    const mobilePos = mobilePlacements.get(island.id);
    if (mobilePos) {
      node.style.setProperty("--grid-col-mobile", mobilePos.col);
      node.style.setProperty("--grid-row-mobile", mobilePos.row);
      node.style.setProperty("--grid-span-mobile", 1);
    }
  }

  node.setAttribute("aria-expanded", "false");
  node.setAttribute("aria-controls", "island-panel");
  node.setAttribute("aria-label", island.name);

  node.innerHTML = `
    <img class="node__island" src="assets/islands/${island.id}.svg" alt="" aria-hidden="true" />
    <span class="node__text">
      <span class="node__name">${island.name}</span>
      <span class="node__tag">${island.regionTagline}</span>
    </span>
  `;

  node.addEventListener("mouseenter", () => setHover(island.id));
  node.addEventListener("mouseleave", () => setHover(null));
  node.addEventListener("focus", () => setHover(island.id));
  node.addEventListener("blur", () => setHover(null));
  node.addEventListener("mousemove", (event) => updateParallax(node, event));
  node.addEventListener("mouseleave", () => resetParallax(node));
  node.addEventListener("click", () => toggleActive(island.id));

  node.style.setProperty("--reveal-delay", `${index * (320 / total)}ms`);

  return node;
};

const updateParallax = (node, event) => {
  const rect = node.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  const offsetX = Math.max(-2, Math.min(2, x * 2));
  const offsetY = Math.max(-2, Math.min(2, y * 2));
  node.style.setProperty("--parallax-x", `${offsetX}px`);
  node.style.setProperty("--parallax-y", `${offsetY}px`);
};

const resetParallax = (node) => {
  node.style.setProperty("--parallax-x", "0px");
  node.style.setProperty("--parallax-y", "0px");
};

const buildLines = () => {
  linesSvg.innerHTML = "";
  lineElements.length = 0;
  const added = new Set();

  Object.entries(adjacency).forEach(([from, targets]) => {
    targets.forEach((to) => {
      const pairKey = [from, to].sort().join("--");
      if (added.has(pairKey)) {
        return;
      }
      added.add(pairKey);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.dataset.from = from;
      line.dataset.to = to;
      linesSvg.appendChild(line);
      lineElements.push(line);
    });
  });
};

// Compute line endpoints from node centers inside the stage.
const updateLines = () => {
  const stageRect = fieldStage.getBoundingClientRect();
  linesSvg.setAttribute("viewBox", `0 0 ${stageRect.width} ${stageRect.height}`);

  lineElements.forEach((line) => {
    const fromNode = nodeMap.get(line.dataset.from);
    const toNode = nodeMap.get(line.dataset.to);
    if (!fromNode || !toNode) {
      return;
    }

    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();

    const x1 = fromRect.left - stageRect.left + fromRect.width / 2;
    const y1 = fromRect.top - stageRect.top + fromRect.height / 2;
    const x2 = toRect.left - stageRect.left + toRect.width / 2;
    const y2 = toRect.top - stageRect.top + toRect.height / 2;

    line.setAttribute("x1", x1.toFixed(1));
    line.setAttribute("y1", y1.toFixed(1));
    line.setAttribute("x2", x2.toFixed(1));
    line.setAttribute("y2", y2.toFixed(1));
  });
};

const setHover = (id) => {
  hoveredId = id;
  updateHighlightStates();
};

const toggleActive = (id) => {
  if (activeId === id) {
    closePanel();
    return;
  }
  setActive(id);
};

const setActive = (id) => {
  activeId = id;
  const node = nodeMap.get(id);
  if (node) {
    lastFocusedNode = node;
  }
  openPanel(id);
  updateHighlightStates();
  updateAura();
};

// Position the breathing aura behind the active node.
const updateAura = () => {
  if (!activeId) {
    aura.classList.remove("is-visible");
    return;
  }

  const node = nodeMap.get(activeId);
  if (!node) {
    return;
  }

  const rect = node.getBoundingClientRect();
  const stageRect = fieldStage.getBoundingClientRect();
  const x = rect.left - stageRect.left + rect.width / 2;
  const y = rect.top - stageRect.top + rect.height / 2;

  aura.style.left = `${x}px`;
  aura.style.top = `${y}px`;
  aura.style.background = node.style.getPropertyValue("--color-a");
  aura.classList.add("is-visible");
};

const updatePanelPosition = () => {
  if (!panel.classList.contains("is-open")) {
    return;
  }

  if (!mobileSheetQuery.matches) {
    panel.style.removeProperty("--panel-left");
    panel.style.removeProperty("--panel-top");
    panel.style.removeProperty("--panel-width");
    return;
  }

  const node = activeId ? nodeMap.get(activeId) : null;
  if (!node) {
    return;
  }

  const stageRect = fieldStage.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 12;
  const offset = 14;

  const maxWidth = Math.min(viewportWidth - padding * 2, 420);
  panel.style.setProperty("--panel-width", `${maxWidth}px`);

  const panelRect = panel.getBoundingClientRect();
  const measuredHeight = panelRect.height || viewportHeight * 0.6;
  const panelHeight = Math.min(measuredHeight, viewportHeight * 0.6);
  const anchorBelow = nodeRect.top + nodeRect.height / 2 < stageRect.top + stageRect.height / 2;

  let top = anchorBelow ? nodeRect.bottom + offset : nodeRect.top - offset - panelHeight;
  top = Math.max(padding, Math.min(top, viewportHeight - padding - panelHeight));

  const halfWidth = (panelRect.width || maxWidth) / 2;
  const minLeft = padding + halfWidth;
  const maxLeft = viewportWidth - padding - halfWidth;
  let left = nodeRect.left + nodeRect.width / 2;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  panel.style.setProperty("--panel-left", `${left}px`);
  panel.style.setProperty("--panel-top", `${top}px`);
};

const updateHighlightStates = () => {
  const anchorId = activeId || hoveredId;
  const related = new Set();
  if (anchorId && adjacency[anchorId]) {
    adjacency[anchorId].forEach((id) => related.add(id));
  }

  nodeMap.forEach((node, id) => {
    node.classList.toggle("is-active", id === activeId);
    node.classList.toggle("is-related", related.has(id));
    node.setAttribute("aria-expanded", id === activeId ? "true" : "false");
  });

  lineElements.forEach((line) => {
    const from = line.dataset.from;
    const to = line.dataset.to;
    const shouldHighlight = anchorId && (from === anchorId || to === anchorId);
    line.classList.toggle("is-highlight", shouldHighlight);
  });
};

const openPanel = (id) => {
  const payload = window.__islands?.find((item) => item.id === id);
  if (!payload) {
    return;
  }

  panelTitle.textContent = payload.name;
  panelDescription.textContent = payload.shortDescription;
  panelStripe.style.background = payload.colorA;
  panelStripe.style.backgroundImage = "none";

  panelPartners.innerHTML = "";
  payload.partners.forEach((partner) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="partner__logo" aria-hidden="true"></span>
      <a href="${partner.url}">${partner.name}</a>
    `;
    panelPartners.appendChild(li);
  });

  panel.classList.add("is-open");
  document.body.classList.add("panel-open");
  syncPanelAria();
  requestAnimationFrame(updatePanelPosition);
  requestAnimationFrame(() => {
    panelClose.focus({ preventScroll: true });
  });
};

const closePanel = () => {
  activeId = null;
  panel.classList.remove("is-open");
  document.body.classList.remove("panel-open");
  aura.classList.remove("is-visible");
  updateHighlightStates();
  if (lastFocusedNode) {
    lastFocusedNode.focus();
  }
  syncPanelAria();
  panel.style.removeProperty("--panel-left");
  panel.style.removeProperty("--panel-top");
  panel.style.removeProperty("--panel-width");
};

const onResize = () => {
  syncFieldScale();
  updateLines();
  updateAura();
  updatePanelPosition();
  syncPanelAria();
};

// Subtle parallax for the currents effect.
const setupFieldDrift = () => {
  if (mediaReduceMotion.matches) {
    return;
  }

  fieldStage.addEventListener("mousemove", (event) => {
    const rect = fieldStage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    const driftX = x * 12;
    const driftY = y * 10;
    fieldStage.style.setProperty("--drift-x", `${driftX}px`);
    fieldStage.style.setProperty("--drift-y", `${driftY}px`);
    fieldStage.style.setProperty("--line-drift-x", `${driftX * 0.6}px`);
    fieldStage.style.setProperty("--line-drift-y", `${driftY * 0.6}px`);
  });

  fieldStage.addEventListener("mouseleave", () => {
    fieldStage.style.setProperty("--drift-x", "0px");
    fieldStage.style.setProperty("--drift-y", "0px");
    fieldStage.style.setProperty("--line-drift-x", "0px");
    fieldStage.style.setProperty("--line-drift-y", "0px");
  });
};

const renderNodes = (islands) => {
  nodesContainer.innerHTML = "";
  nodeMap.clear();
  const occupied = new Set();

  islands.forEach((island, index) => {
    const node = createNode(island, index, islands.length, occupied);
    nodesContainer.appendChild(node);
    nodeMap.set(island.id, node);
  });
};

const init = (islands) => {
  window.__islands = islands;
  renderNodes(islands);
  buildLines();
  syncFieldScale();

  requestAnimationFrame(() => {
    fieldSection.classList.add("is-ready");
    updateLines();
    syncPanelAria();
  });

  window.addEventListener("resize", onResize);
  setupFieldDrift();
};

panelClose.addEventListener("click", closePanel);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && panel.classList.contains("is-open")) {
    closePanel();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!mobileSheetQuery.matches) {
    return;
  }
  if (!panel.classList.contains("is-open")) {
    return;
  }
  if (panel.contains(event.target)) {
    return;
  }
  if (event.target.closest(".island-node")) {
    return;
  }
  closePanel();
});

fetch("data/islands.json")
  .then((response) => response.json())
  .then((data) => init(data))
  .catch(() => {
    panelTitle.textContent = "Data unavailable";
    panelDescription.textContent = "Unable to load the island network data.";
  });

window.addEventListener("load", () => {
  syncFieldScale();
  updateLines();
  updatePanelPosition();
});

mobileSheetQuery.addEventListener("change", () => {
  syncPanelAria();
  updatePanelPosition();
});

window.addEventListener(
  "scroll",
  () => {
    if (mobileSheetQuery.matches && panel.classList.contains("is-open")) {
      updatePanelPosition();
    }
  },
  { passive: true }
);
