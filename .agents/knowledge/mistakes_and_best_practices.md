# Best Practices & Avoidable Errors - Prompt Studio

This document serves as a persistent memory of technical challenges, common mistakes, and established best practices for the 'Prompt Studio' project. It should be referenced at the beginning of each relevant task.

## 🎞️ 1. Production Terminology
- **Terminology:** Always use **"PLANO"** instead of "ESCENA". This is the standard in high-end production environments.
- **UI Labels:** Ensure all buttons, tooltips, and headers use "PLANO".

## 📸 2. Asset Management & Image Rendering
- **Tauri v2 Asset Protocol:** Never use raw `asset://` paths with relative filenames in Scene Cards. This often fails due to strict security or missing directory context.
- **Correct Pattern:** Always resolve assets asynchronously using `AssetManager.resolveAssetUrl(fileName)` to get a safe `data:image/...` URL.
- **React Implementation:** Use a `useEffect` and a local `useState` for the resolved URL instead of synchronous `useMemo`.
- **Ref Labels:** If an image is broken, the `alt="Ref"` text will appear. Check the console for "resource not found" errors related to `asset://`.

## 🎡 3. UI Components & Layout
- **Carousel Logic:** When adding new scenes to a carousel view, ensure the total width (`carouselWidth`) is recalculated to allow correct drag constraints.
- **Space Efficiency:** Maintain a consolidated header in Scene Cards (Plano label on left, language and actions on right) to maximize vertical space for the prompt and image previews.
- **Broken Layouts during Edits:** Be extremely careful when using `multi_replace_file_content` to match full JSX tags (e.g., `<motion.div> ... </motion.div>`) to avoid leaving unterminated strings or broken containers.

## 🛠️ 4. Global Workflow
- **Clean Refs:** Always remove unused imports (`useMemo`, `useEffect`, etc.) immediately after refactoring to prevent IDE warnings.
- **Verification:** After major UI changes, always verify rendering in both Image and Video modes of the Scene Cards.
