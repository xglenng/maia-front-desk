# Maia Home Screen app

The public `/install` page explains installation. `/manifest.webmanifest` declares standalone display and an `/inbox` launch URL. PNG app icons are served at `/app-icon/180`, `/app-icon/192`, and `/app-icon/512`. Authentication and all business logic remain unchanged.

This is an online Home Screen web app, not an App Store binary. It has no service worker, offline cache, or push notifications. Customer messages and authenticated pages are not cached by a new offline layer.

After an approved deployment, add an **Install Maia** link on gavakatasoftware.com pointing to `https://maia-front-desk-production.up.railway.app/install`. Installation must occur on Maia's origin; adding the marketing site itself to Home Screen will not install Maia. The marketing site's hosting/access has not yet been established.

Verify on a physical iPhone: open the install URL in Safari, Share → Add to Home Screen, enable Open as Web App if offered, Add. Launch the Maia icon, sign in, verify inbox, drafts, calendar, sign out, and relaunch. Desktop checks cannot confirm actual iOS installation or standalone session persistence. No database migration is needed. Roll back by redeploying the preceding release; existing Home Screen shortcuts may remain on users' devices.
