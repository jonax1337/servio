import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

type ButtonProps = Omit<ComponentProps<typeof Button>, "render" | "nativeButton">;

/** A shadcn/base-ui Button that navigates via next/link (renders an <a>). */
export function LinkButton({
  href,
  ...props
}: { href: string } & ButtonProps) {
  return <Button nativeButton={false} render={<Link href={href} />} {...props} />;
}
