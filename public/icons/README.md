# Icons (design source)

The SVG files in this folder are the **design source**. The app uses **inline SVGs** that match these designs. The code lives in **`src/components/Icons.tsx`**.

| File in this folder | Component in Icons.tsx | Used for |
|---------------------|------------------------|----------|
| `card-default.svg`  | `CardDefaultIcon`      | Full cards |
| `card-minimalist.svg` | `CardMinimalistIcon` | Mini cards |
| `card-artOnly.svg`  | `CardArtOnlyIcon`      | Art-only view |
| `eye-open.svg`      | `EyeOpenIcon`          | NSFW shown |
| `eye-half.svg`      | `EyeHalfIcon`          | Blurred |
| `eye-closed.svg`    | `EyeClosedIcon`        | SFW only |

## How to replace an icon

1. **Replace the SVG file** in this folder (e.g. edit `card-default.svg` or drop in a new one).
2. **Update the matching component** in `src/components/Icons.tsx`:
   - Copy the `<svg>` **viewBox** from your file (e.g. `viewBox="0 0 20 20"`).
   - Copy each **`<g>` and `<path>`** (and their `transform`, `d`, etc.) from your file.
   - Use **`stroke="currentColor"`** (and `fill="currentColor"` for filled shapes like circles) so the icon follows the theme. Use **`fill="none"`** for stroked paths. Replace any `stroke-width` with React’s **`strokeWidth={…}`** (e.g. `strokeWidth={0.9}`).
3. Save and refresh the app.

The live icons are the inline SVGs in `Icons.tsx`; this folder is only the reference.
