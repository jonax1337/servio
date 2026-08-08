"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ToneBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Tone } from "@/lib/constants";

export type ComboOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
  tone?: Tone;
  /** show a small avatar with these initials (for people) */
  avatar?: string;
  hint?: string;
};

function OptionInner({ o }: { o: ComboOption }) {
  const Icon = o.icon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {o.avatar ? (
        <Avatar className="size-5">
          <AvatarFallback className="text-[9px]">{o.avatar}</AvatarFallback>
        </Avatar>
      ) : Icon ? (
        <Icon className="size-4 text-muted-foreground" />
      ) : null}
      <span className="truncate">{o.label}</span>
      {o.hint ? (
        <span className="truncate text-xs text-muted-foreground">{o.hint}</span>
      ) : null}
    </span>
  );
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  name,
  disabled,
  className,
  size = "default",
  pending,
}: {
  options: ComboOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size={size}
              disabled={disabled}
              aria-expanded={open}
              data-pending={pending ? "" : undefined}
              className={cn(
                "w-full justify-between gap-2 rounded-md font-normal data-[pending]:opacity-70",
                !selected && "text-muted-foreground",
                className,
              )}
            />
          }
        >
          {selected ? (
            selected.tone ? (
              <ToneBadge
                meta={{ label: selected.label, tone: selected.tone, icon: selected.icon }}
                className="border-0 bg-transparent px-0"
              />
            ) : (
              <OptionInner o={selected} />
            )
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-56 rounded-md p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""}`}
                    data-checked={o.value === value}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.tone ? (
                      <ToneBadge
                        meta={{ label: o.label, tone: o.tone, icon: o.icon }}
                        className="border-0 bg-transparent px-0"
                      />
                    ) : (
                      <OptionInner o={o} />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
