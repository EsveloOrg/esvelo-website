# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Start Vite dev server (hot reload)
npm run build    # Production build to dist/
npm run preview  # Preview production build locally
```

## Tech Stack

- **Styling**: TailwindCSS v4 + daisyUI v5
- **Build**: Vite v7 with @tailwindcss/vite plugin
- **Framework**: Vanilla HTML/CSS/JS (no React)
- **Theme**: Dark by default

## Architecture

Single-page marketing site with these sections:
- Navigation (fixed, with mobile hamburger menu)
- Hero
- Story
- Accelerator (services grid)
- Team
- Footer

Key files:
- `index.html` - Main page with all sections
- `src/style.css` - TailwindCSS imports + custom component styles
- `src/main.js` - Mobile menu toggle and smooth scrolling
- `vite.config.js` - Vite config with TailwindCSS plugin

## Design Guidelines

From AGENTS.md:
- Dark theme by default
- Mobile-first responsive design
- Use daisyUI classes for UI components (btn, card, modal, etc.)
- Prefer CSS animations over JS when possible
- Minimize JS - only for interactivity that CSS can't handle
- Keep custom CSS minimal - leverage Tailwind utilities

## Assets

Located in `/assets/`:
- `esvelo2.png` - White logo (for dark backgrounds)
- `esvelo-black.png` - Black logo
- `fav.png` - Favicon
- `preview.png` - OG image
- `wojtek.jpg`, `patrick.jpg` - Team photos
