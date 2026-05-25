import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

const ToolbarButton = ({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={cn(
      "px-2 py-1 rounded text-sm font-medium transition-colors",
      active
        ? "bg-blue-600 text-white"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    )}
  >
    {children}
  </button>
);

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your description here…",
  className,
  readOnly = false,
}: RichTextEditorProps) {
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

  if (!editor) return null;

  if (readOnly) {
    return (
      <div
        className={cn("prose prose-sm max-w-none", className)}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  return (
    <div className={cn("border border-gray-200 rounded-lg overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline (Ctrl+U)"
        >
          <span className="underline">U</span>
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          ≡
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          1.
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton
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
          ⊞
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton
          onClick={() => {
            const url = window.prompt("Enter URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
          title="Insert link"
        >
          🔗
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove link"
          active={false}
        >
          ✂
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
          active={false}
        >
          ↩
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
          active={false}
        >
          ↪
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="min-h-[180px] max-h-[400px] overflow-y-auto px-4 py-3 prose prose-sm max-w-none focus-within:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}
