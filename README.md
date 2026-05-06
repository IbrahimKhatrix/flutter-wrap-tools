# Flutter Wrap & Unwrap

Fast keyboard-driven widget wrapping and unwrapping for Flutter.

## Features

- Wrap with `child:` (Alt + W)
- Wrap with `children:` (Alt + Z)
- Smart unwrap:
  - `child` → extracted
  - `children (1)` → promoted
  - `children (many)` → removed

## Examples

Before:
Form(
  child: Column(
    children: [Text()],
  ),
)

After unwrap:
Form(
  child: Text(),
)

## Shortcuts

| Action | Shortcut |
|--------|--------|
| Wrap (child) | Alt + C |
| Wrap (children) | Alt + Z |
| Unwrap | Alt + X |