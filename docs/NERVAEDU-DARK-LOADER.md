# NervaEdu Dark Glow Loader

Responsive, framework-free dark loading overlay for NervaEdu. Features a navy background, cyan/blue/violet glow, orbiting rings, animated N mark, progress shimmer, accessible status text, mobile layout, and reduced-motion support.

## Preview
Open [nerva-loader-preview.html](./nerva-loader-preview.html) on GitHub Pages or serve it locally. It is a standalone preview and does not replace the app's existing entry point.

## Integration
1. Include `<link rel="stylesheet" href="/nerva-loader.css">` in the page head (adjust the path if needed).
2. Copy the loader element from the preview HTML into the app shell immediately before `</body>`.
3. Include `<script src="/nerva-loader.js"></script>` after the element.
4. Call `NervaLoader.show("Loading your courses")` when loading starts, and `NervaLoader.hide()` when the real operation finishes.

```js
NervaLoader.show("Loading your courses");
loadCourses()
  .then(renderCourses)
  .finally(function () {
    NervaLoader.hide();
  });
```

Do not use a fixed timeout in production. The preview's timer exists only to demonstrate the effect. For a framework-based app, render the component through the framework and load the CSS once.