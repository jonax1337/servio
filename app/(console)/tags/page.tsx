import { Tags as TagsIcon, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TagCreator } from "@/components/tags/tag-creator";
import { deleteTag } from "@/lib/actions/tags";

export const metadata: Metadata = { title: "Tags" };
export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const tags = await db.tag.findMany({
    include: { _count: { select: { tickets: true } } },
    orderBy: [{ name: "asc" }],
  });

  return (
    <>
      <PageHeader
        icon={TagsIcon}
        title="Tags"
        description="Organise tickets with reusable, colour-coded labels."
      />

      <PageBody className="grid gap-4">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-medium">Create a tag</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Pick a name and colour. Tags can then be applied to any ticket.
          </p>
          <TagCreator />
        </div>

        {tags.length === 0 ? (
          <EmptyState
            icon={TagsIcon}
            title="No tags yet"
            description="Create your first tag above to start labelling tickets."
          />
        ) : (
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">All tags</h2>
              <span className="text-xs text-muted-foreground">
                {tags.length} total
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-2 rounded-full border bg-background py-1 pl-2.5 pr-1.5 text-sm"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-medium">#{tag.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {tag._count.tickets}
                  </span>
                  <form action={deleteTag}>
                    <input type="hidden" name="id" value={tag.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
