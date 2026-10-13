# Demo HTML v13

Adaptation of the approved v13 HTML book from the completed reader-access-v7-r11 source (release 2d083baaf956). The active v7-r12 watermark/access work is untouched.

The public excerpt is the same original pages 16–25 as the September demo: chapter cover through «Пример из практики». The source text, styled spans, NBSP typography, notes, table and diagrams are unchanged. Pagination now responds to viewport and font size. Only these ten source pages and their linked one-page pyramid template are physically included; no full-book bundle is published.

Own-world details inherited from the source reader: Onest, CRAFT purple, original chapter cover, original IKRA mark, white reading surface. Existing public demo installation guide, QR links and offline workflow are retained. Paid login, licence, device limit and watermark mechanisms are not part of the public demo.

Legacy /demo#page=1–10 links map to original source pages 16–25. The parent iframe protocol retains the existing demo book id. End-of-demo and links to omitted chapters offer the full book, without exposing omitted content.

Raster provenance: chapter cover from the user's approved v13 embedded book; IKRA logo and favicon from reader-access-v7-r11/web; installation characters and ten page QR images reused from the previously published v12 public demo. No generated or edited illustrations.

Build: node scripts/build-craft-demo-html-v13.mjs
Verification: node scripts/craft-demo-html-v13/verify.mjs
