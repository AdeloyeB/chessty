'use client';

export function OAuthDivider() {
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 h-px bg-white/15" />
      <span className="text-xs font-mono text-white/30 lowercase tracking-wider">
        or
      </span>
      <div className="flex-1 h-px bg-white/15" />
    </div>
  );
}
