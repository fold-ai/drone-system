# Pitch deck as a page on actprove.com

Adds one public route to the existing repo: `/pitchdeck`. Nothing else changes,
and nothing is added to `public/`.

## Install

1. Copy `app/(public)/pitchdeck/` into your repo at the same path. It joins the
   public route group, so it inherits the fonts, `site.css` and the two-colour
   palette already there, and it sits outside the console gate in `middleware.ts`.

2. Commit and push. Vercel builds on push, and the deck is live at
   `https://actprove.com/pitchdeck`.

3. Optional, keep it out of crawlers. In `app/robots.ts`, add the route to the
   existing disallow list:

       disallow: ["/admin-pro", "/api/", "/pitchdeck"]

   The page already sends `robots: { index: false, follow: false }` in its own
   metadata. Leave `app/sitemap.ts` alone: the deck should not be listed.

## Read only

There is no download button and no file to download. The deck exists only as a
page, and the .pptx is never published to `public/`, so there is no URL that
serves it. Keep the .pptx as your own working copy, off the repo.

What this does and does not do: it stops the deck from being handed out as a
file. It cannot stop a reader from taking screenshots or printing the page to
PDF, because everything a browser displays it can also capture. If the content
genuinely must not leave the room, the answer is access control, not a missing
button.

## If you want it gated

You already have signed-session auth in `middleware.ts` and `lib/auth/config`.
The deck can be moved behind it, or given a lighter gate of its own: a link
with a key, `https://actprove.com/pitchdeck?k=...`, checked in middleware, so
each investor gets their own key and you can revoke one without changing the
others.

## What it is

Thirteen slides, one per screen, snapped, in the same black and white as the
site. Arrow keys, Page Up and Page Down, space and ordinary scrolling all move
between slides. A counter sits top right. Below 820px wide it stops snapping
and reads as a normal page, because on a phone a slide is often taller than the
screen. The route is static, so it costs nothing to serve.
