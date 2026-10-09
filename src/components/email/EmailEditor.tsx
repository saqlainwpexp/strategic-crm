"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Braces,
  Code2,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MERGE_TAGS } from "@/lib/email";

/** Rich text (or raw HTML) email body editor with merge-tag insertion. */
export function EmailEditor({
  value,
  onChange,
  placeholder = "Write your email…",
  minHeight = 320,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const [source, setSource] = useState(false);
  const last = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: { attributes: { class: "email-prose outline-none", style: `min-height:${minHeight}px` } },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      last.current = html;
      onChange(html);
    },
  });

  // Content replaced from outside (template picked, step switched): load it into the editor.
  useEffect(() => {
    if (editor && value !== last.current) {
      last.current = value;
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white focus-within:border-ink/30 focus-within:ring-4 focus-within:ring-black/[0.04]">
      <Toolbar editor={editor} source={source} onSource={() => setSource((s) => !s)} />
      {source ? (
        <textarea
          value={value}
          onChange={(e) => {
            last.current = e.target.value;
            onChange(e.target.value);
          }}
          spellCheck={false}
          className="block w-full resize-y bg-soft px-5 py-4 font-mono text-[12.5px] leading-relaxed text-ink outline-none"
          style={{ minHeight }}
          aria-label="Email HTML"
        />
      ) : (
        <div className="px-6 py-5">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor, source, onSource }: { editor: Editor | null; source: boolean; onSource: () => void }) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const off = source || !editor;
  const btn = (icon: LucideIcon, label: string, run: () => void, active = false) => {
    const Icon = icon;
    return (
      <button
        key={label}
        type="button"
        title={label}
        aria-label={label}
        disabled={off}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition-colors disabled:opacity-35",
          active ? "bg-ink text-white" : "text-neutral-600 hover:bg-page hover:text-ink"
        )}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
      </button>
    );
  };
  const chain = () => editor!.chain().focus();
  const is = (name: string, attrs?: Record<string, unknown>) => !!editor?.isActive(name, attrs);

  const setLink = () => {
    const prev = (editor?.getAttributes("link").href as string) ?? "";
    const url = window.prompt("Link address (leave empty to remove)", prev || "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") chain().unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };
  const addImage = () => {
    const url = window.prompt("Image address (https://…)");
    if (url && /^https?:\/\//i.test(url.trim())) chain().setImage({ src: url.trim() }).run();
  };
  const insertTag = (tag: string) => {
    setTagsOpen(false);
    if (editor && !source) chain().insertContent(tag).run();
  };

  const sep = <span className="mx-1 h-5 w-px bg-neutral-200" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-100 bg-white px-3 py-2">
      {btn(Bold, "Bold", () => chain().toggleBold().run(), is("bold"))}
      {btn(Italic, "Italic", () => chain().toggleItalic().run(), is("italic"))}
      {btn(UnderlineIcon, "Underline", () => chain().toggleUnderline().run(), is("underline"))}
      {btn(Link2, "Link", setLink, is("link"))}
      {sep}
      {btn(Heading2, "Heading", () => chain().toggleHeading({ level: 2 }).run(), is("heading", { level: 2 }))}
      {btn(List, "Bullet list", () => chain().toggleBulletList().run(), is("bulletList"))}
      {btn(ListOrdered, "Numbered list", () => chain().toggleOrderedList().run(), is("orderedList"))}
      {btn(Quote, "Quote", () => chain().toggleBlockquote().run(), is("blockquote"))}
      {sep}
      {btn(AlignLeft, "Align left", () => chain().setTextAlign("left").run(), is("paragraph", { textAlign: "left" }))}
      {btn(AlignCenter, "Align centre", () => chain().setTextAlign("center").run(), is("paragraph", { textAlign: "center" }))}
      {btn(ImagePlus, "Image", addImage)}
      {sep}
      {btn(Undo2, "Undo", () => chain().undo().run())}
      {btn(Redo2, "Redo", () => chain().redo().run())}

      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            disabled={off}
            onClick={() => setTagsOpen((o) => !o)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-page px-3 text-[12.5px] text-ink transition-colors hover:bg-neutral-200/70 disabled:opacity-40"
          >
            <Braces className="h-3.5 w-3.5" /> Personalise
          </button>
          {tagsOpen && (
            <div className="animate-pop-in absolute right-0 top-[calc(100%+8px)] z-30 w-[240px] rounded-2xl bg-white p-2 shadow-[0_24px_64px_-12px_rgba(10,10,10,0.25),0_0_0_1px_rgba(10,10,10,0.05)]">
              {MERGE_TAGS.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertTag(t.tag)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-page"
                >
                  {t.label}
                  <code className="text-[11px] text-neutral-400">{t.tag}</code>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onSource}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] transition-colors",
            source ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200/70"
          )}
        >
          <Code2 className="h-3.5 w-3.5" /> HTML
        </button>
      </div>
    </div>
  );
}
