# Hello Plugin (example)

This project contains a minimal plugin artifact used by the Aggo editor for demonstration purposes.

How to use
1. Copy `dist/hello-plugin.js` to the workspace component library (e.g. `workspace/.aggo/components/hello-plugin.js`).
2. Add a registry entry (component_registry.json) mapping `hello-plugin` to the artifact path.
3. Open Aggo page editor and insert an element with `data-component='hello-plugin'` or tag `plugin` with `data-component` attribute.

The plugin expects `React` to be available in the webview environment.
