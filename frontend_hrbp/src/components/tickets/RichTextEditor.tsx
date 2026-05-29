import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Table as TableIcon,
  Link as LinkIcon,
  Link2Off as LinkOff,
  Undo,
  Redo,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

function Sep() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 self-center flex-shrink-0" />;
}

function Btn({
  onClick,
  active,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      title={title}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded transition-colors flex-shrink-0",
        active
          ? "bg-blue-600 text-white"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
        disabled && "opacity-30 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your description here…",
  className,
  readOnly = false,
}: RichTextEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Keep content in sync when value prop changes externally (e.g. wizard reset)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // Focus link input when panel opens
  useEffect(() => {
    if (linkOpen) {
      // Pre-fill with existing href if cursor is on a link
      const existing = editor?.getAttributes("link").href ?? "";
      setLinkUrl(existing);
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [linkOpen, editor]);

  if (!editor) return null;

  if (readOnly) {
    return (
      <div
        className={cn("prose prose-sm max-w-none text-gray-800", className)}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  function applyLink() {
    const href = linkUrl.trim();
    if (!href) return;
    const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
    editor?.chain().focus().setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkUrl("");
  }

  function cancelLink() {
    setLinkOpen(false);
    setLinkUrl("");
    editor?.chain().focus().run();
  }

  return (
    <div
      className={cn(
        "border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
        <Btn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-3.5 h-3.5" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-3.5 h-3.5" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="w-3.5 h-3.5" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        <Btn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="Insert table"
          active={false}
        >
          <TableIcon className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        <Btn
          onClick={() => setLinkOpen((o) => !o)}
          active={editor.isActive("link") || linkOpen}
          title="Insert / edit link"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </Btn>
        <Btn
          onClick={() => {
            editor.chain().focus().unsetLink().run();
            setLinkOpen(false);
          }}
          title="Remove link"
          active={false}
          disabled={!editor.isActive("link")}
        >
          <LinkOff className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        <Btn
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo (Ctrl+Z)"
          active={false}
          disabled={!editor.can().undo()}
        >
          <Undo className="w-3.5 h-3.5" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo (Ctrl+Shift+Z)"
          active={false}
          disabled={!editor.can().redo()}
        >
          <Redo className="w-3.5 h-3.5" />
        </Btn>
      </div>

      {/* Inline link input row — appears below toolbar, no browser dialog */}
      {linkOpen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
          <LinkIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyLink(); }
              if (e.key === "Escape") cancelLink();
            }}
            placeholder="https://example.com"
            className="flex-1 text-sm bg-white border border-blue-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <button
            type="button"
            onClick={applyLink}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Check className="w-3 h-3" />
            Set
          </button>
          <button
            type="button"
            onClick={cancelLink}
            className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor area */}
      <div className="relative">
        <EditorContent
          editor={editor}
          className="min-h-[200px] max-h-[400px] overflow-y-auto px-4 py-3 prose prose-sm max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-gray-800 [&_.ProseMirror]:min-h-[160px]"
        />
        {editor.isEmpty && (
          <p className="absolute top-3 left-4 pointer-events-none select-none text-gray-400 text-sm">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}
