/** Resolve the actual character card, never the API's generated text or HTML. */
export function resolvePortrait(context) {
    const characters = context?.characters ?? [];
    const character = context?.characterId !== undefined && context?.characterId !== null
        ? characters[context.characterId] : null;
    let selected = character;
    if (context?.groupId) {
        const group = context.groups?.find(group => String(group.id) === String(context.groupId));
        const messages = context.chat ?? [];
        const last = [...messages].reverse().find(message => !message.is_user && !message.is_system);
        let avatar = last?.original_avatar;
        if (!avatar && last?.force_avatar) {
            try {
                const url = new URL(last.force_avatar, 'https://sillytavern.invalid/');
                avatar = url.pathname.endsWith('/thumbnail')
                    ? url.searchParams.get('file')
                    : decodeURIComponent(url.pathname.split('/').pop());
            } catch { /* Malformed message avatars are ignored. */ }
        }
        selected = avatar ? characters.find(item => item?.avatar === avatar) : null;
        if (!selected && last?.name) {
            selected = characters.find(item => item?.name === last.name && group?.members?.includes(item.avatar));
        }
        if (!selected) selected = characters.find(item => group?.members?.includes(item?.avatar));
    }
    if (!selected) return null;
    const name = String(selected.name || selected.data?.name || 'Character');
    const avatar = selected.avatar;
    const source = avatar && avatar !== 'none' ? `/characters/${encodeURIComponent(avatar)}` : null;
    return { name, source, key: String(avatar || name), group: Boolean(context?.groupId) };
}

export function isPortraitTheme(context, document) {
    const css = context?.powerUserSettings?.custom_css;
    if (typeof css === 'string') return css.includes('BooksOriginal-Portrait-v1');
    return Boolean(document.getElementById('custom-style')?.textContent.includes('BooksOriginal-Portrait-v1'));
}
