import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
  placeholder?: string;
  blurDataURL?: string;
};

/** next/image replacement: a plain <img> (no optimizer in the SPA). */
export default function Image({ src, fill, priority: _p, quality: _q, unoptimized: _u, placeholder: _ph, blurDataURL: _b, style, alt, ...rest }: Props) {
  const s = typeof src === "string" ? src : src.src;
  return (
    <img
      src={s}
      alt={alt ?? ""}
      loading={rest.loading ?? "lazy"}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
      {...rest}
    />
  );
}
