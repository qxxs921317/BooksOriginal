import { getContext } from '../../../extensions.js';
import { isPortraitTheme, resolvePortrait } from './portrait-core.js';

const FOLD_KEY = 'books-original-portrait:mobile-folded:v1';
const POSITION_PREFIX = 'books-original-portrait:mobile-position:v1:';
const DEFAULT_POSITION = 30;
const positionCache = new Map();
const mq = matchMedia('(max-width: 767px)');
let folded = false;
try { folded = localStorage.getItem(FOLD_KEY) === 'true'; } catch { /* Private browser mode. */ }
let panel, masthead, modal, image, modalImage, coverName, summaryName, foldLabel, status;
let positionControls, positionInput, positionReset;
let activeKey = '', activeSource = '', sequence = 0, queued = false, lastTheme = null;
let customStyle, chatElement;
const themeObserver = new MutationObserver(schedule);
const chatObserver = new MutationObserver(records => {
    // Child lists on #chat only: streaming text does not rebuild the photo panel.
    if (records.some(record => record.type === 'childList' || record.attributeName === 'ch_name')) schedule();
});

function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function normalizePosition(value) {
    const numeric = Number(value);
    return value === null || value === '' || !Number.isFinite(numeric)
        ? DEFAULT_POSITION : Math.min(100, Math.max(0, Math.round(numeric)));
}

function loadPosition(key) {
    if (positionCache.has(key)) return positionCache.get(key);
    let value = DEFAULT_POSITION;
    try { value = normalizePosition(localStorage.getItem(POSITION_PREFIX + encodeURIComponent(key))); } catch { /* Use in-memory preferences when storage is unavailable. */ }
    positionCache.set(key, value);
    return value;
}

function applyPosition(value, save = false) {
    const position = normalizePosition(value);
    panel.style.setProperty('--bop-mobile-y', `${position}%`);
    positionInput.value = String(position);
    positionInput.setAttribute('aria-valuetext', `위쪽에서 ${position}%`);
    if (save && activeKey) {
        positionCache.set(activeKey, position);
        try { localStorage.setItem(POSITION_PREFIX + encodeURIComponent(activeKey), String(position)); } catch { /* Keep the current session's selection. */ }
    }
}

function setPositionAvailable(available) {
    positionControls.hidden = !available;
    positionInput.disabled = !available;
    positionReset.disabled = !available;
}

function updateFold() {
    if (!panel) return;
    const open = !mq.matches || !folded;
    if (panel.open !== open) panel.open = open;
    foldLabel.textContent = open ? '사진 접기' : '사진 펼치기';
    summaryName.textContent = mq.matches ? 'BooksOriginal'
        : panel.dataset.group === 'true' ? 'GROUP PORTRAIT' : 'CHARACTER PORTRAIT';
}

function mount(sheld) {
    if (panel?.isConnected) return;
    masthead = create('header', 'bop-masthead');
    masthead.id = 'bop-masthead';
    masthead.append(create('span', 'bop-wordmark', 'BooksOriginal'));

    panel = create('details', 'bop-cover');
    panel.id = 'bop-cover';
    panel.setAttribute('aria-label', '캐릭터 사진');
    const summary = create('summary', 'bop-summary');
    summaryName = create('span', 'bop-summary-name', 'CHARACTER PORTRAIT');
    foldLabel = create('span', 'bop-fold-label', '사진 접기');
    summary.append(summaryName, foldLabel);

    const figure = create('figure', 'bop-figure');
    const frame = create('div', 'bop-frame');
    const photoButton = create('button', 'bop-photo-button');
    photoButton.type = 'button';
    photoButton.setAttribute('aria-label', '캐릭터 사진 원본 크게 보기');
    photoButton.title = '사진을 누르면 원본을 크게 볼 수 있어요';
    image = create('img', 'bop-image');
    image.decoding = 'async';
    image.alt = '';
    status = create('span', 'bop-photo-status', '등록된 캐릭터 사진이 없어요');
    status.setAttribute('role', 'status');
    photoButton.append(image, status);
    const credit = create('div', 'bop-photo-credit');
    credit.append(create('span', '', 'CHARACTER PORTRAIT'), create('span', '', '✧'));
    frame.append(photoButton, credit);
    const caption = create('figcaption', 'bop-caption');
    coverName = create('div', 'bop-name');
    const captionRule = create('div', 'bop-caption-rule');
    captionRule.setAttribute('aria-hidden', 'true');
    caption.append(coverName, captionRule);
    figure.append(frame, caption);
    positionControls = create('div', 'bop-position-controls');
    positionControls.setAttribute('role', 'group');
    positionControls.setAttribute('aria-label', '사진 상하 위치');
    const topLabel = create('span', 'bop-position-end', '위');
    const bottomLabel = create('span', 'bop-position-end', '아래');
    topLabel.setAttribute('aria-hidden', 'true');
    bottomLabel.setAttribute('aria-hidden', 'true');
    positionInput = create('input', 'bop-position-slider');
    positionInput.id = 'bop-position-slider';
    positionInput.type = 'range';
    positionInput.min = '0';
    positionInput.max = '100';
    positionInput.step = '1';
    positionInput.value = String(DEFAULT_POSITION);
    positionInput.setAttribute('aria-label', '사진 상하 위치');
    positionReset = create('button', 'bop-position-reset', '초기화');
    positionReset.type = 'button';
    positionReset.setAttribute('aria-label', '사진 위치 초기화');
    positionControls.append(topLabel, positionInput, bottomLabel, positionReset);
    panel.append(summary, figure, positionControls);
    setPositionAvailable(false);
    positionInput.addEventListener('input', () => {
        if (mq.matches && activeSource && !positionInput.disabled) applyPosition(positionInput.value);
    });
    positionInput.addEventListener('change', () => {
        if (mq.matches && activeSource && !positionInput.disabled) applyPosition(positionInput.value, true);
    });
    positionReset.addEventListener('click', () => {
        if (mq.matches && activeSource) applyPosition(DEFAULT_POSITION, true);
    });
    const chat = sheld.querySelector('#chat');
    sheld.insertBefore(masthead, chat);
    sheld.insertBefore(panel, chat);

    modal = create('dialog', 'bop-lightbox');
    modal.id = 'bop-lightbox';
    modal.setAttribute('aria-label', '캐릭터 사진 원본');
    const close = create('button', 'bop-lightbox-close', '닫기 ×');
    close.type = 'button';
    modalImage = create('img', 'bop-lightbox-image');
    modal.append(close, modalImage);
    document.body.append(modal);
    close.addEventListener('click', () => modal.close());
    modal.addEventListener('click', event => {
        if (event.target === modal) modal.close();
    });
    photoButton.addEventListener('click', () => {
        if (!activeSource || !image.complete || !image.naturalWidth) return;
        modalImage.src = activeSource;
        modalImage.alt = image.alt;
        if (typeof modal.showModal === 'function') modal.showModal();
    });
    summary.addEventListener('click', event => {
        event.preventDefault();
        if (!mq.matches) return;
        folded = !folded;
        try { localStorage.setItem(FOLD_KEY, String(folded)); } catch { /* UI works without storage. */ }
        updateFold();
    });
    updateFold();
}

function showPortrait(portrait) {
    panel.dataset.group = String(portrait.group);
    coverName.textContent = portrait.name;
    image.alt = `${portrait.name} 캐릭터 사진`;
    summaryName.textContent = portrait.group ? 'GROUP PORTRAIT' : 'CHARACTER PORTRAIT';
    if (activeKey === portrait.key && activeSource === portrait.source) return;
    const previousSource = activeSource;
    activeKey = portrait.key;
    activeSource = portrait.source;
    applyPosition(loadPosition(activeKey));
    setPositionAvailable(false);
    const current = ++sequence;
    image.onload = image.onerror = null;
    image.removeAttribute('src');
    image.hidden = true;
    status.hidden = false;
    status.textContent = portrait.source ? '사진 불러오는 중…' : '등록된 캐릭터 사진이 없어요';
    if (modal.open) modal.close();
    if (!portrait.source) return;
    image.onload = () => {
        if (sequence !== current) return;
        image.hidden = false;
        status.hidden = true;
        setPositionAvailable(true);
    };
    image.onerror = () => {
        if (sequence !== current) return;
        image.hidden = true;
        status.hidden = false;
        setPositionAvailable(false);
        status.textContent = '사진을 불러오지 못했어요. 캐릭터 사진을 확인해 주세요.';
    };
    image.src = portrait.source;
    // Invalidate cached cards when the same file is explicitly refreshed by ST.
    if (previousSource === portrait.source && image.complete && image.naturalWidth) image.onload();
}

function refresh() {
    queued = false;
    let context;
    try { context = getContext(); } catch { return; }
    if (customStyle !== document.getElementById('custom-style')) {
        customStyle = document.getElementById('custom-style');
        themeObserver.disconnect();
        if (customStyle) themeObserver.observe(customStyle, { childList: true, subtree: true, characterData: true });
    }
    const active = isPortraitTheme(context, document);
    if (active !== lastTheme) {
        document.body.classList.toggle('bop-active', active);
        lastTheme = active;
    }
    if (!active) {
        if (modal?.open) modal.close();
        return;
    }
    const sheld = document.getElementById('sheld');
    if (!sheld) return;
    mount(sheld);
    if (chatElement !== document.getElementById('chat')) {
        chatElement = document.getElementById('chat');
        chatObserver.disconnect();
        if (chatElement) chatObserver.observe(chatElement, { childList: true });
    }
    const portrait = resolvePortrait(context);
    document.body.classList.toggle('bop-has-portrait', Boolean(portrait));
    panel.hidden = !portrait;
    if (portrait) showPortrait(portrait);
    else {
        ++sequence;
        activeKey = activeSource = '';
        image.onload = image.onerror = null;
        image.removeAttribute('src');
        image.hidden = true;
        setPositionAvailable(false);
        coverName.textContent = '';
        if (modal?.open) modal.close();
    }
    updateFold();
}

function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(refresh);
}

function boot() {
    const context = getContext();
    const names = ['APP_READY', 'CHAT_CHANGED', 'CHARACTER_EDITED', 'CHARACTER_EDITED_PORTRAIT', 'CHARACTER_SELECTED', 'MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'SETTINGS_UPDATED', 'UI_SETTINGS_UPDATED', 'THEME_CHANGED'];
    for (const name of names) {
        const event = context.eventTypes?.[name];
        if (event) context.eventSource?.on(event, schedule);
    }
    const edited = context.eventTypes?.CHARACTER_EDITED;
    if (edited) context.eventSource?.on(edited, () => { activeKey = ''; schedule(); });
    document.addEventListener('change', event => {
        if (event.target?.matches?.('#themes, #theme_select, #ui-preset-select')) schedule();
    });
    document.addEventListener('input', event => {
        if (event.target?.matches?.('#customCSS')) schedule();
    });
    // Observe replacement/creation of the custom theme style, never the entire chat subtree.
    new MutationObserver(schedule).observe(document.head, { childList: true });
    mq.addEventListener?.('change', updateFold);
    if (!mq.addEventListener && mq.addListener) mq.addListener(updateFold);
    refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
