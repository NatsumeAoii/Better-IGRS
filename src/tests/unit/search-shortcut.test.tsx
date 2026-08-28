import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSearchShortcut } from '@/features/search/use-search-shortcut';

describe('useSearchShortcut', () => {
  it('does not intercept slash inside contenteditable content', () => {
    const input = document.createElement('input');
    input.id = 'shortcut-search-input';
    document.body.appendChild(input);
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    editor.tabIndex = 0;
    const child = document.createElement('span');
    editor.appendChild(child);
    document.body.appendChild(editor);
    renderHook(() => useSearchShortcut('shortcut-search-input'));
    editor.focus();

    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '/' });
    child.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
    editor.remove();
    input.remove();
  });
});
