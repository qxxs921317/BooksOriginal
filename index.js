import { getUserAvatar, user_avatar } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { isPortraitTheme, resolvePortrait } from './portrait-core.js';

const FOLD_KEY = 'books-original-portrait:mobile-folded:v1';
const POSITION_PREFIX = 'books-original-portrait:mobile-position:v1:';
const HEIGHT_KEY = 'books-original-portrait:mobile-height:v1';
const LOCK_HEIGHT_KEY = 'books-original-portrait:lock-mobile-height:v1';
const PERSONA_KEY = 'books-original-portrait:show-persona-while-writing:v1';
const DEFAULT_POSITION = 30;
const DEFAULT_HEIGHT = 100;
const MIN_HEIGHT = 50;
const MAX_HEIGHT = 140;
const positionCache = new Map();
const mq = matchMedia('(max-width: 767px)');
let folded = false;
try { folded = localStorage.getItem(FOLD_KEY) === 'true'; } catch { /* Private browser mode. */ }
let showPersonaWhileWriting = false;
try { showPersonaWhileWriting = localStorage.getItem(PERSONA_KEY) === 'true'; } catch { /* Private browser mode. */ }
let lockMobileHeight = false;
try { lockMobileHeight = localStorage.getItem(LOCK_HEIGHT_KEY) === 'true'; } catch { /* Private browser mode. */ }
let mobileHeight = DEFAULT_HEIGHT;
try {
    const savedHeight = Number(localStorage.getItem(HEIGHT_KEY));
    if (Number.isInteger(savedHeight) && savedHeight >= MIN_HEIGHT && savedHeight <= MAX_HEIGHT) {
        mobileHeight = savedHeight;
    }
} catch { /* Keep the default when storage is unavailable. */ }
let panel, masthead, modal, image, modalImage, coverName, summaryName, foldLabel, status, creditLabel, photoButton;
let positionControls, positionInput, positionReset;
let activeKey = '', activeSource = '', sequence = 0, queued = false, lastTheme = null;
let unavailablePersonaSource = '';
let customStyle, chatElement;
let viewportWidth = window.innerWidth;
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

function applyMobileHeight() {
    panel?.style.setProperty('--bop-mobile-height-scale', String(mobileHeight / 100));
}

function updateKeyboardHeight(focused = document.activeElement?.id === 'send_textarea') {
    if (!panel) return;
    panel.style.removeProperty('--bop-mobile-photo-base');
    if (!lockMobileHeight || !mq.matches || !focused) return;

    // Focus occurs before the keyboard resizes the viewport. Preserve the base
    // height so the mobile height slider can still scale it.
    const height = Number.parseFloat(getComputedStyle(photoButton).height);
    if (height > 0) {
        panel.style.setProperty('--bop-mobile-photo-base', `${height * 100 / mobileHeight}px`);
    }
}

function mountSettings() {
    const container = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!container || document.getElementById('bop-settings')) return;

    const settings = create('details', 'extension_container');
    settings.id = 'bop-settings';
    const summary = create('summary', 'inline-drawer-header');
    const chevron = create('i', 'inline-drawer-icon fa-solid fa-circle-chevron-down');
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(create('b', '', 'BooksOriginal · Portrait'), chevron);

    const personaLabel = create('label', 'checkbox_label bop-persona-option');
    const personaCheckbox = create('input');
    personaCheckbox.type = 'checkbox';
    personaCheckbox.checked = showPersonaWhileWriting;
    personaCheckbox.addEventListener('change', () => {
        showPersonaWhileWriting = personaCheckbox.checked;
        try { localStorage.setItem(PERSONA_KEY, String(showPersonaWhileWriting)); } catch { /* Keep the current setting. */ }
        schedule();
    });
    personaLabel.append(personaCheckbox, create('span', '', '입력 중 페르소나 사진 표시'));

    const controls = create('div', 'bop-height-controls');
    const label = create('label', '', '모바일 사진 높이');
    const value = create('span');
    value.setAttribute('aria-hidden', 'true');
    const slider = create('input');
    slider.id = 'bop-height-slider';
    slider.type = 'range';
    slider.min = String(MIN_HEIGHT);
    slider.max = String(MAX_HEIGHT);
    slider.value = String(mobileHeight);
    label.htmlFor = slider.id;
    const updateHeight = () => {
        mobileHeight = slider.valueAsNumber;
        value.textContent = `${mobileHeight}%`;
        slider.setAttribute('aria-valuetext', `기본 높이의 ${mobileHeight}%`);
        applyMobileHeight();
    };
    updateHeight();
    slider.addEventListener('input', updateHeight);
    slider.addEventListener('change', () => {
        updateHeight();
        try { localStorage.setItem(HEIGHT_KEY, String(mobileHeight)); } catch { /* Keep the current height. */ }
    });
    controls.append(label, value, slider);

    const lockLabel = create('label', 'checkbox_label bop-mobile-height-lock');
    const lockCheckbox = create('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.checked = lockMobileHeight;
    lockCheckbox.addEventListener('change', () => {
        lockMobileHeight = lockCheckbox.checked;
        try { localStorage.setItem(LOCK_HEIGHT_KEY, String(lockMobileHeight)); } catch { /* Keep the current setting. */ }
        updateKeyboardHeight();
    });
    lockLabel.append(lockCheckbox, create('span', '', '키보드가 열려도 초상화 높이 유지'));
    settings.append(summary, personaLabel, controls, lockLabel);
    container.append(settings);
}

function updateFold() {
    if (!panel) return;
    const open = !mq.matches || !folded;
    if (panel.open !== open) panel.open = open;
    foldLabel.textContent = open ? 'ON' : 'OFF';
    summaryName.textContent = mq.matches ? 'BooksOriginal'
        : panel.dataset.persona === 'true' ? 'PERSONA PORTRAIT'
            : panel.dataset.group === 'true' ? 'GROUP PORTRAIT' : 'CHARACTER PORTRAIT';
}

function mount(sheld) {
    if (panel?.isConnected) return;
    masthead = create('header', 'bop-masthead');
    masthead.id = 'bop-masthead';
    masthead.append(create('span', 'bop-wordmark', 'BooksOriginal'));

    panel = create('details', 'bop-cover');
    panel.id = 'bop-cover';
    panel.setAttribute('aria-label', '초상 사진');
    applyMobileHeight();
    const summary = create('summary', 'bop-summary');
    summaryName = create('span', 'bop-summary-name', 'CHARACTER PORTRAIT');
    foldLabel = create('span', 'bop-fold-label');
    summary.append(summaryName, foldLabel);

    const figure = create('figure', 'bop-figure');
    const frame = create('div', 'bop-frame');
    photoButton = create('button', 'bop-photo-button');
    photoButton.type = 'button';
    photoButton.setAttribute('aria-label', '사진 원본 크게 보기');
    photoButton.title = '사진을 누르면 원본을 크게 볼 수 있어요';
    image = create('img', 'bop-image');
    image.decoding = 'async';
    image.alt = '';
    status = create('span', 'bop-photo-status', '등록된 캐릭터 사진이 없어요');
    status.setAttribute('role', 'status');
    photoButton.append(image, status);
    const credit = create('div', 'bop-photo-credit');
    creditLabel = create('span', '', 'CHARACTER PORTRAIT');
    credit.append(creditLabel, create('span', '', '✧'));
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
    const topLabel = create('span', 'bop-position-end', 'UP');
    const bottomLabel = create('span', 'bop-position-end', 'DOWN');
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
    positionReset = create('button', 'bop-position-reset', '↺');
    positionReset.type = 'button';
    positionReset.setAttribute('aria-label', '사진 위치 초기화');
    positionReset.title = '사진 위치 초기화';
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
    updateKeyboardHeight();

    modal = create('dialog', 'bop-lightbox');
    modal.id = 'bop-lightbox';
    modal.setAttribute('aria-label', '사진 원본');
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
    panel.dataset.persona = String(Boolean(portrait.persona));
    coverName.textContent = portrait.name;
    image.alt = `${portrait.name} ${portrait.persona ? '페르소나' : '캐릭터'} 사진`;
    creditLabel.textContent = portrait.persona ? 'PERSONA PORTRAIT' : 'CHARACTER PORTRAIT';
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
        if (portrait.persona) {
            unavailablePersonaSource = portrait.source;
            schedule();
            return;
        }
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
    const characterPortrait = resolvePortrait(context);
    const isWriting = showPersonaWhileWriting && document.getElementById('send_textarea')?.value.trim();
    if (!isWriting) unavailablePersonaSource = '';
    let portrait = characterPortrait;
    if (characterPortrait && isWriting && user_avatar) {
        const source = `/${getUserAvatar(encodeURIComponent(user_avatar))}`;
        if (source !== unavailablePersonaSource) {
            portrait = { name: context.name1 || 'Persona', source, key: source, group: false, persona: true };
        }
    }
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
    mountSettings();
    const names = ['APP_READY', 'CHAT_CHANGED', 'CHARACTER_EDITED', 'CHARACTER_EDITED_PORTRAIT', 'CHARACTER_SELECTED', 'MESSAGE_SENT', 'MESSAGE_RECEIVED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'PERSONA_CHANGED', 'PERSONA_RENAMED', 'SETTINGS_UPDATED', 'UI_SETTINGS_UPDATED', 'THEME_CHANGED'];
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
        if (event.target?.matches?.('#customCSS') || (showPersonaWhileWriting && event.target?.id === 'send_textarea')) schedule();
    });
    document.addEventListener('focusin', event => {
        if (event.target?.id === 'send_textarea') updateKeyboardHeight(true);
    });
    document.addEventListener('focusout', event => {
        if (event.target?.id === 'send_textarea') updateKeyboardHeight(false);
    });
    window.addEventListener('resize', () => {
        // Height-only resizes include the soft keyboard. Re-measure on a width
        // change so a rotation does not keep the previous orientation's size.
        if (window.innerWidth === viewportWidth) return;
        viewportWidth = window.innerWidth;
        updateKeyboardHeight();
    });
    // Observe replacement/creation of the custom theme style, never the entire chat subtree.
    new MutationObserver(schedule).observe(document.head, { childList: true });
    mq.addEventListener?.('change', updateFold);
    if (!mq.addEventListener && mq.addListener) mq.addListener(updateFold);
    refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
