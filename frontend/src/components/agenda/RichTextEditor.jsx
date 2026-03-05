import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    ImagePlus,
    Italic,
    List,
    ListOrdered,
    Table2,
    Underline,
} from 'lucide-react';
import { cn } from '../../lib/utils';

function createTableMarkup(rows, cols) {
    const safeRows = Math.max(1, Math.min(8, Number(rows) || 2));
    const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));

    const headCells = Array.from(
        { length: safeCols },
        () => '<th style="border:1px solid #334155;padding:6px;background-color:#1e293b;color:#e2e8f0;">헤더</th>'
    ).join('');
    const bodyRows = Array.from({ length: safeRows }, () => {
        const cells = Array.from(
            { length: safeCols },
            () => '<td style="border:1px solid #334155;padding:6px;color:#e2e8f0;">내용</td>'
        ).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `
        <table style="width:100%;border-collapse:collapse;margin:12px 0;">
            <thead><tr>${headCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

function stripHtml(value) {
    if (!value) return '';
    const el = document.createElement('div');
    el.innerHTML = value;
    return (el.textContent || el.innerText || '').trim();
}

function ToolbarButton({ onClick, title, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:bg-secondary/60"
        >
            {children}
        </button>
    );
}

export default function RichTextEditor({
    value,
    onChange,
    placeholder = '내용을 입력하세요.',
    minHeight = 260,
    className,
}) {
    const editorRef = useRef(null);
    const imageInputRef = useRef(null);
    const [fontSize, setFontSize] = useState('3');
    const [fontColor, setFontColor] = useState('#e2e8f0');

    const plainText = useMemo(() => stripHtml(value), [value]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if ((editor.innerHTML || '') === (value || '')) return;
        editor.innerHTML = value || '';
    }, [value]);

    const focusEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
    };

    const exec = (command, commandValue = null) => {
        focusEditor();
        document.execCommand(command, false, commandValue);
        const editor = editorRef.current;
        if (!editor) return;
        onChange(editor.innerHTML, stripHtml(editor.innerHTML));
    };

    const handleEditorInput = () => {
        const editor = editorRef.current;
        if (!editor) return;
        onChange(editor.innerHTML, stripHtml(editor.innerHTML));
    };

    const insertImageFromFile = (file) => {
        if (!file) return;
        if (!file.type?.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = () => {
            exec('insertImage', reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handlePaste = (event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type?.startsWith('image/'));
        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        event.preventDefault();
        insertImageFromFile(file);
    };

    const handleInsertTable = () => {
        const rows = window.prompt('행 수를 입력하세요.', '2');
        if (rows == null) return;
        const cols = window.prompt('열 수를 입력하세요.', '2');
        if (cols == null) return;
        exec('insertHTML', createTableMarkup(rows, cols));
    };

    const handleImageFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (file) insertImageFromFile(file);
        event.target.value = '';
    };

    return (
        <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/60 p-2">
                <div className="flex items-center gap-1 rounded border border-border bg-card p-1">
                    <ToolbarButton title="굵게" onClick={() => exec('bold')}>
                        <Bold className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton title="기울임" onClick={() => exec('italic')}>
                        <Italic className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton title="밑줄" onClick={() => exec('underline')}>
                        <Underline className="h-4 w-4" />
                    </ToolbarButton>
                </div>

                <div className="flex items-center gap-1 rounded border border-border bg-card p-1">
                    <ToolbarButton title="왼쪽 정렬" onClick={() => exec('justifyLeft')}>
                        <AlignLeft className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton title="가운데 정렬" onClick={() => exec('justifyCenter')}>
                        <AlignCenter className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton title="오른쪽 정렬" onClick={() => exec('justifyRight')}>
                        <AlignRight className="h-4 w-4" />
                    </ToolbarButton>
                </div>

                <div className="flex items-center gap-1 rounded border border-border bg-card p-1">
                    <ToolbarButton title="글머리" onClick={() => exec('insertUnorderedList')}>
                        <List className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton title="번호" onClick={() => exec('insertOrderedList')}>
                        <ListOrdered className="h-4 w-4" />
                    </ToolbarButton>
                </div>

                <div className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1">
                    <label htmlFor="agenda-font-size" className="text-xs font-semibold text-muted-foreground">크기</label>
                    <select
                        id="agenda-font-size"
                        value={fontSize}
                        onChange={(event) => {
                            const next = event.target.value;
                            setFontSize(next);
                            exec('fontSize', next);
                        }}
                        className="rounded border border-border px-1 py-0.5 text-xs"
                    >
                        <option value="1">10</option>
                        <option value="2">12</option>
                        <option value="3">14</option>
                        <option value="4">16</option>
                        <option value="5">18</option>
                        <option value="6">24</option>
                    </select>
                </div>

                <div className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1">
                    <label htmlFor="agenda-font-color" className="text-xs font-semibold text-muted-foreground">색상</label>
                    <input
                        id="agenda-font-color"
                        type="color"
                        value={fontColor}
                        onChange={(event) => {
                            const next = event.target.value;
                            setFontColor(next);
                            exec('foreColor', next);
                        }}
                        className="h-6 w-8 cursor-pointer rounded border border-border"
                    />
                </div>

                <button
                    type="button"
                    onClick={handleInsertTable}
                    className="inline-flex h-8 items-center gap-1 rounded border border-border bg-card px-2 text-xs font-semibold text-foreground/85 hover:bg-secondary/60"
                >
                    <Table2 className="h-4 w-4" /> 표
                </button>

                <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="inline-flex h-8 items-center gap-1 rounded border border-border bg-card px-2 text-xs font-semibold text-foreground/85 hover:bg-secondary/60"
                >
                    <ImagePlus className="h-4 w-4" /> 이미지
                </button>

                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageFileSelect}
                />

                <span className="ml-auto text-[11px] text-muted-foreground/80">텍스트 편집기</span>
            </div>

            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onPaste={handlePaste}
                className="prose max-w-none whitespace-pre-wrap break-words px-4 py-3 text-sm text-foreground/90 focus:outline-none"
                style={{ minHeight }}
                data-placeholder={placeholder}
            />

            {!plainText && !value && (
                <div className="pointer-events-none -mt-[calc(100%)] hidden" />
            )}
        </div>
    );
}
