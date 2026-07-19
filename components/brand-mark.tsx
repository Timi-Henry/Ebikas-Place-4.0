import Image from "next/image";

type BrandMarkProps = {
  priority?: boolean;
};

export function BrandMark({ priority = false }: BrandMarkProps) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image
        src="/ebikas-ep-logo.png"
        alt=""
        width={64}
        height={64}
        sizes="43px"
        priority={priority}
      />
    </span>
  );
}
