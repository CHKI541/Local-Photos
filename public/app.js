// ============================================================
// app.js — Lógica principal de la aplicación: navegación, cuadrícula
// de fotos/videos (con virtualización), selección múltiple, álbumes,
// personas, lugares y configuración.
//
// lightbox.js, face-scanner.js y video-scanner.js se cargan después
// de este archivo y usan las funciones/variables expuestas en window
// al final de este archivo (ver sección "API expuesta a otros scripts").
// ============================================================

// --- Estado global ---
let allPhotos = [];               // último fetch de /api/photos para el timeline principal
let currentGridPhotos = [];       // fotos de la cuadrícula visible ahora mismo (para que el lightbox navegue)
let currentGridDensity = localStorage.getItem('gridDensity') || 'medium';
let selectedIds = new Set();
let selectionContext = 'normal';  // 'normal' | 'trash' | 'album'
let selectionAlbumId = null;
let currentAlbumId = null;
let currentPersonId = null;
let simpleGridContext = null;     // { type: 'favorites'|'videos'|'search', query? }
let activeGridContainerEl = null;
let placesMapInstance = null;

window.scanStatus = {
    scanning: false,
    faceScanning: false,
    faceScannedCount: 0,
    faceTotalCount: 0
};

const ROW_GAP = 4;
const DENSITY_HEIGHTS = { small: 110, medium: 180, large: 260 };

function getRowHeight() {
    return DENSITY_HEIGHTS[currentGridDensity] || 180;
}

// ============================== Utilidades de render ==============================

function renderEmptyState(icon, title, text) {
    return `
        <div class="empty-state">
            <i class="fa-solid ${icon}"></i>
            <h3>${escapeHtml(title || '')}</h3>
            ${text ? `<p>${escapeHtml(text)}</p>` : ''}
        </div>`;
}

function groupPhotosByDate(photos) {
    const groups = [];
    let currentLabel = null;
    let currentGroup = null;
    photos.forEach(photo => {
        const label = formatDateLong(photo.dateTaken);
        if (label !== currentLabel) {
            currentLabel = label;
            currentGroup = { label, year: new Date(photo.dateTaken).getFullYear(), photos: [] };
            groups.push(currentGroup);
        }
        currentGroup.photos.push(photo);
    });
    return groups;
}

// Estima cuántas filas ocupará un grupo de fotos en una cuadrícula "justified"
// (flex-wrap) de un ancho de contenedor dado, replicando el mismo algoritmo
// voraz de ajuste de línea que usa flexbox. Como la altura de fila es fija
// (solo el ancho de cada item se estira con flex-grow), el número de filas
// estimado se traduce en una altura EXACTA. Esto permite reservar el alto
// correcto de un grupo antes de "hidratarlo" con las miniaturas reales.
function estimateGroupHeight(photos, containerWidth) {
    const rowHeight = getRowHeight();
    if (!photos || photos.length === 0) return 0;
    let rows = 1;
    let currentRowWidth = 0;
    for (const p of photos) {
        const aspect = (p.width && p.height) ? (p.width / p.height) : 1.333;
        const itemWidth = rowHeight * aspect;
        if (currentRowWidth === 0) {
            currentRowWidth = itemWidth;
        } else if (currentRowWidth + ROW_GAP + itemWidth > containerWidth) {
            rows++;
            currentRowWidth = itemWidth;
        } else {
            currentRowWidth += ROW_GAP + itemWidth;
        }
    }
    return rows * rowHeight + Math.max(0, rows - 1) * ROW_GAP;
}

function computeDaysLeft(trashedAt, retentionDays) {
    if (!trashedAt) return '';
    const days = retentionDays || 30;
    const trashedTime = new Date(trashedAt).getTime();
    const expiresAt = trashedTime + days * 24 * 60 * 60 * 1000;
    const daysLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    return daysLeft <= 0 ? t('trash_days_left_today') : tn('trash_days_left', daysLeft);
}

// ============================== Construcción de un item de foto/video ==============================

function createPhotoItemElement(photo, options) {
    options = options || {};
    const div = document.createElement('div');
    div.className = 'photo-item';
    div.dataset.id = photo.id;
    if (photo.favorite) div.classList.add('is-favorite');
    if (photo.isVideo) div.classList.add('is-video');
    if (selectedIds.has(photo.id)) div.classList.add('selected');

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = photo.filename || '';
    img.src = `/api/thumbnail?id=${photo.id}`;
    img.addEventListener('error', () => {
        img.style.display = 'none';
        if (!div.querySelector('.video-no-thumb-icon')) {
            const icon = document.createElement('div');
            icon.className = 'video-no-thumb-icon';
            icon.innerHTML = `<i class="fa-regular ${photo.isVideo ? 'fa-circle-play' : 'fa-image'}"></i>`;
            div.appendChild(icon);
        }
    });
    div.appendChild(img);

    if (photo.isVideo) {
        const scrim = document.createElement('div');
        scrim.className = 'video-scrim';
        div.appendChild(scrim);
        const badge = document.createElement('div');
        badge.className = 'video-badge';
        badge.innerHTML = `<i class="fa-solid fa-play"></i><span>${photo.duration ? escapeHtml(formatDuration(photo.duration)) : ''}</span>`;
        div.appendChild(badge);
    }

    const favBadge = document.createElement('div');
    favBadge.className = 'favorite-badge';
    favBadge.innerHTML = '<i class="fa-solid fa-star"></i>';
    div.appendChild(favBadge);

    if (options.trashView) {
        const badge = document.createElement('div');
        badge.className = 'trash-days-badge';
        badge.textContent = computeDaysLeft(photo.trashedAt, options.trashRetentionDays);
        div.appendChild(badge);
    }

    const check = document.createElement('div');
    check.className = 'select-checkbox';
    check.innerHTML = '<i class="fa-solid fa-check"></i>';
    check.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelect(photo.id, div, options, e.shiftKey);
    });
    div.appendChild(check);

    div.addEventListener('click', (e) => {
        if (selectedIds.size > 0 || e.shiftKey) {
            toggleSelect(photo.id, div, options, e.shiftKey);
            return;
        }
        const list = options.photoListRef || currentGridPhotos;
        const idx = list.findIndex(p => p.id === photo.id);
        if (typeof window.openLightboxAt === 'function') {
            window.openLightboxAt(list, idx < 0 ? 0 : idx, options);
        }
    });

    return div;
}

// ============================== Motor de cuadrícula virtualizada ==============================

let groupObserver = null;

function getGroupObserver() {
    if (groupObserver) return groupObserver;
    const root = document.querySelector('.page-viewport');
    groupObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                hydrateGroup(entry.target);
            }
        });
    }, { root: root || null, rootMargin: '1200px 0px 1200px 0px' });
    return groupObserver;
}

function hydrateGroup(wrapper) {
    if (!wrapper || wrapper.dataset.hydrated === '1') return;
    wrapper.dataset.hydrated = '1';
    const placeholder = wrapper.querySelector('.timeline-group-placeholder');
    if (!placeholder) return;
    const grid = document.createElement('div');
    grid.className = 'photos-grid';
    const photos = wrapper._photos || [];
    const options = wrapper._options || {};
    photos.forEach(photo => grid.appendChild(createPhotoItemElement(photo, options)));
    placeholder.replaceWith(grid);
    getGroupObserver().unobserve(wrapper);
}

// Renderiza una cuadrícula de fotos, agrupada por fecha (o en un solo grupo si
// options.grouped === false). Usado por Timeline, Favoritos, Videos, Álbum,
// Persona, Búsqueda, Carpetas y Papelera: todas comparten el mismo motor de
// virtualización para que ninguna vista se vuelva lenta con bibliotecas grandes.
function renderGroupedGrid(container, photos, options) {
    options = options || {};
    clearSelection();
    activeGridContainerEl = container;
    currentGridPhotos = photos;

    // Antes de reconstruir, se desconecta el observer de virtualización. Si no, los
    // "wrappers" de grupos de la vista anterior seguían observados (y por lo tanto
    // retenidos en memoria) aun después de sacarlos del DOM: en sesiones largas con
    // mucha navegación era una fuga de memoria que se iba acumulando. Los nuevos
    // wrappers se vuelven a observar unas líneas más abajo.
    if (groupObserver) groupObserver.disconnect();

    container.innerHTML = '';
    container.dataset.density = currentGridDensity;

    if (!photos || photos.length === 0) {
        container.innerHTML = renderEmptyState(
            options.emptyIcon || 'fa-image',
            options.emptyTitle || t('empty_generic_title'),
            options.emptyText || ''
        );
        return;
    }

    const grouped = options.grouped !== false;
    const groups = grouped ? groupPhotosByDate(photos) : [{ label: null, year: null, photos }];
    const containerWidth = container.clientWidth || (container.parentElement && container.parentElement.clientWidth) || 1000;
    const observer = getGroupObserver();

    const wrappers = [];
    groups.forEach(group => {
        const wrapper = document.createElement('div');
        wrapper.className = 'timeline-group';
        wrapper.dataset.hydrated = '0';
        if (group.year) wrapper.dataset.year = group.year;
        if (group.photos[0]) wrapper.dataset.repDate = group.photos[0].dateTaken;
        wrapper._photos = group.photos;
        wrapper._options = options;

        if (group.label) {
            const header = document.createElement('h3');
            header.className = 'timeline-group-header';
            header.textContent = group.label;
            wrapper.appendChild(header);
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'timeline-group-placeholder';
        placeholder.style.height = estimateGroupHeight(group.photos, containerWidth) + 'px';
        wrapper.appendChild(placeholder);

        container.appendChild(wrapper);
        wrappers.push(wrapper);
    });

    // Los primeros grupos (el primer pantallazo) se hidratan de inmediato para que
    // aparezcan al instante; el resto se hidrata bajo demanda al acercarse al
    // viewport gracias al IntersectionObserver.
    wrappers.slice(0, 2).forEach(hydrateGroup);
    wrappers.slice(2).forEach(w => observer.observe(w));

    if (typeof options.afterRender === 'function') options.afterRender(wrappers);
}

// ============================== Selección múltiple ==============================

let lastSelectedPhotoId = null;

function toggleSelect(id, element, options, isShift) {
    options = options || {};
    const list = options.photoListRef || currentGridPhotos || [];

    if (isShift && lastSelectedPhotoId && lastSelectedPhotoId !== id && list.length > 0) {
        const idx1 = list.findIndex(p => p.id === lastSelectedPhotoId);
        const idx2 = list.findIndex(p => p.id === id);

        if (idx1 >= 0 && idx2 >= 0) {
            const start = Math.min(idx1, idx2);
            const end = Math.max(idx1, idx2);
            for (let i = start; i <= end; i++) {
                const pid = list[i].id;
                selectedIds.add(pid);
                const el = document.querySelector(`.photo-item[data-id="${pid}"]`);
                if (el) el.classList.add('selected');
            }
            lastSelectedPhotoId = id;
            updateSelectionBar(options);
            return;
        }
    }

    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        if (element) element.classList.remove('selected');
        if (lastSelectedPhotoId === id) lastSelectedPhotoId = null;
    } else {
        selectedIds.add(id);
        if (element) element.classList.add('selected');
        lastSelectedPhotoId = id;
    }
    updateSelectionBar(options);
}

function clearSelection() {
    lastSelectedPhotoId = null;
    if (selectedIds.size === 0) return;
    selectedIds.clear();
    document.querySelectorAll('.photo-item.selected').forEach(el => el.classList.remove('selected'));
    if (activeGridContainerEl) activeGridContainerEl.classList.remove('grid-selection-mode');
    document.getElementById('selectionActionBar').style.display = 'none';
    selectionContext = 'normal';
    selectionAlbumId = null;
}

function updateSelectionBar(options) {
    options = options || {};
    const bar = document.getElementById('selectionActionBar');
    if (selectedIds.size === 0) {
        clearSelection();
        return;
    }
    if (activeGridContainerEl) activeGridContainerEl.classList.add('grid-selection-mode');
    bar.style.display = 'flex';
    document.getElementById('selectionCountText').textContent = tn('selection_count', selectedIds.size);

    if (options.trashView) selectionContext = 'trash';
    else if (options.removeFromAlbumId) { selectionContext = 'album'; selectionAlbumId = options.removeFromAlbumId; }
    else selectionContext = 'normal';

    const isTrash = selectionContext === 'trash';
    const isAlbum = selectionContext === 'album';
    document.getElementById('btnSelFavorite').style.display = isTrash ? 'none' : 'flex';
    document.getElementById('btnSelAddAlbum').style.display = isTrash ? 'none' : 'flex';
    document.getElementById('btnSelDownload').style.display = isTrash ? 'none' : 'flex';
    document.getElementById('btnSelTrash').style.display = isTrash ? 'none' : 'flex';
    document.getElementById('btnSelRestore').style.display = isTrash ? 'flex' : 'none';
    document.getElementById('btnSelDeleteForever').style.display = isTrash ? 'flex' : 'none';
    document.getElementById('btnSelRemoveAlbum').style.display = isAlbum ? 'flex' : 'none';
}

function selectedIdsArray() { return Array.from(selectedIds); }

// ============================== Navegación ==============================

const PAGE_ID_MAP = {
    timeline: 'page-timeline',
    favorites: 'page-simple-grid',
    videos: 'page-simple-grid',
    search: 'page-simple-grid',
    folder: 'page-simple-grid',
    albums: 'page-albums',
    'album-detail': 'page-album-detail',
    people: 'page-people',
    'person-detail': 'page-person-detail',
    places: 'page-places',
    trash: 'page-trash',
    settings: 'page-settings'
};

function navigateTo(pageName, params) {
    params = params || {};
    clearSelection();

    document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageId = PAGE_ID_MAP[pageName];
    const pageEl = pageId && document.getElementById(pageId);
    if (pageEl) pageEl.classList.add('active');

    const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (navItem) navItem.classList.add('active');

    if (pageName !== 'search') {
        const searchInput = document.getElementById('searchInput');
        const searchClear = document.getElementById('searchClear');
        if (searchInput && searchInput.value) { searchInput.value = ''; searchClear.style.display = 'none'; }
    }

    closeMobileSidebar();

    if (pageName === 'timeline') loadTimeline();
    else if (pageName === 'favorites') {
        simpleGridContext = { type: 'favorites' };
        loadSimpleGrid(t('nav_favorites'), { view: 'favorites' }, { emptyIcon: 'fa-star', emptyTitle: t('empty_favorites_title'), emptyText: t('empty_favorites_text') });
    }
    else if (pageName === 'videos') {
        simpleGridContext = { type: 'videos' };
        loadSimpleGrid(t('nav_videos'), { view: 'videos' }, { emptyIcon: 'fa-circle-play', emptyTitle: t('empty_videos_title'), emptyText: '' });
    }
    else if (pageName === 'search') {
        simpleGridContext = { type: 'search', query: params.query };
        loadSimpleGrid(t('search_results_title', { query: params.query }), { search: params.query }, { emptyIcon: 'fa-magnifying-glass', emptyTitle: t('empty_search_title'), emptyText: t('empty_search_text') });
    }
    else if (pageName === 'folder') {
        simpleGridContext = { type: 'folder', folder: params.folder };
        const folderName = params.folder.split(/[\\/]/).filter(Boolean).pop() || params.folder;
        loadSimpleGrid(folderName, { folder: params.folder }, { emptyIcon: 'fa-folder', emptyTitle: t('empty_folder_title') });
    }
    else if (pageName === 'albums') loadAlbums();
    else if (pageName === 'album-detail') loadAlbumDetail(params.albumId);
    else if (pageName === 'people') loadPeople();
    else if (pageName === 'person-detail') loadPersonDetail(params.personId);
    else if (pageName === 'places') loadPlaces();
    else if (pageName === 'trash') loadTrash();
    else if (pageName === 'settings') loadSettings();
}

function refreshActiveView() {
    const active = document.querySelector('.app-page.active');
    if (!active) return;
    if (active.id === 'page-timeline') loadTimeline();
    else if (active.id === 'page-simple-grid') reloadSimpleGrid();
    else if (active.id === 'page-trash') loadTrash();
    else if (active.id === 'page-album-detail') loadAlbumDetail(currentAlbumId);
    else if (active.id === 'page-person-detail') loadPersonDetail(currentPersonId);
    else if (active.id === 'page-people') loadPeople();
    else if (active.id === 'page-albums') loadAlbums();
    updateStorageInfo();
}

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarScrim').classList.remove('visible');
}

// ============================== Timeline (Fotos) ==============================

async function loadTimeline() {
    const container = document.getElementById('timelineContainer');
    container.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i><p>${escapeHtml(t('timeline_loading'))}</p></div>`;
    try {
        const photos = await API.get('/api/photos');
        allPhotos = photos;
        // La tira de "Recuerdos" se renderiza ANTES de construir la barra lateral de años:
        // va por encima del timeline y, si apareciera después, correría todo hacia abajo y
        // dejaría las posiciones de la barra desactualizadas (cada destino caería corrido por
        // la altura de la tira). Renderizándola primero, la barra mide posiciones definitivas.
        renderMemories(photos);
        renderGroupedGrid(container, photos, {
            emptyIcon: 'fa-image',
            emptyTitle: t('empty_timeline_title'),
            emptyText: t('empty_timeline_text'),
            afterRender: (wrappers) => renderYearNav(wrappers)
        });
    } catch (e) {
        container.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_timeline_error_title'), e.message);
    }
}

// Estado del "scrubber" de años (compartido entre renderYearNav, que lo llena
// con datos frescos cada vez que se carga el timeline, y wireYearNavInteraction,
// que engancha los listeners UNA SOLA VEZ y siempre lee el estado actual acá.
// Esto evita acumular listeners duplicados cada vez que se revisita "Fotos".
let yearNavState = null;
let yearNavDragging = false;
let yearNavHoverRaf = null;

function renderYearNav(wrappers) {
    const navContainer = document.getElementById('timelineScrollNav');
    navContainer.innerHTML = '';
    yearNavState = null;

    const pageViewport = document.querySelector('.page-viewport');
    const timelineContainer = document.getElementById('timelineContainer');
    if (!wrappers || wrappers.length === 0) return;

    const track = document.createElement('div');
    track.className = 'year-nav-track';
    navContainer.appendChild(track);

    const scrubber = document.createElement('div');
    scrubber.className = 'year-nav-scrubber';
    scrubber.innerHTML = '<div class="year-nav-tooltip"></div><div class="year-nav-handle"><i class="fa-solid fa-chevron-right"></i></div>';
    navContainer.appendChild(scrubber);

    // Un "checkpoint" por cada grupo (día), con su posición real dentro del
    // contenido scrolleable — es lo que permite que el espacio en la barra sea
    // proporcional a la cantidad real de fotos, en vez de una fila fija por año.
    const viewportRect = pageViewport.getBoundingClientRect();
    const checkpoints = wrappers
        .map(w => {
            const rect = w.getBoundingClientRect();
            const top = rect.top - viewportRect.top + pageViewport.scrollTop;
            const date = w.dataset.repDate ? new Date(w.dataset.repDate) : null;
            return date ? { top, date } : null;
        })
        .filter(Boolean);
    if (checkpoints.length === 0) return;

    // El elemento que REALMENTE hace scroll es .page-viewport (no timelineContainer):
    // su rango real de scroll es scrollHeight - clientHeight, e incluye todo lo que
    // haya ARRIBA del timeline (la tira de "Recuerdos", el padding). Antes se usaba la
    // altura de timelineContainer como "total", lo que descalibraba la barra: cada
    // destino caía corrido (por la altura de la tira de Recuerdos) y el extremo inferior
    // podía quedar inalcanzable. Ahora el mapeo barra↔scroll es exacto en ambos extremos.
    const maxScroll = Math.max(1, pageViewport.scrollHeight - pageViewport.clientHeight);
    const navHeight = navContainer.clientHeight || 1;
    const toNavY = (scrollTopPx) => Math.max(0, Math.min(navHeight, (scrollTopPx / maxScroll) * navHeight));

    // Un checkpoint por mes (para las marcas), y el primero de cada año (para
    // las etiquetas grandes).
    const monthMarks = [];
    const yearLabels = [];
    let lastMonthKey = null;
    let lastYear = null;
    checkpoints.forEach(cp => {
        const y = cp.date.getFullYear();
        const monthKey = `${y}-${cp.date.getMonth()}`;
        if (monthKey !== lastMonthKey) {
            lastMonthKey = monthKey;
            monthMarks.push({ top: cp.top, navY: toNavY(cp.top) });
        }
        if (y !== lastYear) {
            lastYear = y;
            yearLabels.push({ top: cp.top, year: y, navY: toNavY(cp.top) });
        }
    });

    // Si dos años quedan demasiado cerca como para mostrar ambas etiquetas sin
    // superponerse, se OMITE la que no entra — nunca se la desplaza de su
    // posición real. Si la moviéramos, quedaría dibujada en un punto que ya no
    // corresponde a su fecha real, y arrastrar hasta ahí te llevaría a otro año
    // (exactamente el bug reportado). Así, todo lo que se ve en la barra está
    // siempre en su posición proporcional real, sin importar cómo cambien las
    // fotos o los huecos entre años.
    const MIN_LABEL_GAP = 20;
    // Cada año "ocupa" en la barra desde su navY hasta el del año siguiente; ese span
    // es proporcional a cuántas fotos tiene. Antes las etiquetas se colocaban en orden
    // cronológico descartando la que quedaba pegada a la anterior — con lo cual un año
    // con MUCHAS fotos podía quedarse sin etiqueta solo porque un año chiquito y más
    // reciente caía justo antes. Ahora se eligen por prominencia (span) descendente,
    // respetando la separación mínima, así los años con más fotos SIEMPRE se etiquetan;
    // después se dibujan en orden cronológico.
    yearLabels.forEach((yl, i) => {
        const nextY = (i + 1 < yearLabels.length) ? yearLabels[i + 1].navY : navHeight;
        yl.span = Math.max(0, nextY - yl.navY);
    });
    const chosen = [];
    [...yearLabels].sort((a, b) => b.span - a.span).forEach(yl => {
        if (chosen.every(c => Math.abs(c.navY - yl.navY) >= MIN_LABEL_GAP)) chosen.push(yl);
    });
    chosen.sort((a, b) => a.navY - b.navY);
    const placedYearLabels = [];
    chosen.forEach(yl => {
        const el = document.createElement('div');
        el.className = 'year-nav-item';
        el.textContent = yl.year;
        el.style.top = yl.navY + 'px';
        track.appendChild(el);
        placedYearLabels.push({ top: yl.top, navY: yl.navY, el });
    });

    monthMarks.forEach(mm => {
        const tooCloseToLabel = placedYearLabels.some(yl => Math.abs(yl.navY - mm.navY) < 10);
        if (tooCloseToLabel) return;
        const dot = document.createElement('div');
        dot.className = 'year-nav-tick';
        dot.style.top = mm.navY + 'px';
        track.appendChild(dot);
    });

    yearNavState = {
        navContainer, track, scrubber,
        tooltipEl: scrubber.querySelector('.year-nav-tooltip'),
        handleEl: scrubber.querySelector('.year-nav-handle'),
        pageViewport, checkpoints, maxScroll, navHeight, placedYearLabels
    };

    updateYearNavCurrent();
}

function updateYearNavCurrent() {
    if (!yearNavState) return;
    const { pageViewport, placedYearLabels } = yearNavState;
    const scrollTop = pageViewport.scrollTop;
    let current = null;
    for (const yl of placedYearLabels) {
        if (yl.top <= scrollTop + 60) current = yl;
    }
    placedYearLabels.forEach(yl => yl.el.classList.toggle('current', yl === current));
}

function yearNavPositionFromClientY(clientY) {
    const rect = yearNavState.navContainer.getBoundingClientRect();
    const y = Math.max(0, Math.min(yearNavState.navHeight, clientY - rect.top));
    const scrollTopTarget = (y / yearNavState.navHeight) * yearNavState.maxScroll;

    // La fecha del tooltip se elige por el checkpoint cuya posición EN LA BARRA está
    // más cerca del cursor (no por distancia de scroll). Los grupos de la última
    // pantalla tienen top > maxScroll y no se pueden llevar hasta arriba; comparando en
    // el espacio de la barra (con navY recortado a [0,navHeight]) el extremo inferior
    // siempre cae en el último grupo (el más viejo), en vez de mostrar una fecha algo
    // más nueva. Así el tooltip coincide con lo que se ve en la barra.
    let closest = yearNavState.checkpoints[0];
    let minDist = Infinity;
    for (const cp of yearNavState.checkpoints) {
        const cpNavY = Math.min(yearNavState.navHeight, (cp.top / yearNavState.maxScroll) * yearNavState.navHeight);
        const d = Math.abs(cpNavY - y);
        if (d < minDist) { minDist = d; closest = cp; }
    }
    return { y, scrollTopTarget, date: closest.date };
}

function updateYearNavScrubber(clientY, shouldScroll) {
    if (!yearNavState) return;
    const { y, scrollTopTarget, date } = yearNavPositionFromClientY(clientY);
    yearNavState.handleEl.style.top = y + 'px';
    yearNavState.tooltipEl.style.top = y + 'px';
    yearNavState.tooltipEl.textContent = formatMonthYear(date);
    if (shouldScroll) yearNavState.pageViewport.scrollTop = scrollTopTarget;
}

function wireYearNavInteraction() {
    const navContainer = document.getElementById('timelineScrollNav');

    navContainer.addEventListener('mousemove', (e) => {
        if (!yearNavState || yearNavDragging) return;
        navContainer.classList.add('hovering');
        updateYearNavScrubber(e.clientY, false);
    });
    navContainer.addEventListener('mouseleave', () => {
        if (!yearNavDragging) navContainer.classList.remove('hovering');
    });
    navContainer.addEventListener('mousedown', (e) => {
        if (!yearNavState) return;
        yearNavDragging = true;
        navContainer.classList.add('scrubbing');
        updateYearNavScrubber(e.clientY, true);
        e.preventDefault();
    });
    navContainer.addEventListener('touchstart', (e) => {
        if (!yearNavState || !e.touches[0]) return;
        yearNavDragging = true;
        navContainer.classList.add('scrubbing');
        updateYearNavScrubber(e.touches[0].clientY, true);
    }, { passive: true });
    navContainer.addEventListener('touchmove', (e) => {
        if (!yearNavDragging || !e.touches[0]) return;
        updateYearNavScrubber(e.touches[0].clientY, true);
    }, { passive: true });
    navContainer.addEventListener('touchend', () => {
        yearNavDragging = false;
        navContainer.classList.remove('scrubbing', 'hovering');
    });

    // Se enganchan a window (no solo al contenedor) porque mientras se arrastra
    // el cursor casi siempre se sale de esta franja tan angosta.
    window.addEventListener('mousemove', (e) => {
        if (!yearNavDragging) return;
        updateYearNavScrubber(e.clientY, true);
    });
    window.addEventListener('mouseup', () => {
        if (!yearNavDragging) return;
        yearNavDragging = false;
        navContainer.classList.remove('scrubbing', 'hovering');
    });

    document.querySelector('.page-viewport').addEventListener('scroll', debounce(updateYearNavCurrent, 80));

    // Al cambiar el tamaño de la ventana cambian las alturas de los grupos y el rango
    // real de scroll, así que la barra hay que recalcularla; si no, sus posiciones (y por
    // lo tanto las fechas a las que salta) quedarían basadas en el tamaño anterior.
    window.addEventListener('resize', debounce(() => {
        const timelinePage = document.getElementById('page-timeline');
        if (!timelinePage || !timelinePage.classList.contains('active')) return;
        const wrappers = Array.from(document.getElementById('timelineContainer').querySelectorAll('.timeline-group'));
        if (wrappers.length) renderYearNav(wrappers);
    }, 150));
}

function renderMemories(photos) {
    const strip = document.getElementById('memoriesStrip');
    const scroller = document.getElementById('memoriesScroller');
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const currentYear = today.getFullYear();

    const matches = photos.filter(p => {
        if (p.isVideo) return false;
        const d = new Date(p.dateTaken);
        return d.getMonth() === todayMonth && d.getDate() === todayDate && d.getFullYear() < currentYear;
    });

    if (matches.length === 0) {
        strip.style.display = 'none';
        return;
    }

    const byYear = new Map();
    matches.forEach(p => {
        const year = new Date(p.dateTaken).getFullYear();
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(p);
    });

    scroller.innerHTML = '';
    Array.from(byYear.keys()).sort((a, b) => b - a).forEach(year => {
        const yearPhotos = byYear.get(year);
        const cover = yearPhotos[0];
        const yearsAgo = currentYear - year;
        const card = document.createElement('div');
        card.className = 'memory-card';
        card.innerHTML = `
            <img src="/api/thumbnail?id=${cover.id}" loading="lazy" alt="">
            <div class="memory-card-label">${escapeHtml(tn('memories_years_ago', yearsAgo))}</div>`;
        card.addEventListener('click', () => {
            if (typeof window.openLightboxAt === 'function') window.openLightboxAt(yearPhotos, 0, {});
        });
        scroller.appendChild(card);
    });

    strip.style.display = 'block';
}

// ============================== Favoritos / Videos / Búsqueda / Carpeta ==============================

async function loadSimpleGrid(title, queryParams, gridOptions) {
    document.getElementById('simpleGridTitle').textContent = title;
    const container = document.getElementById('simpleGridContainer');
    container.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i></div>';
    const qs = new URLSearchParams(queryParams).toString();
    try {
        const photos = await API.get(`/api/photos?${qs}`);
        renderGroupedGrid(container, photos, gridOptions || {});
    } catch (e) {
        container.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_generic_error_title'), e.message);
    }
}

function reloadSimpleGrid() {
    if (!simpleGridContext) return;
    if (simpleGridContext.type === 'favorites') navigateTo('favorites');
    else if (simpleGridContext.type === 'videos') navigateTo('videos');
    else if (simpleGridContext.type === 'search') navigateTo('search', { query: simpleGridContext.query });
    else if (simpleGridContext.type === 'folder') navigateTo('folder', { folder: simpleGridContext.folder });
}

// ============================== Álbumes ==============================

async function loadAlbums() {
    const userGrid = document.getElementById('userAlbumsGrid');
    const folderGrid = document.getElementById('albumsGrid');
    userGrid.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

    try {
        const albums = await API.get('/api/albums');
        if (albums.length === 0) {
            userGrid.innerHTML = renderEmptyState('fa-folder-closed', t('empty_albums_title'), t('empty_albums_text'));
        } else {
            userGrid.innerHTML = albums.map(a => `
                <div class="album-card" data-album-id="${escapeHtml(a.id)}">
                    <div class="album-cover single-cover">
                        ${a.coverPhotoId ? `<img src="/api/thumbnail?id=${escapeHtml(a.coverPhotoId)}" loading="lazy" alt="">` : '<div class="album-cover-empty"><i class="fa-regular fa-image"></i></div>'}
                    </div>
                    <div class="album-card-title">${escapeHtml(a.name)}</div>
                    <div class="album-card-subtitle">${escapeHtml(tn('item_count', a.photoCount))}</div>
                </div>`).join('');
            userGrid.querySelectorAll('.album-card').forEach(card => {
                card.addEventListener('click', () => navigateTo('album-detail', { albumId: card.dataset.albumId }));
            });
        }
    } catch (e) {
        userGrid.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_albums_error_title'), e.message);
    }

    try {
        const photos = await API.get('/api/photos');
        const folderMap = new Map();
        photos.forEach(p => {
            const sepIdx = Math.max(p.path.lastIndexOf('/'), p.path.lastIndexOf('\\'));
            const folder = sepIdx > -1 ? p.path.substring(0, sepIdx) : p.path;
            if (!folderMap.has(folder)) folderMap.set(folder, { path: folder, count: 0, cover: p });
            folderMap.get(folder).count++;
        });
        const folders = Array.from(folderMap.values()).sort((a, b) => b.count - a.count);
        folderGrid.innerHTML = folders.map(f => `
            <div class="album-card" data-folder="${escapeHtml(f.path)}">
                <div class="album-cover single-cover"><img src="/api/thumbnail?id=${escapeHtml(f.cover.id)}" loading="lazy" alt=""></div>
                <div class="album-card-title">${escapeHtml(f.path.split(/[\\/]/).filter(Boolean).pop() || f.path)}</div>
                <div class="album-card-subtitle">${escapeHtml(tn('item_count', f.count))}</div>
            </div>`).join('');
        folderGrid.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', () => navigateTo('folder', { folder: card.dataset.folder }));
        });
    } catch (e) {
        folderGrid.innerHTML = '';
    }
}

async function loadAlbumDetail(albumId) {
    currentAlbumId = albumId;
    const container = document.getElementById('albumDetailContainer');
    const titleEl = document.getElementById('albumDetailTitle');
    titleEl.textContent = '';
    container.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    try {
        const album = await API.get(`/api/albums/${albumId}`);
        titleEl.textContent = album.name;
        const photos = await API.get(`/api/photos?albumId=${albumId}`);
        renderGroupedGrid(container, photos, {
            removeFromAlbumId: albumId,
            emptyIcon: 'fa-folder-open',
            emptyTitle: t('empty_album_detail_title'),
            emptyText: t('empty_album_detail_text')
        });
    } catch (e) {
        container.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_album_detail_error_title'), e.message);
    }
}

async function renameCurrentAlbum(newName) {
    if (!currentAlbumId || !newName || !newName.trim()) return;
    try {
        await API.put(`/api/albums/${currentAlbumId}`, { name: newName.trim() });
        Toast.success(t('toast_album_renamed'));
    } catch (e) {
        Toast.error(t('toast_album_rename_error', { error: e.message }));
    }
}

async function deleteCurrentAlbum() {
    if (!currentAlbumId) return;
    const ok = await confirmDialog({
        title: t('album_delete_confirm_title'),
        message: t('album_delete_confirm_message'),
        confirmLabel: t('album_delete_confirm_button'),
        cancelLabel: t('dialog_cancel'),
        danger: true
    });
    if (!ok) return;
    try {
        await API.del(`/api/albums/${currentAlbumId}`);
        Toast.success(t('toast_album_deleted'));
        navigateTo('albums');
    } catch (e) {
        Toast.error(t('toast_album_delete_error', { error: e.message }));
    }
}

async function albumPickerDialog(photoIds) {
    let albums = [];
    try {
        albums = await API.get('/api/albums');
    } catch (e) {
        Toast.error(t('toast_albums_load_error'));
        return;
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        const listHtml = albums.map(a => `
            <div class="album-picker-item" data-album-id="${escapeHtml(a.id)}">
                ${a.coverPhotoId ? `<img class="album-picker-thumb" src="/api/thumbnail?id=${escapeHtml(a.coverPhotoId)}" alt="">` : '<div class="album-picker-thumb"></div>'}
                <span class="album-picker-name">${escapeHtml(a.name)}</span>
                <span style="font-size:12px;color:var(--text-secondary);">${a.photoCount}</span>
            </div>`).join('');

        overlay.innerHTML = `
            <div class="confirm-box" role="dialog" aria-modal="true">
                <h3 class="confirm-title">${escapeHtml(t('album_picker_title'))}</h3>
                <div class="album-picker-list">${listHtml || `<p style="color:var(--text-secondary);font-size:13px;padding:12px 0;">${escapeHtml(t('album_picker_no_albums'))}</p>`}</div>
                <div class="album-picker-new" id="albumPickerNewBtn"><i class="fa-solid fa-plus"></i> ${escapeHtml(t('album_picker_create_new'))}</div>
                <div class="confirm-actions" style="margin-top:16px;"><button class="confirm-btn confirm-cancel">${escapeHtml(t('album_picker_close'))}</button></div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('confirm-visible'));

        function close(result) {
            overlay.classList.remove('confirm-visible');
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        }

        overlay.querySelectorAll('.album-picker-item').forEach(item => {
            item.addEventListener('click', async () => {
                const albumId = item.dataset.albumId;
                try {
                    await API.post(`/api/albums/${albumId}/photos`, { photoIds });
                    Toast.success(t('toast_added_to_album'));
                    close(true);
                } catch (e) {
                    Toast.error(t('toast_add_to_album_error', { error: e.message }));
                    close(false);
                }
            });
        });
        overlay.querySelector('#albumPickerNewBtn').addEventListener('click', async () => {
            const name = await promptDialog({ title: t('album_picker_new_title'), placeholder: t('album_picker_new_placeholder'), confirmLabel: t('album_picker_new_confirm') });
            if (!name) return;
            try {
                const { album } = await API.post('/api/albums', { name });
                await API.post(`/api/albums/${album.id}/photos`, { photoIds });
                Toast.success(t('toast_album_created_with_photos'));
                close(true);
            } catch (e) {
                Toast.error(t('toast_album_create_error', { error: e.message }));
                close(false);
            }
        });
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(false); });
    });
}

// ============================== Papelera ==============================

let trashRetentionDaysCache = 30;

async function loadTrash() {
    const container = document.getElementById('trashGrid');
    container.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i></div>';
    try {
        const photos = await API.get('/api/photos?view=trash');
        renderGroupedGrid(container, photos, {
            grouped: false,
            trashView: true,
            trashRetentionDays: trashRetentionDaysCache,
            emptyIcon: 'fa-trash-can',
            emptyTitle: t('empty_trash_title'),
            emptyText: ''
        });
    } catch (e) {
        container.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_trash_error_title'), e.message);
    }
}

// ============================== Barra de selección: acciones ==============================

function wireSelectionActionBar() {
    document.getElementById('btnSelectionCancel').addEventListener('click', clearSelection);

    document.getElementById('btnSelFavorite').addEventListener('click', async () => {
        const ids = selectedIdsArray();
        clearSelection();
        try {
            await API.post('/api/photos/batch', { ids, action: 'favorite' });
            Toast.success(tn('toast_favorited', ids.length));
            refreshActiveView();
        } catch (e) {
            Toast.error(t('toast_favorite_error', { error: e.message }));
        }
    });

    const btnChangeDate = document.getElementById('btnSelChangeDate');
    if (btnChangeDate) {
        btnChangeDate.addEventListener('click', async () => {
            const ids = selectedIdsArray();
            if (ids.length === 0) return;
            const firstPhoto = currentGridPhotos.find(p => ids.includes(p.id));
            const newDate = await datePickerDialog({
                title: t('dialog_change_date_title'),
                message: t('dialog_change_date_prompt'),
                initialDate: firstPhoto ? firstPhoto.dateTaken : null
            });
            if (!newDate) return;
            try {
                await API.post('/api/photos/batch', { ids, action: 'changeDate', dateTaken: newDate });
                ids.forEach(id => {
                    const p = currentGridPhotos.find(x => x.id === id);
                    if (p) p.dateTaken = newDate;
                });
                Toast.success(tn('toast_date_updated', ids.length));
                clearSelection();
                refreshActiveView();
            } catch (e) {
                Toast.error(t('toast_date_update_error', { error: e.message }));
            }
        });
    }

    document.getElementById('btnSelAddAlbum').addEventListener('click', async () => {
        const ids = selectedIdsArray();
        clearSelection();
        await albumPickerDialog(ids);
        refreshActiveView();
    });

    document.getElementById('btnSelRemoveAlbum').addEventListener('click', async () => {
        const ids = selectedIdsArray();
        const albumId = selectionAlbumId;
        clearSelection();
        if (!albumId) return;
        try {
            await API.del(`/api/albums/${albumId}/photos`, { photoIds: ids });
            Toast.success(t('toast_removed_from_album'));
            refreshActiveView();
        } catch (e) {
            Toast.error(t('toast_remove_from_album_error', { error: e.message }));
        }
    });

    document.getElementById('btnSelDownload').addEventListener('click', () => {
        const ids = selectedIdsArray();
        if (ids.length > 300) {
            Toast.error(t('toast_download_too_many'));
            return;
        }
        Toast.info(t('toast_download_preparing'));
        window.location.href = `/api/download/zip?ids=${ids.join(',')}`;
    });

    document.getElementById('btnSelTrash').addEventListener('click', async () => {
        const ids = selectedIdsArray();
        const count = ids.length;
        clearSelection();
        try {
            await API.post('/api/photos/batch', { ids, action: 'trash' });
            refreshActiveView();
            Toast.action(tn('toast_trashed', count), t('toast_undo'), async () => {
                try {
                    await API.post('/api/photos/batch', { ids, action: 'restore' });
                    Toast.success(t('toast_restored'));
                    refreshActiveView();
                } catch (e) {
                    Toast.error(t('toast_undo_error', { error: e.message }));
                }
            });
        } catch (e) {
            Toast.error(t('toast_trash_error', { error: e.message }));
        }
    });

    document.getElementById('btnSelRestore').addEventListener('click', async () => {
        const ids = selectedIdsArray();
        clearSelection();
        try {
            await API.post('/api/photos/batch', { ids, action: 'restore' });
            Toast.success(t('toast_restore_success'));
            refreshActiveView();
        } catch (e) {
            Toast.error(t('toast_restore_error', { error: e.message }));
        }
    });

    document.getElementById('btnSelDeleteForever').addEventListener('click', async () => {
        const ids = selectedIdsArray();
        const ok = await confirmDialog({
            title: tn('toast_delete_forever_confirm_title', ids.length),
            message: t('toast_delete_forever_confirm_message'),
            confirmLabel: t('toast_delete_forever_confirm_button'),
            cancelLabel: t('dialog_cancel'),
            danger: true
        });
        if (!ok) return;
        clearSelection();
        try {
            await API.post('/api/photos/batch', { ids, action: 'deleteForever' });
            Toast.success(t('toast_deleted_forever'));
            refreshActiveView();
        } catch (e) {
            Toast.error(t('toast_delete_error', { error: e.message }));
        }
    });
}

// ============================== Almacenamiento ==============================

function updateTrashNoticeText() {
    const trashText = document.getElementById('trashRetentionNoticeText');
    if (trashText) {
        trashText.textContent = t('trash_retention_notice', { days: trashRetentionDaysCache || 30 });
    }
}

async function updateStorageInfo() {
    try {
        const config = await API.get('/api/config');
        trashRetentionDaysCache = config.trashRetentionDays || 30;
        updateTrashNoticeText();
    } catch (e) {}

    try {
        const info = await API.get('/api/storage');
        const bar = document.getElementById('storageBar');
        const text = document.getElementById('storageText');
        if (bar && text) {
            if (info.disk && info.disk.totalBytes) {
                const usedByApp = info.totalBytes;
                const pct = Math.min(100, (usedByApp / info.disk.totalBytes) * 100);
                bar.style.width = pct.toFixed(1) + '%';
                text.textContent = t('storage_indexed_of', { used: formatBytes(usedByApp), free: formatBytes(info.disk.freeBytes), total: formatBytes(info.disk.totalBytes) });
            } else {
                bar.style.width = '100%';
                text.textContent = t('storage_no_disk_info', { count: info.totalPhotos, size: formatBytes(info.totalBytes) });
            }
        }
    } catch (e) {}
}

// ============================== Personas ==============================

let peopleSelectionMode = false;
let selectedPeopleIds = new Set();

async function loadPeople() {
    const grid = document.getElementById('peopleGrid');
    grid.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i></div>';
    exitPeopleSelectionMode();

    try {
        const people = await API.get('/api/people');
        if (people.length === 0) {
            grid.innerHTML = renderEmptyState('fa-face-smile', t('empty_people_title'), t('empty_people_text'));
            return;
        }
        grid.innerHTML = people.map(p => `
            <div class="person-card" data-cluster-id="${escapeHtml(p.id)}">
                <div class="person-avatar-wrap">
                    <img class="person-avatar" src="/api/face-image/${escapeHtml(p.coverFace.id)}" loading="lazy" alt="${escapeHtml(p.name)}">
                    <div class="person-select-check"><i class="fa-solid fa-check"></i></div>
                </div>
                <div class="person-name">${escapeHtml(p.name === 'Sin nombre' ? t('unnamed_person') : p.name)}</div>
                <div class="person-face-count">${escapeHtml(tn('photo_count', p.facesCount))}</div>
            </div>`).join('');

        grid.querySelectorAll('.person-card').forEach(card => {
            card.addEventListener('click', () => {
                const clusterId = card.dataset.clusterId;
                if (peopleSelectionMode) {
                    togglePersonSelect(clusterId, card);
                } else {
                    navigateTo('person-detail', { personId: clusterId });
                }
            });
        });
    } catch (e) {
        grid.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_people_error_title'), e.message);
    }
}

function togglePersonSelect(clusterId, card) {
    if (selectedPeopleIds.has(clusterId)) {
        selectedPeopleIds.delete(clusterId);
        card.classList.remove('selected');
    } else {
        selectedPeopleIds.add(clusterId);
        card.classList.add('selected');
    }
    document.getElementById('selectedCountText').textContent = tn('people_selected_count', selectedPeopleIds.size);
    document.getElementById('btnConfirmMerge').disabled = selectedPeopleIds.size < 2;
}

function enterPeopleSelectionMode() {
    peopleSelectionMode = true;
    selectedPeopleIds.clear();
    document.getElementById('peopleGrid').classList.add('grid-selection-mode');
    document.getElementById('peopleDefaultActions').style.display = 'none';
    document.getElementById('peopleSelectionActions').style.display = 'flex';
    document.getElementById('selectedCountText').textContent = tn('people_selected_count', 0);
    document.getElementById('btnConfirmMerge').disabled = true;
}

function exitPeopleSelectionMode() {
    peopleSelectionMode = false;
    selectedPeopleIds.clear();
    const grid = document.getElementById('peopleGrid');
    grid.classList.remove('grid-selection-mode');
    grid.querySelectorAll('.person-card.selected').forEach(el => el.classList.remove('selected'));
    document.getElementById('peopleDefaultActions').style.display = 'flex';
    document.getElementById('peopleSelectionActions').style.display = 'none';
}

async function loadPersonDetail(personId) {
    currentPersonId = personId;
    const container = document.getElementById('personPhotosGrid');
    const nameInput = document.getElementById('personNameInput');
    nameInput.value = '';
    container.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    try {
        const [people, photos] = await Promise.all([
            API.get('/api/people'),
            API.get(`/api/photos?personId=${encodeURIComponent(personId)}`)
        ]);
        const person = people.find(p => p.id === personId);
        if (person) nameInput.value = person.name === 'Sin nombre' ? '' : person.name;
        renderGroupedGrid(container, photos, { emptyIcon: 'fa-face-smile', emptyTitle: t('empty_person_detail_title') });
    } catch (e) {
        container.innerHTML = renderEmptyState('fa-triangle-exclamation', t('empty_generic_error_title'), e.message);
    }
}

// ============================== Lugares ==============================

async function loadPlaces() {
    const mapDiv = document.getElementById('placesMap');

    // El mapa (Leaflet) se carga desde un CDN. Si no hay internet o el CDN no
    // respondió, `L` no existe: sin esta guarda, entrar a "Lugares" lanzaba una
    // excepción no controlada (ReferenceError) y dejaba la sección rota. Ahora
    // avisa con elegancia en vez de romperse.
    if (typeof L === 'undefined') {
        mapDiv.innerHTML = renderEmptyState('fa-location-dot', t('places_map_unavailable_title'), t('places_map_unavailable_text'));
        return;
    }

    if (!placesMapInstance) {
        placesMapInstance = L.map(mapDiv).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        }).addTo(placesMapInstance);
    }

    try {
        const photos = await API.get('/api/photos');
        const withGps = photos.filter(p => p.latitude && p.longitude);

        if (placesMapInstance._photoMarkers) {
            placesMapInstance._photoMarkers.forEach(m => placesMapInstance.removeLayer(m));
        }
        placesMapInstance._photoMarkers = [];

        if (withGps.length === 0) return;

        const bounds = [];
        withGps.slice(0, 2000).forEach(photo => {
            const marker = L.marker([photo.latitude, photo.longitude]).addTo(placesMapInstance);
            const popupDiv = document.createElement('div');
            popupDiv.innerHTML = `<img src="/api/thumbnail?id=${photo.id}" alt="">`;
            popupDiv.querySelector('img').addEventListener('click', () => {
                if (typeof window.openLightboxAt === 'function') window.openLightboxAt([photo], 0, {});
            });
            marker.bindPopup(popupDiv);
            placesMapInstance._photoMarkers.push(marker);
            bounds.push([photo.latitude, photo.longitude]);
        });

        if (bounds.length > 0) placesMapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });

        setTimeout(() => placesMapInstance.invalidateSize(), 150);
    } catch (e) {
        Toast.error(t('toast_places_load_error', { error: e.message }));
    }
}

// ============================== Configuración ==============================

let pendingFolders = [];

async function loadSettings() {
    try {
        const config = await API.get('/api/config');
        pendingFolders = [...(config.folders || [])];
        renderFoldersList();

        document.getElementById('faceRecognitionToggle').checked = config.faceRecognitionEnabled !== false;
        const thresh = config.clusterThreshold !== undefined ? config.clusterThreshold : 0.44;
        document.getElementById('clusterThresholdInput').value = thresh;
        updateThresholdText(thresh);
        applyThresholdDescription(); // localiza el texto de ayuda (Estricto/Permisivo) según el idioma

        document.getElementById('trashRetentionInput').value = config.trashRetentionDays || 30;
    } catch (e) {
        Toast.error(t('toast_settings_load_error', { error: e.message }));
    }
}

function applyThresholdDescription() {
    const el = document.getElementById('thresholdDescription');
    if (!el) return;
    el.innerHTML = t('settings_threshold_description', {
        strict: `<strong>${escapeHtml(t('settings_threshold_strict_word'))}</strong>`,
        permissive: `<strong>${escapeHtml(t('settings_threshold_permissive_word'))}</strong>`
    });
}

function renderFoldersList() {
    const list = document.getElementById('foldersList');
    if (pendingFolders.length === 0) {
        list.innerHTML = `<p class="empty-folders-text" data-i18n="settings_no_folders">${t('settings_no_folders')}</p>`;
        return;
    }

    const removeLabel = t('settings_folder_remove');
    list.innerHTML = pendingFolders.map((f, i) => `
        <div class="folder-row">
            <i class="fa-solid fa-hard-drive"></i>
            <span class="folder-row-path">${escapeHtml(f)}</span>
            <button class="folder-row-remove" data-index="${i}" title="${removeLabel}"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
    list.querySelectorAll('.folder-row-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingFolders.splice(parseInt(btn.dataset.index, 10), 1);
            renderFoldersList();
        });
    });
}

function updateThresholdText(value) {
    const v = parseFloat(value);
    let label = t('settings_threshold_balanced');
    if (v <= 0.41) label = t('settings_threshold_strict_full');
    else if (v >= 0.48) label = t('settings_threshold_permissive_full');
    document.getElementById('thresholdValueText').textContent = `${t('settings_threshold_current_prefix', { value: v.toFixed(2) })} — ${label}`;
}

function wireSettingsPage() {
    document.getElementById('btnAddFolder').addEventListener('click', () => {
        const input = document.getElementById('newFolderPathInput');
        const val = input.value.trim();
        if (!val) return;
        if (pendingFolders.includes(val)) {
            Toast.error(t('toast_folder_already_added'));
            return;
        }
        pendingFolders.push(val);
        input.value = '';
        renderFoldersList();
    });

    const btnBrowse = document.getElementById('btnBrowseFolder');
    if (btnBrowse) {
        btnBrowse.addEventListener('click', async () => {
            btnBrowse.disabled = true;
            try {
                const res = await API.post('/api/browse-folder', {});
                if (res && res.folderPath) {
                    document.getElementById('newFolderPathInput').value = res.folderPath;
                }
            } catch (e) {
                console.warn('[app] Error con el explorador nativo de carpetas:', e.message);
                if (window.showDirectoryPicker) {
                    try {
                        const handle = await window.showDirectoryPicker();
                        if (handle && handle.name) {
                            document.getElementById('newFolderPathInput').value = handle.name;
                        }
                    } catch (e2) { /* cancelado */ }
                }
        });
    }

    const btnCheckUpdate = document.getElementById('btnCheckUpdate');
    const updateNotice = document.getElementById('updateStatusNotice');
    if (btnCheckUpdate) {
        btnCheckUpdate.addEventListener('click', async () => {
            btnCheckUpdate.disabled = true;
            btnCheckUpdate.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('update_checking')}`;
            if (updateNotice) {
                updateNotice.style.display = 'none';
                updateNotice.innerHTML = '';
            }
            try {
                const res = await API.get('/api/check-update');
                if (res && res.currentVersion) {
                    const badge = document.getElementById('appVersionBadge');
                    if (badge) badge.textContent = `Local Photos v${res.currentVersion}`;
                }
                if (res && res.hasUpdate) {
                    if (updateNotice) {
                        updateNotice.style.display = 'block';
                        updateNotice.style.background = 'rgba(34, 197, 94, 0.12)';
                        updateNotice.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                        updateNotice.style.color = '#15803d';
                        updateNotice.innerHTML = `
                            <strong>${t('update_available', { version: res.latestVersion })}</strong><br>
                            <a href="${res.releaseUrl}" target="_blank" class="settings-btn-primary" style="display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; text-decoration: none;">
                                <i class="fa-brands fa-github"></i> ${t('update_download_button', { version: res.latestVersion })}
                            </a>
                        `;
                    }
                } else if (res && res.noReleases) {
                    if (updateNotice) {
                        updateNotice.style.display = 'block';
                        updateNotice.style.background = 'rgba(99, 102, 241, 0.08)';
                        updateNotice.style.borderColor = 'rgba(99, 102, 241, 0.2)';
                        updateNotice.style.color = 'var(--text-primary)';
                        updateNotice.textContent = t('update_no_releases');
                    }
                } else {
                    if (updateNotice) {
                        updateNotice.style.display = 'block';
                        updateNotice.style.background = 'rgba(99, 102, 241, 0.08)';
                        updateNotice.style.borderColor = 'rgba(99, 102, 241, 0.2)';
                        updateNotice.style.color = 'var(--text-primary)';
                        updateNotice.textContent = t('update_already_latest', { version: res ? res.currentVersion : '2.1.0' });
                    }
                }
            } catch (e) {
                if (updateNotice) {
                    updateNotice.style.display = 'block';
                    updateNotice.style.background = 'rgba(239, 68, 68, 0.1)';
                    updateNotice.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    updateNotice.style.color = '#b91c1c';
                    updateNotice.textContent = t('update_error');
                }
            } finally {
                btnCheckUpdate.disabled = false;
                btnCheckUpdate.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ${t('settings_check_update_button')}`;
            }
        });
    }

    document.getElementById('newFolderPathInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnAddFolder').click();
    });

    document.getElementById('clusterThresholdInput').addEventListener('input', (e) => updateThresholdText(e.target.value));

    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
        const btn = document.getElementById('btnSaveConfig');
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('settings_save_button_loading');
        try {
            await API.post('/api/config', {
                folders: pendingFolders,
                clusterThreshold: parseFloat(document.getElementById('clusterThresholdInput').value),
                faceRecognitionEnabled: document.getElementById('faceRecognitionToggle').checked,
                trashRetentionDays: parseInt(document.getElementById('trashRetentionInput').value, 10) || 30
            });
            await API.post('/api/scan/start', {});
            Toast.success(t('toast_settings_saved'));
            navigateTo('timeline');
            pollScanStatus();
        } catch (e) {
            Toast.error(t('toast_settings_save_error', { error: e.message }));
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    });

    const btnS = document.getElementById('btnSettings');
    if (btnS) btnS.addEventListener('click', () => navigateTo('settings'));
    const btnHS = document.getElementById('btnHeaderSettings');
    if (btnHS) btnHS.addEventListener('click', () => navigateTo('settings'));
}

// ============================== Estado de escaneo (fotos + caras) ==============================

async function pollScanStatus() {
    try {
        const status = await API.get('/api/scan/status');
        window.scanStatus.scanning = status.scanning;

        const pill = document.getElementById('scanStatusIndicator');
        const pillText = document.getElementById('scanStatusText');
        const card = document.getElementById('timelineScanProgress');

        if (status.scanning) {
            const details = status.details || {};
            pill.style.display = 'flex';
            const pct = details.totalFiles > 0 ? Math.round((details.filesProcessed / details.totalFiles) * 100) : 0;
            pillText.textContent = details.currentAction === 'listing' ? t('header_scanning_listing') : t('header_scanning_pct', { pct });

            if (card && document.getElementById('page-timeline').classList.contains('active')) {
                card.style.display = 'block';
                document.getElementById('progressPercentText').textContent = details.totalFiles > 0 ? `${pct}% · ${details.filesProcessed}/${details.totalFiles}` : t('header_scanning_listing');
                document.getElementById('progressBarInner').style.width = pct + '%';
                document.getElementById('progressCurrentFolder').textContent = details.currentFolder ? t('timeline_folder_prefix', { folder: details.currentFolder }) : t('timeline_folder_processing');
                document.getElementById('progressFileCount').textContent = t('timeline_unchanged_prefix', { count: details.filesUnchanged || 0 });
            }
        } else {
            pill.style.display = 'none';
            if (card) card.style.display = 'none';
        }
    } catch (e) {
        // si el servidor no responde, no interrumpimos la UI; se reintenta en el próximo ciclo
    }

    updateFacesIndicator();
}

async function updateFacesIndicator() {
    const pill = document.getElementById('facesStatusIndicator');
    const text = document.getElementById('facesStatusText');
    if (!pill || !text) return;

    if (window.scanStatus.faceTotalCount === 0 && !window._facesCountFetched) {
        window._facesCountFetched = true;
        try {
            const unscannedRes = await API.get('/api/photos/unscanned?limit=1');
            if (unscannedRes && typeof unscannedRes.totalEligible === 'number') {
                window.scanStatus.faceTotalCount = unscannedRes.totalEligible;
                window.scanStatus.faceScannedCount = unscannedRes.scannedCount;
                if (unscannedRes.unscannedCount > 0) {
                    window.scanStatus.faceScanning = true;
                }
            }
        } catch (e) {}
    }

    if (window.scanStatus.faceScanning && window.scanStatus.faceTotalCount > 0 && window.scanStatus.faceScannedCount < window.scanStatus.faceTotalCount) {
        pill.style.display = 'flex';
        text.textContent = t('header_analyzing_faces_progress', { done: window.scanStatus.faceScannedCount, total: window.scanStatus.faceTotalCount });
    } else {
        pill.style.display = 'none';
    }
}

function startScanStatusPolling() {
    setInterval(async () => {
        const wasScanning = window.scanStatus.scanning;
        await pollScanStatus();
        if (wasScanning && !window.scanStatus.scanning) {
            // el escaneo acababa de terminar: refrescamos la vista activa para mostrar lo nuevo
            refreshActiveView();
        }
    }, 2500);
}

// ============================== Densidad de la cuadrícula ==============================

function wireGridDensity() {
    document.querySelectorAll('.density-btn').forEach(btn => {
        if (btn.dataset.density === currentGridDensity) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.addEventListener('click', () => {
            currentGridDensity = btn.dataset.density;
            localStorage.setItem('gridDensity', currentGridDensity);
            document.querySelectorAll('.density-btn').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.timeline-container').forEach(c => { c.dataset.density = currentGridDensity; });
            refreshActiveView();
        });
    });
}

// ============================== Inicialización ==============================

function wireNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });
}

function wireSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    input.addEventListener('input', debounce(() => {
        const q = input.value.trim();
        clearBtn.style.display = q ? 'flex' : 'none';
        if (q.length === 0) {
            if (document.getElementById('page-simple-grid').classList.contains('active') && simpleGridContext && simpleGridContext.type === 'search') {
                navigateTo('timeline');
            }
            return;
        }
        navigateTo('search', { query: q });
    }, 350));
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        navigateTo('timeline');
    });
}

function wireMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    document.getElementById('btnOpenSidebar').addEventListener('click', () => {
        sidebar.classList.add('open');
        scrim.classList.add('visible');
    });
    document.getElementById('btnCloseSidebar').addEventListener('click', closeMobileSidebar);
    scrim.addEventListener('click', closeMobileSidebar);
}

function wirePeoplePage() {
    document.getElementById('btnClusterNow').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(t('people_cluster_now_loading'))}`;
        try {
            const result = await API.post('/api/faces/cluster', {});
            Toast.success(tn('toast_cluster_done', result.totalClusters));
            loadPeople();
        } catch (e2) {
            Toast.error(t('toast_cluster_error', { error: e2.message }));
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });

    document.getElementById('btnGroupFaces').addEventListener('click', enterPeopleSelectionMode);
    document.getElementById('btnCancelMerge').addEventListener('click', exitPeopleSelectionMode);

    document.getElementById('btnConfirmMerge').addEventListener('click', async () => {
        const clusterIds = Array.from(selectedPeopleIds);
        if (clusterIds.length < 2) return;
        try {
            await API.post('/api/people/merge', { clusterIds });
            Toast.success(t('toast_merge_success'));
            loadPeople();
        } catch (e) {
            Toast.error(t('toast_merge_error', { error: e.message }));
        }
    });

    document.getElementById('btnBackToPeople').addEventListener('click', () => navigateTo('people'));

    document.getElementById('btnSavePersonName').addEventListener('click', async () => {
        const name = document.getElementById('personNameInput').value.trim();
        if (!name || !currentPersonId) return;
        try {
            await API.post(`/api/people/${currentPersonId}/name`, { name });
            Toast.success(t('toast_name_saved'));
        } catch (e) {
            Toast.error(t('toast_name_save_error', { error: e.message }));
        }
    });
    document.getElementById('personNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnSavePersonName').click();
    });
}

function wireAlbumsPages() {
    document.getElementById('btnCreateAlbum').addEventListener('click', async () => {
        const name = await promptDialog({ title: t('album_picker_new_title'), placeholder: t('album_picker_new_placeholder'), confirmLabel: t('album_picker_new_confirm') });
        if (!name) return;
        try {
            const { album } = await API.post('/api/albums', { name });
            Toast.success(t('toast_album_created'));
            navigateTo('album-detail', { albumId: album.id });
        } catch (e) {
            Toast.error(t('toast_album_create_error', { error: e.message }));
        }
    });

    document.getElementById('btnBackFromAlbum').addEventListener('click', () => navigateTo('albums'));
    document.getElementById('btnDeleteAlbum').addEventListener('click', deleteCurrentAlbum);

    const titleEl = document.getElementById('albumDetailTitle');
    titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });
    titleEl.addEventListener('blur', () => {
        const name = titleEl.textContent.trim();
        if (name) renameCurrentAlbum(name);
    });
}

function wireTrashPage() {
    document.getElementById('btnEmptyTrash').addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: t('trash_empty_confirm_title'),
            message: t('trash_empty_confirm_message'),
            confirmLabel: t('trash_empty_confirm_button'),
            cancelLabel: t('dialog_cancel'),
            danger: true
        });
        if (!ok) return;
        try {
            const result = await API.post('/api/trash/empty', {});
            Toast.success(t('toast_trash_emptied', { count: result.deletedCount }));
            loadTrash();
        } catch (e) {
            Toast.error(t('toast_trash_empty_error', { error: e.message }));
        }
    });
}

// ============================== Ayuda de atajos de teclado (?) ==============================
// Autocontenido: sus textos van acá adentro (es/en/he) para no depender de i18n.js.
let shortcutsOverlayEl = null;
const SHORTCUTS_STRINGS = {
    es: { title: 'Atajos de teclado', grid: 'Cuadrícula', viewer: 'Visor de fotos', general: 'General', close: 'Cerrar',
          open: 'Abrir foto', range: 'Seleccionar un rango', selectall: 'Seleccionar todo lo visible', clearsel: 'Limpiar selección',
          navigate: 'Foto anterior / siguiente', favorite: 'Marcar favorito', trash: 'Mover a la papelera', info: 'Ver información',
          zoom: 'Acercar / alejar', zoomreset: 'Restablecer zoom', closeviewer: 'Cerrar el visor', help: 'Mostrar / ocultar esta ayuda' },
    en: { title: 'Keyboard shortcuts', grid: 'Grid', viewer: 'Photo viewer', general: 'General', close: 'Close',
          open: 'Open photo', range: 'Select a range', selectall: 'Select all visible', clearsel: 'Clear selection',
          navigate: 'Previous / next photo', favorite: 'Toggle favorite', trash: 'Move to trash', info: 'Show info',
          zoom: 'Zoom in / out', zoomreset: 'Reset zoom', closeviewer: 'Close viewer', help: 'Show / hide this help' },
    he: { title: 'קיצורי מקלדת', grid: 'רשת', viewer: 'מציג התמונות', general: 'כללי', close: 'סגירה',
          open: 'פתיחת תמונה', range: 'בחירת טווח', selectall: 'בחירת כל המוצג', clearsel: 'ניקוי הבחירה',
          navigate: 'תמונה קודמת / הבאה', favorite: 'סימון מועדף', trash: 'העברה לאשפה', info: 'הצגת מידע',
          zoom: 'הגדלה / הקטנה', zoomreset: 'איפוס זום', closeviewer: 'סגירת המציג', help: 'הצגה / הסתרה של עזרה זו' }
};
function toggleShortcutsHelp() { if (shortcutsOverlayEl) closeShortcutsHelp(); else showShortcutsHelp(); }
function closeShortcutsHelp() {
    if (!shortcutsOverlayEl) return;
    const el = shortcutsOverlayEl; shortcutsOverlayEl = null;
    el.classList.remove('confirm-visible');
    setTimeout(() => el.remove(), 200);
}
function showShortcutsHelp() {
    const lang = (typeof getCurrentLanguage === 'function' && getCurrentLanguage()) || 'es';
    const s = SHORTCUTS_STRINGS[lang] || SHORTCUTS_STRINGS.es;
    const sections = [
        { title: s.grid, items: [['Clic', s.open], ['Shift + Clic', s.range], ['Ctrl + A', s.selectall], ['Esc', s.clearsel]] },
        { title: s.viewer, items: [['← →', s.navigate], ['F', s.favorite], ['Supr', s.trash], ['I', s.info], ['+ / −', s.zoom], ['0', s.zoomreset], ['Esc', s.closeviewer]] },
        { title: s.general, items: [['?', s.help]] }
    ];
    const kbd = 'min-width:70px;text-align:center;font:12px/1.7 ui-monospace,monospace;background:var(--hover-bg,#eef0f4);border:1px solid var(--border-color,#d0d3d9);border-radius:6px;padding:2px 8px;color:var(--text-primary,#202124);';
    const body = sections.map(sec => `
        <div style="margin-bottom:14px;">
            <h4 style="margin:0 0 8px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-secondary,#5f6368);">${escapeHtml(sec.title)}</h4>
            ${sec.items.map(([k, d]) => `<div style="display:flex;align-items:center;gap:12px;padding:5px 0;"><kbd style="${kbd}">${escapeHtml(k)}</kbd><span style="font-size:14px;color:var(--text-primary,#202124);">${escapeHtml(d)}</span></div>`).join('')}
        </div>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box" role="dialog" aria-modal="true" style="max-width:460px;">
            <h3 class="confirm-title">${escapeHtml(s.title)}</h3>
            <div style="max-height:64vh;overflow:auto;text-align:start;">${body}</div>
            <div class="confirm-actions" style="margin-top:12px;"><button class="confirm-btn confirm-cancel">${escapeHtml(s.close)}</button></div>
        </div>`;
    document.body.appendChild(overlay);
    shortcutsOverlayEl = overlay;
    requestAnimationFrame(() => overlay.classList.add('confirm-visible'));
    overlay.querySelector('.confirm-cancel').addEventListener('click', closeShortcutsHelp);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeShortcutsHelp(); });
}

// Selecciona todas las fotos de la vista actual (respetando el contexto: papelera/álbum).
function selectAllVisible() {
    if (!currentGridPhotos || currentGridPhotos.length === 0) return;
    currentGridPhotos.forEach(p => {
        selectedIds.add(p.id);
        const el = document.querySelector(`.photo-item[data-id="${p.id}"]`);
        if (el) el.classList.add('selected');
    });
    lastSelectedPhotoId = currentGridPhotos[currentGridPhotos.length - 1].id;
    const wrapper = activeGridContainerEl && activeGridContainerEl.querySelector('.timeline-group');
    updateSelectionBar((wrapper && wrapper._options) || {});
}

function wireGlobalKeyboard() {
    document.addEventListener('keydown', (e) => {
        const lightboxVisible = document.getElementById('lightbox').style.display !== 'none';
        const tag = document.activeElement && document.activeElement.tagName;
        const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);

        // Ayuda de atajos: "?" (Shift + /). Funciona en cualquier lado salvo escribiendo.
        if (e.key === '?' && !typing) { e.preventDefault(); toggleShortcutsHelp(); return; }

        // Ctrl/Cmd + A → seleccionar todo lo visible (solo en la cuadrícula).
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !lightboxVisible && !typing) {
            if (currentGridPhotos && currentGridPhotos.length > 0) { e.preventDefault(); selectAllVisible(); }
            return;
        }

        if (e.key === 'Escape') {
            if (shortcutsOverlayEl) { closeShortcutsHelp(); return; }
            if (!lightboxVisible && selectedIds.size > 0) clearSelection();
        }
    });
}

function wireLangSwitcher() {
    const btn = document.getElementById('btnLangSwitch');
    const menu = document.getElementById('langMenu');

    menu.querySelectorAll('.lang-menu-item').forEach(item => {
        if (item.dataset.lang === getCurrentLanguage()) item.classList.add('active');
        item.addEventListener('click', () => {
            menu.classList.remove('open');
            setLanguage(item.dataset.lang);
        });
    });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!menu.classList.contains('open')) return;
        if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('open')) menu.classList.remove('open');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    wireNavigation();
    wireSearch();
    wireMobileSidebar();
    wireGridDensity();
    wireSelectionActionBar();
    wireSettingsPage();
    wirePeoplePage();
    wireAlbumsPages();
    wireTrashPage();
    wireGlobalKeyboard();
    wireLangSwitcher();
    wireYearNavInteraction();

    navigateTo('timeline');
    updateStorageInfo();
    pollScanStatus();
    startScanStatusPolling();
});

// ============================== API expuesta a otros scripts ==============================
// lightbox.js, face-scanner.js y video-scanner.js (cargados después de este archivo)
// usan estas funciones/variables globales para integrarse con la app principal.

window.refreshActiveView = refreshActiveView;
window.getCurrentGridPhotos = () => currentGridPhotos;
window.getSelectedIds = () => selectedIds;
