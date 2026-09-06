# CRAFT reader demo

Static demo reader for the supplied 44-page PDF excerpt. Original page layouts, desktop spreads, mobile single-page mode, contents, zoom and browser-local reading position.

## GitHub Pages

Publish this directory as the repository root. In Settings → Pages select Deploy from a branch and the root folder of the published branch. `.nojekyll` keeps the files unprocessed. No build command or backend is required.

For this test package the IKRA logo returns to page 1 of the excerpt. The production landing URL can be set later.

## Included files

- `index.html`, `reader.css`, `reader.js`: reader UI.
- `assets/CRAFT_test_2.pdf`: original provided excerpt, unchanged.
- Logo and fonts: existing project assets.
- `vendor/pdfjs`: Mozilla PDF.js 5.4.624, Apache-2.0 license included.

