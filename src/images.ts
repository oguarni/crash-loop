// Branding art used by the title/boot screen and the rail badge. The files live
// in public/ and are referenced with bare-relative URLs so the build keeps
// working from GitHub Pages, itch.io, or a plain file:// open (matching the
// `base: './'` in vite.config). The heavy masters in imgs/ are gitignored;
// scripts/build-assets.sh derives these optimised copies.
export interface GameImages {
  logo: HTMLImageElement;
  avatar: HTMLImageElement;
  icon: HTMLImageElement;
}

function load(file: string): HTMLImageElement {
  const img = new Image();
  img.src = file;
  return img;
}

export const images: GameImages = {
  logo: load('logo.svg'),
  avatar: load('avatar.png'),
  icon: load('icon.svg'),
};

/** True once the bitmap has decoded and is safe to pass to drawImage. */
export function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}
