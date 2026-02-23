# StratusCode Design System Documentation

## Overview
StratusCode embodies a sophisticated, premium design language that balances minimalism with rich visual depth. The design emphasizes subtle textures, organic curves, and a refined color palette that creates an atmosphere of intelligent elegance.

## Core Design Philosophy

### Visual Principles
- **Subtle Sophistication**: Every element feels intentional and refined
- **Organic Softness**: Rounded corners and smooth curves create approachable interfaces
- **Layered Depth**: Multiple background textures and overlays create visual richness
- **Premium Materials**: Glass effects, subtle gradients, and fine textures suggest quality

### Interaction Philosophy
- **Smooth Transitions**: All state changes use carefully choreographed animations
- **Responsive Feedback**: Hover states and micro-interactions provide immediate response
- **Progressive Disclosure**: Information reveals itself through thoughtful animation sequences

## Color System

### Light Theme Palette
```css
--background: #faf9f6;          /* Warm off-white base */
--foreground: #0c0c0c;          /* Near-black for high contrast */
--primary: #0c0c0c;             /* Same as foreground for consistency */
--secondary: #f0ede8;           /* Soft warm gray */
--muted: #eae7e1;              /* Light warm gray */
--accent: #c4b5a3;              /* Warm taupe accent */
--border: #e2dfd8;             /* Soft border color */
--input: #ffffff;              /* Pure white for inputs */
--grid-color: rgba(180, 175, 165, 0.12); /* Subtle grid lines */
```

### Dark Theme Palette
```css
--background: #09090b;          /* Deep blue-black */
--foreground: #fafaf9;          /* Warm white */
--primary: #fafaf9;             /* Same as foreground */
--secondary: #18181b;           /* Dark gray */
--muted: #27272a;              /* Medium gray */
--accent: #44403c;             /* Warm gray accent */
--border: #2a2927;             /* Dark border */
--input: #18181b;              /* Dark input background */
--grid-color: rgba(60, 58, 53, 0.15); /* Dark grid lines */
```

### Color Usage Guidelines
- **Primary**: Used for main CTAs, important text, and key interactive elements
- **Secondary**: Backgrounds for cards, panels, and content areas
- **Muted**: Subtle backgrounds, disabled states, and secondary information
- **Accent**: Highlights, badges, status indicators, and subtle emphasis

## Typography System

### Font Stack
```css
font-family-sans: "DM Sans", system-ui, sans-serif;
font-family-serif: "Instrument Serif", Georgia, serif;
font-family-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
```

### Typography Hierarchy
- **Display**: 6rem (96px) - Hero headings with tightest letter-spacing (-0.03em)
- **Display Small**: 4rem (64px) - Large section headings
- **Headings**: Use serif font for premium feel, especially in hero sections
- **Body**: DM Sans for clean, readable body text
- **Code**: JetBrains Mono for technical content

### Letter Spacing
- **Tightest**: -0.04em for display text
- **Tight**: -0.02em for large headings
- **Normal**: Default for body text

## Border Radius System

### Rounded Elements
- **Small Elements**: `rounded-lg` (8px) - Buttons, inputs, small cards
- **Medium Elements**: `rounded-xl` (12px) - Feature cards, panels
- **Large Elements**: `rounded-2xl` (16px) - Main containers, navigation
- **Pill Elements**: `rounded-full` - Pills, badges, CTA buttons
- **Hero Elements**: `rounded-3xl` (24px) - Special hero containers

### Special Cases
- **Dark Input Areas**: `rounded-[1.25rem]` (20px) - Chat input areas
- **Logo Container**: `rounded-lg` (8px) - Logo backgrounds

## Visual Textures & Patterns

### Background Patterns
1. **Grid Pattern**: Subtle 48px grid for structure
   ```css
   background-image: 
     linear-gradient(var(--grid-color) 1px, transparent 1px),
     linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
   background-size: 48px 48px;
   ```

2. **Dot Pattern**: 24px radial dots for sections
   ```css
   background-image: radial-gradient(circle, var(--grid-color) 1px, transparent 1px);
   background-size: 24px 24px;
   ```

3. **Noise Texture**: SVG-based noise overlay for organic feel
   ```css
   background-image: url("data:image/svg+xml,%3Csvg...");
   mix-blend-mode: multiply;
   opacity: 0.04;
   ```

### Gradient Effects
1. **Hero Glow**: Multi-layer radial gradients for depth
   ```css
   background: 
     radial-gradient(ellipse 70% 50% at 50% 35%, rgba(196, 181, 163, 0.18), transparent),
     radial-gradient(ellipse 40% 30% at 25% 60%, rgba(196, 181, 163, 0.06), transparent),
     radial-gradient(ellipse 40% 30% at 75% 70%, rgba(196, 181, 163, 0.06), transparent);
   ```

2. **Vignette**: Subtle edge darkening for focus
   ```css
   background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.03) 100%);
   ```

## Glass Effects & Transparency

### Premium Glass
```css
.glass {
  background: rgba(250, 249, 246, 0.7);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
}

.dark .glass {
  background: rgba(9, 9, 11, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### Navigation Glass
```css
.nav-premium {
  background: rgba(250, 249, 246, 0.55);
  backdrop-filter: blur(40px) saturate(1.5);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 
    0 1px 0 rgba(255, 255, 255, 0.5) inset,
    0 4px 30px rgba(0, 0, 0, 0.03);
}
```

## Shadow System

### Subtle Shadows
- **Small Elements**: `shadow-sm` - 0 1px 2px rgba(0, 0, 0, 0.05)
- **Medium Elements**: `shadow-md` - 0 4px 6px rgba(0, 0, 0, 0.07)
- **Large Elements**: `shadow-lg` - 0 10px 15px rgba(0, 0, 0, 0.1)

### Premium Shadows
- **Dark Input Areas**: Multi-layer shadows for depth
  ```css
  box-shadow: 
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 2px 4px rgba(0, 0, 0, 0.08),
    0 12px 40px rgba(0, 0, 0, 0.2),
    0 40px 80px -20px rgba(0, 0, 0, 0.3);
  ```

- **Glow Effects**: Subtle colored glows for emphasis
  ```css
  box-shadow: 0 0 20px rgba(12, 12, 12, 0.08);
  ```

## Animation System

### Core Animations
```css
@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes fadeInUp {
  0% { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Animation Classes
- **fade-in**: 0.3s ease-out for simple appearances
- **fade-in-up**: 0.5s ease-out for content rising up
- **slide-up**: 0.3s ease-out for quick upward motion
- **pulse-subtle**: 2s ease-in-out infinite for gentle pulsing
- **shimmer**: 2s ease-in-out infinite for loading states

### Staggered Animations
Hero content uses staggered delays for elegant sequential reveals:
- Badge: 0s delay
- Heading: 0.1s delay
- Subtext: 0.2s delay
- CTAs: 0.25s delay

## Component Design Patterns

### Navigation
- **Floating Pill**: Fixed navigation with glass background
- **Rounded Logo**: Logo in rounded container with subtle shadow
- **Hover States**: Gentle background color shifts and transforms

### Buttons
- **Primary CTA**: Full foreground color with rounded-full shape
- **Secondary**: Border-based with hover fill
- **Hover Lift**: Subtle upward movement on hover
- **Icon Integration**: Icons that transform on hover

### Cards & Panels
- **Rounded Corners**: Consistent rounded-xl for content cards
- **Subtle Borders**: Low-opacity borders for definition
- **Background Layers**: Multiple texture overlays
- **Hover Effects**: Transform and shadow changes

### Input Areas
- **Dark Theme**: Special dark input areas with premium shadows
- **Glass Effect**: Backdrop blur for modern feel
- **Hover States**: Elevation changes on interaction
- **Focus States**: Subtle ring effects

## Layout Patterns

### Hero Sections
- **Layered Backgrounds**: Grid pattern + glow effects + decorative orbs
- **Centered Content**: Max-width containers with generous padding
- **Vertical Rhythm**: Consistent spacing using 8px grid
- **Ornamental Elements**: Horizontal line accents and blurred shapes

### Content Sections
- **Grid Systems**: 12-column grid with responsive breakpoints
- **Spacing**: Generous white space for breathing room
- **Hierarchy**: Clear visual hierarchy through size and color

## Responsive Design

### Breakpoints
- **Mobile**: Default styles with touch-optimized interactions
- **Tablet**: md: breakpoint for medium screens
- **Desktop**: lg: breakpoint for large screens
- **Large Desktop**: xl: breakpoint for extra large screens

### Mobile Considerations
- **Touch Targets**: Minimum 44px tap targets
- **Reduced Motion**: Respect prefers-reduced-motion
- **Hover Disabling**: Disable hover lift on touch devices

## Implementation Guidelines

### CSS Custom Properties
All colors and spacing use CSS custom properties for theme switching and maintainability.

### Component Structure
- **Base Styles**: Tailwind utilities for consistency
- **Custom Classes**: Utility-first approach with custom CSS for complex effects
- **Theme Switching**: Class-based dark mode with comprehensive variable overrides

### Performance Considerations
- **Optimized Animations**: Use transform and opacity for smooth 60fps
- **Backdrop Filters**: Use sparingly due to performance impact
- **SVG Textures**: Inline SVGs for noise patterns to avoid additional requests

## Design Tokens

### Spacing
- **Base Unit**: 4px (0.25rem)
- **Component Padding**: 1rem (16px) to 2rem (32px)
- **Section Spacing**: 4rem (64px) to 8rem (128px)
- **Grid Spacing**: 48px for background patterns

### Sizing
- **Border Radius**: 8px, 12px, 16px, 20px, full
- **Icon Sizes**: 16px, 20px, 24px, 32px
- **Container Max-Width**: 4xl (896px), 5xl (1024px), 7xl (1280px)

### Z-Index Scale
- **Base**: 0-10 for normal content
- **Overlays**: 20-40 for modals and dropdowns
- **Navigation**: 50 for fixed headers
- **Tooltips**: 60 for tooltips and popovers

## Accessibility Considerations

### Color Contrast
- All text meets WCAG AA contrast ratios
- Interactive elements have enhanced contrast on hover/focus
- Dark theme maintains readability with warm whites

### Motion & Animation
- Respects `prefers-reduced-motion` setting
- Provides meaningful transitions without causing motion sickness
- Uses appropriate timing functions for natural movement

### Focus States
- Visible focus indicators on all interactive elements
- Keyboard navigation support throughout
- Logical tab order maintained

## Brand Elements

### Logo Usage
- **Primary**: Dark logo on light backgrounds
- **Inverse**: Light logo on dark backgrounds
- **Sizing**: Maintain consistent proportions
- **Spacing**: Minimum clear space equal to logo height

### Voice & Tone
- **Sophisticated**: Intelligent and refined language
- **Approachable**: Warm and welcoming tone
- **Confident**: Clear, direct communication
- **Premium**: Emphasizes quality and attention to detail

## Usage Examples

### Hero Section Implementation
```jsx
<section className="relative overflow-hidden vignette">
  <div className="absolute inset-0 grid-pattern opacity-[0.35]" />
  <div className="absolute inset-0 hero-glow" />
  <div className="absolute top-10 -left-40 w-[500px] h-[500px] rounded-full bg-accent/[0.08] blur-[120px]" />
  
  <div className="relative max-w-5xl mx-auto px-6 pt-32 pb-8 text-center">
    <h1 className="font-serif text-[6.5rem] font-normal tracking-tightest leading-[0.95] animate-fade-in-up">
      Your headline here
    </h1>
  </div>
</section>
```

### Premium Card Implementation
```jsx
<div className="dark-input-area">
  <div className="relative z-10">
    <h3 className="text-lg font-medium mb-2">Card Title</h3>
    <p className="text-muted-foreground">Card content goes here</p>
  </div>
</div>
```

### Glass Navigation Implementation
```jsx
<nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl">
  <div className="nav-premium rounded-2xl px-4 py-2.5 flex items-center justify-between">
    {/* Navigation content */}
  </div>
</nav>
```

This design system provides a comprehensive foundation for building sophisticated, premium web applications that embody the StratusCode aesthetic of intelligent elegance and refined sophistication.
