export function ActorAvatar({ id, size = "md" }: { id: string; size?: "sm" | "md" | "lg" }) {
  const variant = avatarVariant(id);
  return (
    <span className={clsx("actor-avatar", `avatar-${size}`, `avatar-${variant}`)} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <circle className="avatar-bg" cx="24" cy="24" r="22" />
        <path d="M15 26c3-8 9-12 18-12 2 8-2 16-10 20-3-2-6-4-8-8Z" />
        {variant === "chen" && <path className="cut" d="M18 24h13" />}
        {variant === "orion" && <path className="cut" d="M24 19l5 5" />}
        {variant === "forge" && <path className="cut" d="M19 23h12M24 16l-3 17" />}
        {variant === "atlas" && <path className="cut" d="M18 28c5 0 10-3 14-9" />}
        <circle className="accent" cx={variant === "lin" ? 31 : 33} cy={variant === "guest" ? 31 : 16} r="3" />
      </svg>
    </span>
  );
}

export function avatarVariant(id: string) {
  if (id.includes("lin")) return "lin";
  if (id.includes("chen")) return "chen";
  if (id.includes("orion")) return "orion";
  if (id.includes("forge")) return "forge";
  if (id.includes("atlas")) return "atlas";
  return "guest";
}
import clsx from "clsx";
