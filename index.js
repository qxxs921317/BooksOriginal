import { getContext } from '../../../extensions.js';
import { isPortraitTheme, resolvePortrait } from './portrait-core.js';

const FOLD_KEY = 'books-original-portrait:mobile-folded:v1';
const mq = matchMedia('(max-width: 767px)');
let folded = false;
try { folded = localStorage.getItem(FOLD_KEY) === 'true'; } catch { /* Private browser mode. */ }
let panel, masthead, modal, image, modalImage, coverName, summaryName, foldLabel, status;
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

function updateFold() {
    if (!panel) return;
    const open = !mq.matches || !folded;
    if (panel.open !== open) panel.open = open;
    foldLabel.textContent = open ? '사진 접기' : '사진 펼치기';
}

function mount(sheld) {
    if (panel?.isConnected) return;
    masthead = create('header', 'bop-masthead');
    masthead.id = 'bop-masthead';
    masthead.append(create('span', 'bop-wordmark', 'BooksOriginal'), create('span', 'bop-edition', 'A STORY TO REMEMBER'));

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
    const kicker = create('div', 'bop-kicker', 'THE PROTAGONIST');
    coverName = create('div', 'bop-name');
    caption.append(kicker, coverName, create('div', 'bop-tagline', 'SOME STORIES STAY WITH YOU.'), create('div', 'bop-caption-rule'), create('p', 'bop-motto', '다음 장에서도, 당신을 기다릴게.'));
    figure.append(frame, caption);
    panel.append(summary, figure);
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
    coverName.textContent = portrait.name;
    image.alt = `${portrait.name} 캐릭터 사진`;
    summaryName.textContent = portrait.group ? 'GROUP PORTRAIT' : 'CHARACTER PORTRAIT';
    if (activeKey === portrait.key && activeSource === portrait.source) return;
    const previousSource = activeSource;
    activeKey = portrait.key;
    activeSource = portrait.source;
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
    };
    image.onerror = () => {
        if (sequence !== current) return;
        image.hidden = true;
        status.hidden = false;
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
