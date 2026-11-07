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
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary-strong/20 bg-primary/20 text-xs font-semibold text-primary-strong",
        className,
      )}
      aria-hidden="true"
    >
      {initials(firstName, lastName)}
    </span>
  );
}
