# NervaEdu Dark Glow Loader

Responsive, framework-free dark loading overlay for NervaEdu. Features a navy background, cyan/blue/violet glow, orbiting rings, animated N mark, progress shimmer, accessible status text, mobile layout, and reduced-motion support.

## Preview
Open `/nerva-loader-preview.html` on a running NervaEdu server for the standalone preview. The live app also includes the loader overlay.

## Integration
The loader is wired into `public/index.html` and served by `server.js`. It appears while the app checks the current session, signs in, or creates an account, and hides when the real operation completes. Its CSS and JavaScript are framework-free and responsive.

```js
NervaLoader.show("Loading your courses");
loadCourses()
  .then(renderCourses)
  .finally(function () {
    NervaLoader.hide();
  });
```

Do not use a fixed timeout in production. The preview's timer exists only to demonstrate the effect. For a framework-based app, render the component through the framework and load the CSS once.