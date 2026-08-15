import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initials, avatarColor } from "@/lib/avatar";

/**
 * A user's avatar with a deterministic, name-derived color behind the initials.
 * Uses the profile image when present. Works in both server and client trees.
 */
export function UserAvatar({
  name,
  email,
  image,
  className,
  size = "default",
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  className?: string;
  size?: "xs" | "sm" | "default" | "lg";
}) {
  const display = name?.trim() || email?.trim() || "?";
  const style = avatarColor(name?.trim() || email?.trim());
  return (
    <Avatar size={size} className={className}>
      {image ? <AvatarImage src={image} alt={display} /> : null}
      <AvatarFallback style={style} className="font-medium text-white">
        {initials(display)}
      </AvatarFallback>
    </Avatar>
  );
}
