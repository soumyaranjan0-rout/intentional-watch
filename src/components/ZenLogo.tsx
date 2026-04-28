import logo from "@/assets/zentube-logo.png";

export function ZenLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logo}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
