const TOTAL_PAGES = 8;
const PAGE_ASSET_VERSION = '20260930-hd';
const requestedPage = Number(new URLSearchParams(location.search).get('p'));
const state = {
  page: Number.isInteger(requestedPage) ? Math.max(1, Math.min(TOTAL_PAGES, requestedPage)) : 1,
  total: TOTAL_PAGES,
  zoom: 1,
  mobile: matchMedia('(max-width: 800px)').matches,
  renderVersion: 0,
  turnVersion: 0,
  animating: false
};

const $ = (id) => document.getElementById(id);
const els = {
  book: $('book'),
  wrap: $('bookWrap'),
  left: $('leftPage'),
  right: $('rightPage'),
  prev: $('prevButton'),
  next: $('nextButton'),
  current: $('currentPage'),
  total: $('totalPages'),
  progress: $('progressBar'),
  track: $('progressTrack'),
  loading: $('loading'),
  thumbs: $('thumbsPanel'),
  grid: $('thumbsGrid'),
  backdrop: $('panelBackdrop'),
  zoomLabel: $('zoomLabel'),
  toast: $('toast')
};

function pageSource(number) {
  return `pages/page-${number}.jpg?v=${PAGE_ASSET_VERSION}`;
}

function visiblePages(view) {
  if (view.mobile) return [view.page];
  if (view.page === 1) return [null, 1];
  const left = view.page % 2 === 0 ? view.page : view.page - 1;
  return [left, left + 1 <= state.total ? left + 1 : null];
}

function syncPageUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.set('p', state.page);
    history.replaceState(null, '', url);
  } catch (error) {
    console.warn('Não foi possível atualizar a página na URL:', error);
  }
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

async function waitForImage(image) {
  if (!image.complete || !image.naturalWidth) {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };
      const onLoad = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error(`Imagem não encontrada: ${image.src}`)); };
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
    });
  }
  if (image.decode) await image.decode();
}

const pageImages = new Map();
function preparePage(number) {
  if (!number) return Promise.resolve();
  if (!pageImages.has(number)) {
    const image = new Image();
    image.src = pageSource(number);
    pageImages.set(number, waitForImage(image).then(() => image).catch((error) => {
      pageImages.delete(number);
      throw error;
    }));
  }
  return pageImages.get(number);
}

async function renderInto(pageNumber, slot, view) {
  const prepared = await preparePage(pageNumber);
  if (view.version !== state.renderVersion) return;
  if (!pageNumber) {
    slot.style.visibility = 'hidden';
    slot.style.width = '0px';
    slot.style.height = '0px';
    slot.setAttribute('aria-hidden', 'true');
    return;
  }

  slot.style.visibility = 'visible';
  slot.removeAttribute('aria-hidden');
  const image = slot.querySelector('img');
  const source = pageSource(pageNumber);
  if (!image.src.endsWith(source)) image.src = source;
  image.alt = `Página ${pageNumber} da revista`;
  const availableHeight = Math.max(220, els.wrap.clientHeight - 4) * view.zoom;
  const availableWidth = (view.mobile ? els.wrap.clientWidth : els.wrap.clientWidth / 2) * view.zoom;
  const scale = Math.min(availableHeight / prepared.naturalHeight, availableWidth / prepared.naturalWidth);
  const width = Math.round(prepared.naturalWidth * scale);
  const height = Math.round(prepared.naturalHeight * scale);
  slot.style.width = `${width}px`;
  slot.style.height = `${height}px`;
  slot.querySelector('.page-number').textContent = String(pageNumber).padStart(2, '0');
  slot.classList.add('ready');
}

function normalizeDesktopSpread(pages, view) {
  if (view.mobile) return;
  const missingSlot = pages[0] ? (pages[1] ? null : els.right) : els.left;
  const visibleSlot = pages[0] ? els.left : els.right;
  if (!missingSlot) return;
  missingSlot.style.width = `${visibleSlot.clientWidth}px`;
  missingSlot.style.height = `${visibleSlot.clientHeight}px`;
}

async function renderSpread(direction = '') {
  const version = ++state.renderVersion;
  const view = { page: state.page, mobile: state.mobile, zoom: state.zoom, version };
  const pages = visiblePages(view);

  if (direction) {
    els.book.classList.remove('turning-next', 'turning-prev');
    void els.book.offsetWidth;
    els.book.classList.add(`turning-${direction}`);
  }

  try {
    await Promise.all(pages.map(preparePage));
    if (version !== state.renderVersion) return;
    if (view.mobile) await renderInto(pages[0], els.right, view);
    else await Promise.all([
      renderInto(pages[0], els.left, view),
      renderInto(pages[1], els.right, view)
    ]);
    normalizeDesktopSpread(pages, view);
  } catch (error) {
    if (version === state.renderVersion) {
      els.loading.hidden = false;
      els.loading.innerHTML = '<p>Não foi possível carregar as páginas da revista.</p>';
    }
    console.error(error);
    return;
  }

  if (version !== state.renderVersion) return;
  els.book.classList.toggle('single-cover', !view.mobile && pages.filter(Boolean).length === 1);
  els.current.textContent = String(view.page).padStart(2, '0');
  els.progress.style.width = `${((view.page - 1) / Math.max(1, state.total - 1)) * 100}%`;
  els.track.setAttribute('aria-valuenow', view.page);
  els.track.setAttribute('aria-valuetext', `Página ${view.page} de ${state.total}`);
  els.prev.disabled = view.page <= 1;
  els.next.disabled = view.page >= state.total;
  document.querySelectorAll('.thumb').forEach((thumb, index) => {
    thumb.classList.toggle('active', index + 1 === view.page);
  });
  els.loading.hidden = true;
  syncPageUrl();
  setTimeout(() => els.book.classList.remove('turning-next', 'turning-prev'), 460);

  for (const delta of [-1, 1]) {
    let page = view.page + delta * (view.mobile ? 1 : 2);
    if (!view.mobile && view.page === 1 && delta > 0) page = 2;
    if (page < 1 || page > state.total) continue;
    visiblePages({ page, mobile: view.mobile }).filter(Boolean).forEach((number) => {
      preparePage(number).catch(() => {});
    });
  }
}

let activeLeaf = null;
let hiddenTurnSlot = null;

function cancelPageTurn() {
  state.turnVersion += 1;
  state.renderVersion += 1;
  state.animating = false;
  activeLeaf?.remove();
  if (hiddenTurnSlot) hiddenTurnSlot.style.visibility = 'visible';
  activeLeaf = null;
  hiddenTurnSlot = null;
}

function createTurnLeaf(pageNumber, classes) {
  const leaf = document.createElement('div');
  const face = document.createElement('div');
  const image = new Image();
  leaf.className = `flip-leaf ${classes}`;
  face.className = 'flip-face';
  image.src = pageSource(pageNumber);
  image.alt = '';
  face.append(image);
  leaf.append(face);
  return { leaf, image };
}

function positionTurnLeaf(leaf, slot) {
  leaf.style.left = `${slot.offsetLeft}px`;
  leaf.style.width = `${slot.clientWidth}px`;
  leaf.style.height = `${slot.clientHeight}px`;
}

async function animatePageTurn(targetPage, direction) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || state.zoom > 1) {
    state.page = targetPage;
    await renderSpread();
    return;
  }

  state.animating = true;
  const turnVersion = ++state.turnVersion;
  const currentPages = visiblePages({ page: state.page, mobile: state.mobile });
  const targetPages = visiblePages({ page: targetPage, mobile: state.mobile });
  const currentNumber = direction === 'next'
    ? (currentPages[1] || currentPages[0])
    : (currentPages[0] || currentPages[1]);
  const incomingNumber = direction === 'next'
    ? (targetPages[0] || targetPages[1])
    : (targetPages[1] || targetPages[0]);
  const sourceSlot = state.mobile
    ? els.right
    : direction === 'next'
      ? (currentPages[1] ? els.right : els.left)
      : (currentPages[0] ? els.left : els.right);

  const outgoing = createTurnLeaf(currentNumber, `turn-out ${direction}`);
  const incoming = createTurnLeaf(incomingNumber, `turn-in ${direction}`);

  try {
    await Promise.all([
      ...targetPages.map(preparePage),
      waitForImage(outgoing.image),
      waitForImage(incoming.image)
    ]);
  } catch (error) {
    if (turnVersion !== state.turnVersion) return;
    cancelPageTurn();
    state.page = targetPage;
    await renderSpread();
    return;
  }

  if (turnVersion !== state.turnVersion) return;

  positionTurnLeaf(outgoing.leaf, sourceSlot);
  els.book.append(outgoing.leaf);
  activeLeaf = outgoing.leaf;
  sourceSlot.style.visibility = 'hidden';
  hiddenTurnSlot = sourceSlot;

  await Promise.all(outgoing.leaf.getAnimations().map((animation) => animation.finished.catch(() => {})));
  if (turnVersion !== state.turnVersion) return;
  state.page = targetPage;
  await renderSpread();
  if (turnVersion !== state.turnVersion) return;
  outgoing.leaf.remove();
  hiddenTurnSlot = null;
  const destinationSlot = state.mobile
    ? els.right
    : direction === 'next'
      ? (targetPages[0] ? els.left : els.right)
      : (targetPages[1] ? els.right : els.left);
  destinationSlot.style.visibility = 'hidden';
  hiddenTurnSlot = destinationSlot;
  positionTurnLeaf(incoming.leaf, destinationSlot);
  els.book.append(incoming.leaf);
  activeLeaf = incoming.leaf;
  await Promise.all(incoming.leaf.getAnimations().map((animation) => animation.finished.catch(() => {})));
  if (turnVersion !== state.turnVersion) return;
  destinationSlot.style.visibility = 'visible';
  hiddenTurnSlot = null;
  incoming.leaf.remove();
  activeLeaf = null;
  state.animating = false;
}

function go(delta) {
  if (state.animating) return;
  const step = state.mobile ? 1 : 2;
  let next = delta > 0 ? state.page + step : state.page - step;
  if (state.page === 1 && delta > 0 && !state.mobile) next = 2;
  next = Math.max(1, Math.min(state.total, next));
  if (next === state.page) return;
  animatePageTurn(next, delta > 0 ? 'next' : 'prev');
}

function buildThumbnails() {
  const fragment = document.createDocumentFragment();
  for (let number = 1; number <= state.total; number += 1) {
    const button = document.createElement('button');
    const image = document.createElement('img');
    const label = document.createElement('span');
    button.className = 'thumb';
    button.dataset.page = number;
    image.src = `pages/thumbs/page-${number}.jpg?v=${PAGE_ASSET_VERSION}`;
    image.alt = `Miniatura da página ${number}`;
    image.loading = 'lazy';
    image.draggable = false;
    label.textContent = `PÁGINA ${String(number).padStart(2, '0')}`;
    button.append(image, label);
    button.addEventListener('click', () => {
      cancelPageTurn();
      state.page = number;
      closeThumbs();
      renderSpread();
    });
    fragment.append(button);
  }
  els.grid.append(fragment);
}

function openThumbs() {
  els.thumbs.inert = false;
  els.thumbs.classList.add('open');
  els.backdrop.classList.add('show');
  els.thumbs.setAttribute('aria-hidden', 'false');
  $('closeThumbs').focus();
}

function closeThumbs() {
  els.thumbs.classList.remove('open');
  els.backdrop.classList.remove('show');
  els.thumbs.setAttribute('aria-hidden', 'true');
  els.thumbs.inert = true;
  $('thumbsButton').focus();
}

$('thumbsButton').addEventListener('click', openThumbs);
$('closeThumbs').addEventListener('click', closeThumbs);
els.backdrop.addEventListener('click', closeThumbs);
els.prev.addEventListener('click', () => go(-1));
els.next.addEventListener('click', () => go(1));
$('fullscreenButton').addEventListener('click', async () => {
  try {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    console.warn('Tela cheia indisponível:', error);
  }
});
$('shareButton').addEventListener('click', async () => {
  const shareData = {
    title: document.title,
    text: 'Confira o convite interativo do Summit Diretora.',
    url: location.href
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(location.href);
    showToast('Link copiado para compartilhar');
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Não foi possível copiar o link');
  }
});
let zoomTimer;
let zoomRequestVersion = 0;

function requestZoom(nextZoom, pointer) {
  cancelPageTurn();
  const bounds = els.wrap.getBoundingClientRect();
  const focusX = pointer?.x ?? bounds.width / 2;
  const focusY = pointer?.y ?? bounds.height / 2;
  const contentRatioX = (els.wrap.scrollLeft + focusX) / Math.max(1, els.wrap.scrollWidth);
  const contentRatioY = (els.wrap.scrollTop + focusY) / Math.max(1, els.wrap.scrollHeight);
  const clampedZoom = Math.round(Math.max(0.7, Math.min(2.5, nextZoom)) * 100) / 100;
  if (clampedZoom === state.zoom) return;

  state.zoom = clampedZoom;
  document.body.classList.toggle('zoomed', state.zoom > 1.001);
  els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  const requestVersion = ++zoomRequestVersion;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(async () => {
    await renderSpread();
    if (requestVersion !== zoomRequestVersion) return;
    if (state.zoom <= 1.001) {
      els.wrap.scrollLeft = 0;
      els.wrap.scrollTop = 0;
      return;
    }
    els.wrap.scrollLeft = contentRatioX * els.wrap.scrollWidth - focusX;
    els.wrap.scrollTop = contentRatioY * els.wrap.scrollHeight - focusY;
  }, 35);
}

$('zoomIn').addEventListener('click', () => requestZoom(state.zoom + 0.1));
$('zoomOut').addEventListener('click', () => requestZoom(state.zoom - 0.1));

let wheelDelta = 0;
let wheelFrame = 0;
let wheelPointer = null;
els.wrap.addEventListener('wheel', (event) => {
  event.preventDefault();
  const bounds = els.wrap.getBoundingClientRect();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
  wheelDelta += event.deltaY * unit;
  wheelPointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  if (wheelFrame) return;
  wheelFrame = requestAnimationFrame(() => {
    const rawChange = -wheelDelta * 0.0015;
    const change = Math.sign(rawChange) * Math.max(0.05, Math.min(0.2, Math.abs(rawChange)));
    wheelDelta = 0;
    wheelFrame = 0;
    requestZoom(state.zoom + change, wheelPointer);
  });
}, { passive: false });
els.track.addEventListener('click', (event) => {
  cancelPageTurn();
  const bounds = els.track.getBoundingClientRect();
  state.page = Math.round(((event.clientX - bounds.left) / bounds.width) * (state.total - 1)) + 1;
  renderSpread();
});
els.track.addEventListener('keydown', (event) => {
  let page = state.page;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') page += 1;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') page -= 1;
  else if (event.key === 'Home') page = 1;
  else if (event.key === 'End') page = state.total;
  else return;
  event.preventDefault();
  event.stopPropagation();
  cancelPageTurn();
  state.page = Math.max(1, Math.min(state.total, page));
  renderSpread();
});
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  cancelPageTurn();
  state.page = 1;
  renderSpread('prev');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === 'PageDown') go(1);
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(-1);
  if (event.key.toLowerCase() === 'm') openThumbs();
  if (event.key.toLowerCase() === 'f') $('fullscreenButton').click();
  if (event.key === 'Escape' && els.thumbs.classList.contains('open')) closeThumbs();
});

let touchX = 0;
let suppressBookClick = false;
let dragState = null;

els.wrap.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || state.zoom <= 1.001) return;
  dragState = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    left: els.wrap.scrollLeft,
    top: els.wrap.scrollTop
  };
  els.wrap.setPointerCapture(event.pointerId);
  els.wrap.classList.add('dragging');
  event.preventDefault();
});

els.wrap.addEventListener('pointermove', (event) => {
  if (!dragState || dragState.id !== event.pointerId) return;
  const deltaX = event.clientX - dragState.x;
  const deltaY = event.clientY - dragState.y;
  if (Math.hypot(deltaX, deltaY) > 3) suppressBookClick = true;
  els.wrap.scrollLeft = dragState.left - deltaX;
  els.wrap.scrollTop = dragState.top - deltaY;
});

function stopDragging(event) {
  if (!dragState || dragState.id !== event.pointerId) return;
  if (els.wrap.hasPointerCapture(event.pointerId)) els.wrap.releasePointerCapture(event.pointerId);
  els.wrap.classList.remove('dragging');
  dragState = null;
}

els.wrap.addEventListener('pointerup', stopDragging);
els.wrap.addEventListener('pointercancel', stopDragging);

els.book.addEventListener('touchstart', (event) => {
  touchX = event.touches[0].clientX;
  suppressBookClick = false;
}, { passive: true });
els.book.addEventListener('touchend', (event) => {
  const distance = event.changedTouches[0].clientX - touchX;
  if (Math.abs(distance) > 45) {
    suppressBookClick = true;
    go(distance < 0 ? 1 : -1);
  }
}, { passive: true });

els.book.addEventListener('click', (event) => {
  if (suppressBookClick) {
    suppressBookClick = false;
    return;
  }
  if (state.zoom > 1 || event.detail === 0) return;
  const bounds = els.book.getBoundingClientRect();
  const direction = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
  if ((direction < 0 && state.page > 1) || (direction > 0 && state.page < state.total)) go(direction);
});

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    cancelPageTurn();
    state.mobile = matchMedia('(max-width: 800px)').matches;
    renderSpread();
  }, 180);
});

els.total.textContent = String(state.total).padStart(2, '0');
els.track.setAttribute('aria-valuemax', state.total);
buildThumbnails();
renderSpread();
