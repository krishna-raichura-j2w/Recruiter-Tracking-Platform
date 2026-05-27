import { useEffect, useState } from "react";
import Lottie from "lottie-react";

interface LottieIconProps {
  src: string;
  size?: number;
  className?: string;
}

export function LottieIcon({ src, size = 80, className = "" }: LottieIconProps) {
  const [anim, setAnim] = useState<object | null>(null);

  useEffect(() => {
    const url = src.startsWith("/") ? `${import.meta.env.BASE_URL}${src.slice(1)}` : src;
    fetch(url).then((r) => r.json()).then(setAnim).catch(() => {});
  }, [src]);

  if (!anim) return <div style={{ width: size, height: size }} className={className} />;

  return (
    <Lottie
      animationData={anim}
      loop
      autoplay
      style={{ width: size, height: size }}
      className={className}
    />
  );
}
