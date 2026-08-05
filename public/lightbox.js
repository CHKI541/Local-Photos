// ============================================================
// lightbox.js — Visor a pantalla completa de fotos y videos.
// Se apoya en las funciones globales de app.js (navigateTo, Toast,
// API, escapeHtml, etc.) que ya están cargadas para este punto.
// ============================================================

let lightboxPhotos = [];
let lightboxIndex = 0;
let slideshowActive = false;
let slideshowTimer = null;

let zoomLevel = 1;
let panX = 0, panY = 0;
let isDragging = false;
let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

function openLightboxAt(photos, index, options) {
    if (!photos || photos.length === 0) return;
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();

    lightboxPhotos = photos;
    lightboxIndex = Math.max(0, Math.min(index || 0, photos.length - 1));

    document.getElementById('lightbox').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    renderLightboxItem();
}
window.openLightboxAt = openLightboxAt;

function closeLightbox() {
    stopSlideshow();
    document.getElementById('lightbox').style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('lightboxInfoPanel').classList.remove('visible');
    document.getElementById('lightboxInfoToggle').classList.remove('active');
    const video = document.getElementById('lightboxVideo');
    video.pause();
    video.removeAttribute('src');
    video.load();
}

function navigateLightbox(delta) {
    if (lightboxPhotos.length <= 1) return;
    lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
    renderLightboxItem();
}

// ============================== Render del item actual ==============================

function renderLightboxItem() {
    const photo = lightboxPhotos[lightboxIndex];
    if (!photo) { closeLightbox(); return; }

    resetZoom();
    document.getElementById('lightboxVideoFallback').style.display = 'none';

    const img = document.getElementById('lightboxImage');
    const video = document.getElementById('lightboxVideo');
    const zoomWrap = document.getElementById('lightboxZoomWrap');

    if (photo.isVideo) {
        img.style.display = 'none';
        zoomWrap.classList.remove('can-zoom');
        video.style.display = 'block';
        video.src = `/api/photo/${photo.id}`;
        video.load();
        video.onerror = () => {
            video.style.display = 'none';
            document.getElementById('lightboxVideoFallback').style.display = 'flex';
        };
    } else {
        video.style.display = 'none';
        video.pause();
        img.style.display = 'block';
        zoomWrap.classList.add('can-zoom');
        loadImageProgressive(photo);
    }

    const showNav = lightboxPhotos.length > 1;
    document.getElementById('lightboxPrev').style.display = showNav ? 'flex' : 'none';
    document.getElementById('lightboxNext').style.display = showNav ? 'flex' : 'none';

    updateFavoriteIcon(photo.favorite);
    updateInfoPanel(photo);
    loadLightboxFaces(photo);
}

function loadImageProgressive(photo) {
    const img = document.getElementById('lightboxImage');
    img.style.opacity = '0.55';
    img.src = `/api/thumbnail?id=${photo.id}&size=400`;

    const full = new Image();
    full.onload = () => {
        if (lightboxPhotos[lightboxIndex] !== photo) return; // el usuario ya navegó a otra foto
        img.src = full.src;
        img.style.opacity = '1';
    };
    full.onerror = () => { img.style.opacity = '1'; };
    full.src = `/api/thumbnail?id=${photo.id}&size=1600`;
}

function updateFavoriteIcon(isFavorite) {
    const btn = document.getElementById('lightboxFavorite');
    const icon = btn.querySelector('i');
    if (isFavorite) {
        icon.className = 'fa-solid fa-star';
        btn.classList.add('active');
    } else {
        icon.className = 'fa-regular fa-star';
        btn.classList.remove('active');
    }
}

function updateInfoPanel(photo) {
    document.getElementById('lightboxFilename').textContent = photo.filename;
    document.getElementById('lightboxDate').textContent = `${formatDateLong(photo.dateTaken)} · ${formatTime(photo.dateTaken)}`;

    // El bloque de datos (cámara, ISO, dimensiones, peso, ruta) venía con
    // display:none fijo en el HTML y ningún código lo mostraba nunca: la ruta y las
    // dimensiones siempre existen, así que el panel de información debe mostrarlo.
    document.getElementById('lightboxExifBlock').style.display = 'flex';

    const camera = photo.camera;
    document.getElementById('exifCamera').textContent = (camera && (camera.make || camera.model))
        ? [camera.make, camera.model].filter(Boolean).join(' ')
        : (photo.isVideo ? t('lightbox_camera_video_label') : t('lightbox_camera_image_label'));

    const settingsParts = [];
    if (camera) {
        if (camera.focalLength) settingsParts.push(`${camera.focalLength}mm`);
        if (camera.fNumber) settingsParts.push(`f/${camera.fNumber}`);
        const shutter = formatShutterSpeed(camera.exposureTime);
        if (shutter) settingsParts.push(shutter);
        if (camera.iso) settingsParts.push(`ISO ${camera.iso}`);
    }
    document.getElementById('exifSettingsRow').style.display = settingsParts.length ? 'flex' : 'none';
    document.getElementById('exifSettings').textContent = settingsParts.join(' · ');

    if (photo.width && photo.height) {
        document.getElementById('exifDimsRow').style.display = 'flex';
        const durationSuffix = (photo.isVideo && photo.duration) ? ` · ${formatDuration(photo.duration)}` : '';
        document.getElementById('exifDims').textContent = `${photo.width} × ${photo.height}${durationSuffix}`;
    } else {
        document.getElementById('exifDimsRow').style.display = 'none';
    }

    document.getElementById('exifSizeRow').style.display = photo.size ? 'flex' : 'none';
    if (photo.size) document.getElementById('exifSize').textContent = formatBytes(photo.size);

    document.getElementById('exifPath').textContent = photo.path || '';
}

async function loadLightboxFaces(photo) {
    const container = document.getElementById('lightboxFaces');
    container.innerHTML = '';
    if (photo.isVideo) return;
    try {
        const faces = await API.get(`/api/photos/${photo.id}/faces`);
        if (lightboxPhotos[lightboxIndex] !== photo) return; // navegó a otra foto mientras cargaba
        faces.forEach(face => {
            const chip = document.createElement('div');
            chip.className = 'lightbox-face-chip';
            const img = document.createElement('img');
            img.className = 'lightbox-face-chip-img';
            img.src = `/api/face-image/${face.id}`;
            img.alt = '';
            const span = document.createElement('span');
            span.textContent = (face.name && face.name !== 'Sin nombre') ? face.name : t('unnamed_person');
            chip.appendChild(img);
            chip.appendChild(span);
            chip.addEventListener('click', () => {
                if (face.clusterId) { closeLightbox(); navigateTo('person-detail', { personId: face.clusterId }); }
            });
            container.appendChild(chip);
        });
    } catch (e) {
        // no crítico: si falla, simplemente no se muestran caras para esta foto
    }
}

// ============================== Acciones ==============================

async function toggleLightboxFavorite() {
    const photo = lightboxPhotos[lightboxIndex];
    if (!photo) return;
    const newState = !photo.favorite;
    photo.favorite = newState;
    updateFavoriteIcon(newState);
    try {
        await API.post('/api/photos/batch', { ids: [photo.id], action: newState ? 'favorite' : 'unfavorite' });
    } catch (e) {
        photo.favorite = !newState;
        updateFavoriteIcon(!newState);
        Toast.error(t('toast_favorite_error', { error: e.message }));
    }
}

async function trashCurrentFromLightbox() {
    const photo = lightboxPhotos[lightboxIndex];
    if (!photo) return;
    try {
        await API.post('/api/photos/batch', { ids: [photo.id], action: 'trash' });
        Toast.action(tn('toast_trashed', 1), t('toast_undo'), async () => {
            try {
                await API.post('/api/photos/batch', { ids: [photo.id], action: 'restore' });
                Toast.success(t('toast_restored'));
                if (typeof refreshActiveView === 'function') refreshActiveView();
            } catch (e) {
                Toast.error(t('toast_undo_error', { error: e.message }));
            }
        });

        lightboxPhotos.splice(lightboxIndex, 1);
        if (lightboxPhotos.length === 0) {
            closeLightbox();
        } else {
            if (lightboxIndex >= lightboxPhotos.length) lightboxIndex = 0;
            renderLightboxItem();
        }
        if (typeof refreshActiveView === 'function') refreshActiveView();
    } catch (e) {
        Toast.error(t('toast_trash_error', { error: e.message }));
    }
}

function downloadCurrentPhoto() {
    const photo = lightboxPhotos[lightboxIndex];
    if (!photo) return;
    const a = document.createElement('a');
    a.href = `/api/photo/${photo.id}`;
    a.download = photo.filename || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function openCurrentWithSystemApp() {
    const photo = lightboxPhotos[lightboxIndex];
    if (!photo) return;
    try {
        await API.post(`/api/photo/${photo.id}/open`, {});
        Toast.info(t('toast_lightbox_opening_system_app'));
    } catch (e) {
        Toast.error(t('toast_lightbox_open_error', { error: e.message }));
    }
}

function toggleInfoPanel() {
    const panel = document.getElementById('lightboxInfoPanel');
    const btn = document.getElementById('lightboxInfoToggle');
    const visible = panel.classList.toggle('visible');
    btn.classList.toggle('active', visible);
}

// ============================== Presentación (slideshow) ==============================

function toggleSlideshow() {
    if (slideshowActive) stopSlideshow();
    else startSlideshow();
}

// Orden aleatorio (Fisher-Yates) para la presentación: arranca desde la foto actual y
// no repite hasta recorrer todas; al agotarse, se vuelve a mezclar. La navegación
// manual (‹ ›) sigue siendo secuencial, sin tocar.
let slideshowOrder = [];
let slideshowPos = 0;
function buildShuffledOrder(excludeIdx) {
    const idxs = [];
    for (let i = 0; i < lightboxPhotos.length; i++) if (i !== excludeIdx) idxs.push(i);
    for (let i = idxs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    return idxs;
}
function slideshowAdvance() {
    if (slideshowPos >= slideshowOrder.length) {
        slideshowOrder = buildShuffledOrder(lightboxIndex);
        slideshowPos = 0;
        if (slideshowOrder.length === 0) return;
    }
    lightboxIndex = slideshowOrder[slideshowPos++];
    renderLightboxItem();
}

function startSlideshow() {
    if (lightboxPhotos.length <= 1) return;
    slideshowActive = true;
    const icon = document.querySelector('#lightboxSlideshow i');
    if (icon) icon.className = 'fa-solid fa-pause';
    slideshowOrder = buildShuffledOrder(lightboxIndex);
    slideshowPos = 0;
    slideshowTimer = setInterval(slideshowAdvance, 4000);
}

function stopSlideshow() {
    slideshowActive = false;
    const icon = document.querySelector('#lightboxSlideshow i');
    if (icon) icon.className = 'fa-solid fa-play';
    if (slideshowTimer) { clearInterval(slideshowTimer); slideshowTimer = null; }
}

// ============================== Zoom y desplazamiento (pan) ==============================

function applyZoomTransform() {
    const img = document.getElementById('lightboxImage');
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function resetZoom() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    document.getElementById('lightboxImage').style.transform = '';
    document.getElementById('lightboxZoomWrap').classList.remove('zoomed');
}

function setZoom(newZoom) {
    zoomLevel = Math.max(1, Math.min(4, newZoom));
    if (zoomLevel <= 1.02) {
        resetZoom();
        return;
    }
    document.getElementById('lightboxZoomWrap').classList.add('zoomed');
    applyZoomTransform();
}

function wireZoomAndPan() {
    const wrap = document.getElementById('lightboxZoomWrap');

    wrap.addEventListener('wheel', (e) => {
        const photo = lightboxPhotos[lightboxIndex];
        if (!photo || photo.isVideo) return;
        e.preventDefault();
        const delta = -e.deltaY * 0.0022;
        setZoom(zoomLevel + delta * Math.max(1, zoomLevel));
    }, { passive: false });

    wrap.addEventListener('dblclick', () => {
        const photo = lightboxPhotos[lightboxIndex];
        if (!photo || photo.isVideo) return;
        if (zoomLevel > 1) resetZoom();
        else setZoom(2.5);
    });

    wrap.addEventListener('mousedown', (e) => {
        if (zoomLevel <= 1) return;
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        panStartX = panX; panStartY = panY;
        wrap.classList.add('dragging');
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panX = panStartX + (e.clientX - dragStartX);
        panY = panStartY + (e.clientY - dragStartY);
        applyZoomTransform();
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        wrap.classList.remove('dragging');
    });
}

// ============================== Wiring general ==============================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('lightboxPrev').addEventListener('click', () => navigateLightbox(-1));
    document.getElementById('lightboxNext').addEventListener('click', () => navigateLightbox(1));
    document.getElementById('lightboxFavorite').addEventListener('click', toggleLightboxFavorite);
    document.getElementById('lightboxTrash').addEventListener('click', trashCurrentFromLightbox);
    document.getElementById('lightboxDownload').addEventListener('click', downloadCurrentPhoto);
    document.getElementById('lightboxInfoToggle').addEventListener('click', toggleInfoPanel);
    document.getElementById('lightboxSlideshow').addEventListener('click', toggleSlideshow);
    document.getElementById('lightboxOpenWindows').addEventListener('click', openCurrentWithSystemApp);
    document.getElementById('lightboxOpenWindowsFallback').addEventListener('click', openCurrentWithSystemApp);
    document.getElementById('lightboxAddAlbum').addEventListener('click', async () => {
        const photo = lightboxPhotos[lightboxIndex];
        if (!photo) return;
        await albumPickerDialog([photo.id]);
    });

    const btnEditDate = document.getElementById('btnEditLightboxDate');
    if (btnEditDate) {
        btnEditDate.addEventListener('click', async (e) => {
            e.stopPropagation();
            const photo = lightboxPhotos[lightboxIndex];
            if (!photo) return;
            const newDate = await datePickerDialog({
                title: t('lightbox_change_date_title'),
                initialDate: photo.dateTaken
            });
            if (!newDate) return;
            try {
                await API.post(`/api/photos/${photo.id}/date`, { dateTaken: newDate });
                photo.dateTaken = newDate;
                document.getElementById('lightboxDate').textContent = `${formatDateLong(newDate)} · ${formatTime(newDate)}`;
                Toast.success(t('toast_date_updated_one'));
                if (typeof window.refreshActiveView === 'function') window.refreshActiveView();
            } catch (err) {
                Toast.error(t('toast_date_update_error', { error: err.message }));
            }
        });
    }

    document.querySelector('#lightbox .lightbox-content').addEventListener('click', (e) => {
        if (e.target.closest('.lightbox-media-zoom-wrap')) return;
        closeLightbox();
    });

    wireZoomAndPan();

    document.addEventListener('keydown', (e) => {
        const lb = document.getElementById('lightbox');
        if (!lb || lb.style.display === 'none') return;
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;

        switch (e.key) {
            case 'Escape': closeLightbox(); break;
            case 'ArrowLeft': navigateLightbox(-1); break;
            case 'ArrowRight': navigateLightbox(1); break;
            case 'f': case 'F': toggleLightboxFavorite(); break;
            case 'Delete': case 'Backspace': trashCurrentFromLightbox(); break;
            case 'i': case 'I': toggleInfoPanel(); break;
            case '+': case '=': setZoom(zoomLevel + 0.5); break;
            case '-': case '_': setZoom(zoomLevel - 0.5); break;
            case '0': resetZoom(); break;
            default: return;
        }
        e.preventDefault();
    });
});
