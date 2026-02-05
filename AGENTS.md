# Website Development Guidelines

## Stack
- TailwindCSS + daisyUI for styling and components
- Vanilla HTML/CSS/JS only - no React or heavy frameworks
- Use Vite for dev server and builds

## Design Principles
- Dark theme by default
- Mobile-first responsive design
- Minimal dependencies, fast load times
- Prefer CSS animations over JS when possible

## Components
- Use daisyUI classes for UI components (btn, card, modal, etc.)
- Keep custom CSS minimal - leverage Tailwind utilities
- Consistent spacing: use Tailwind's spacing scale

## Performance
- Optimize images (WebP, lazy loading)
- Minimize JS - only for interactivity that CSS can't handle
- No unnecessary libraries