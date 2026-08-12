import React from "react";
import { default as MarkdownRender } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/chatcn/ai/codeblock";

type MarkDownProps = {
  children: React.ReactNode;
  className?: string;
  theme?: string;
};

export function Markdown({ children, className, theme }: MarkDownProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-[13px] leading-relaxed dark:prose-invert",
        "prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
        "prose-a:font-medium prose-a:text-foreground prose-a:underline prose-a:underline-offset-2",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0",
        className
      )}
    >
      <MarkdownRender
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            return match ? (
              <CodeBlock
                {...props}
                lang={"tsx"}
                theme={
                  theme == "dark"
                    ? "github-dark-default"
                    : "github-light-default"
                }
                className={cn("not-prose")}
              >
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
        remarkPlugins={[remarkGfm]}
      >
        {String(children)}
      </MarkdownRender>
    </div>
  );
}
