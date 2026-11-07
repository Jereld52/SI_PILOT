import { cn, initials } from "@/lib/utils";

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  className?: string;
}

export function Avatar({ firstName, lastName, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-primary/25 text-xs font-semibold text-accent",
        className,
      )}
      aria-hidden="true"
    >
      {initials(firstName, lastName)}
    </span>
  );
}
