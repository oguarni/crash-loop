#!/usr/bin/env bash
# Regenerate the web-tracked branding assets in public/ from the art masters in
# imgs/ (which are gitignored and far too large to ship). Re-run after updating
# a master. Requires: ImageMagick (convert), pngquant, and inkscape.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public

# favicon + rail badge — the $_ shell glyph (tiny, kept as SVG)
cp imgs/02_icon.svg public/icon.svg

# wordmark for the dark UI — the transparent, light-text "t-navy" variant
# (t-bone's wordmark is navy-filled and vanishes on the navy background)
cp imgs/logo/t-navy.svg public/logo.svg

# on-call SRE portrait: downscale the 1800x2400 master, then quantise to keep
# the shipped PNG tiny (the source is a flat illustration, so it compresses hard)
tmp="$(mktemp --suffix=.png)"
convert imgs/07_avatar.png -resize x640 "PNG32:${tmp}"
pngquant --quality=60-90 --force --output public/avatar.png "${tmp}"
rm -f "${tmp}"

# 180px PNG app icon for iOS home-screen installs
inkscape public/icon.svg -w 180 -o public/icon-180.png >/dev/null 2>&1 \
  || convert -background none -density 220 public/icon.svg -resize 180x public/icon-180.png

echo "public/ assets regenerated:"
ls -la public/
